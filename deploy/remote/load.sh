#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

readonly CONFIG_FILE="${OPENLIST_DEPLOY_CONFIG:-/root/.config/openlist-storage-deploy.env}"
readonly MINIO_ENV_FILE="${MINIO_ENV_FILE:-/root/.config/openlist-minio.env}"
readonly LOG_DIR="${OPENLIST_DEPLOY_LOG_DIR:-/var/log/openlist-storage-deploy}"
readonly LOG_FILE="${LOG_DIR}/load.log"
readonly NGINX_CONFIG_FILE="${OPENLIST_NGINX_CONFIG:-/etc/nginx/conf.d/openlist-storage.conf}"

mkdir -p "$LOG_DIR"
chmod 0750 "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

log() {
  printf '%s [%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$1" "$2"
}

on_error() {
  local exit_code=$?
  log ERROR "Command failed at line ${BASH_LINENO[0]} with exit code ${exit_code}."
  exit "$exit_code"
}
trap on_error ERR

AUTH_HEADER_FILE=""
CLOUDFLARE_HEADER_FILE=""
cleanup() {
  [[ -z "$AUTH_HEADER_FILE" ]] || rm -f "$AUTH_HEADER_FILE"
  [[ -z "$CLOUDFLARE_HEADER_FILE" ]] || rm -f "$CLOUDFLARE_HEADER_FILE"
}
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    log ERROR "Required command is missing: $1"
    exit 1
  }
}

require_file() {
  [[ -r "$1" ]] || {
    log ERROR "Required configuration file is missing or unreadable: $1"
    exit 1
  }
  local mode
  mode="$(stat -c '%a' "$1")"
  [[ "$mode" == "600" ]] || {
    log ERROR "Configuration file must have mode 600: $1 (current: $mode)"
    exit 1
  }
}

install_dependencies() {
  local missing=()
  command -v curl >/dev/null 2>&1 || missing+=(curl)
  command -v jq >/dev/null 2>&1 || missing+=(jq)
  command -v nginx >/dev/null 2>&1 || missing+=(nginx)
  command -v docker >/dev/null 2>&1 || missing+=(docker.io)
  ((${#missing[@]} == 0)) && return
  log INFO "Installing missing deployment dependencies: ${missing[*]}."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing[@]}"
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y "${missing[@]/docker.io/docker}"
  elif command -v yum >/dev/null 2>&1; then
    yum install -y "${missing[@]/docker.io/docker}"
  else
    log ERROR "Install curl and jq, then run this command again."
    exit 1
  fi
  command -v docker >/dev/null 2>&1 && systemctl enable --now docker >/dev/null 2>&1 || true
}

install_dependencies
for command_name in curl docker getent jq nginx ss stat tee lsblk df; do
  require_command "$command_name"
done
require_file "$CONFIG_FILE"
require_file "$MINIO_ENV_FILE"

# shellcheck disable=SC1090
source "$CONFIG_FILE"
# shellcheck disable=SC1090
source "$MINIO_ENV_FILE"

: "${OPENLIST_URL:?OPENLIST_URL is required}"
: "${OPENLIST_TOKEN:?OPENLIST_TOKEN is required}"
: "${DATA_DIR:=/opt/openlist_file}"
: "${WEBDAV_USER:?WEBDAV_USER is required}"
: "${WEBDAV_PASSWORD:?WEBDAV_PASSWORD is required}"
: "${WEBDAV_ENDPOINT:=}"
: "${WEBDAV_MOUNT_PATH:=}"
: "${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}"
: "${S3_ENDPOINT:=}"
: "${S3_MOUNT_PATH:=}"
: "${S3_BUCKET:=default}"
: "${S3_REGION:=openlist}"
: "${S3_SIGN_URL_EXPIRE:=4}"
: "${PUBLIC_IP:=}"
: "${NGINX_WEBROOT:=/var/www/openlist-storage}"
: "${WEBDAV_PROXY_PATH:=/webdav}"
: "${CERTBOT_EMAIL:=}"
: "${CERTBOT_CERT_NAME:=openlist-storage}"
: "${CERTBOT_AUTO_ISSUE:=true}"
: "${WEBDAV_LISTEN_PORT:=8080}"
: "${MINIO_API_PORT:=9000}"
: "${MINIO_CONSOLE_PORT:=9001}"
: "${CLOUDFLARE_API_TOKEN:=${CF_API_TOKEN:-}}"
: "${CLOUDFLARE_ROOT_DOMAIN:=${CF_ROOT_DOMAIN:-}}"
: "${CLOUDFLARE_AUTO_DNS:=true}"
: "${CLOUDFLARE_SUBDOMAIN_PREFIX:=cloudfs-ser}"
: "${CLOUDFLARE_RECORD_TTL:=60}"
: "${CLOUDFLARE_PROXIED:=false}"
: "${CLOUDFLARE_DNS_WAIT_SECONDS:=90}"
: "${FIREWALL_MANAGE:=true}"

S3_ENDPOINT_CONFIGURED="$S3_ENDPOINT"
WEBDAV_ENDPOINT_CONFIGURED="$WEBDAV_ENDPOINT"

resolve_public_ip() {
  local candidate=""
  local service
  [[ -n "$PUBLIC_IP" ]] && { printf '%s\n' "$PUBLIC_IP"; return; }
  for service in "https://ifconfig.me/ip" "https://api.ipify.org" "https://ip.sb" "https://icanhazip.com"; do
    candidate="$(curl --silent --show-error --max-time 5 "$service" 2>/dev/null | tr -d '[:space:]')" || true
    [[ "$candidate" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] && { printf '%s\n' "$candidate"; return; }
  done
  return 1
}

cloudflare_domain() {
  local prefix fingerprint digits node_name
  prefix="$(printf '%s' "$CLOUDFLARE_SUBDOMAIN_PREFIX" | tr -cd 'a-z0-9-')"
  node_name="$(hostname -s | tr -cd 'A-Za-z0-9._-')"
  fingerprint="$(printf '%s' "$PUBLIC_IP" | sha256sum | cut -c1-12)"
  digits="$(printf '%s' "${PUBLIC_IP}_${node_name}" | sha256sum | tr -dc '0-9' | head -c 10)"
  while ((${#digits} < 10)); do digits+="0"; done
  [[ -n "$prefix" && -n "$node_name" ]] || return 1
  printf '%s%s-%s.%s\n' "$prefix" "$digits" "$fingerprint" "$CLOUDFLARE_ROOT_DOMAIN"
}

cloudflare_request() {
  curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 45 \
    --header "@${CLOUDFLARE_HEADER_FILE}" --header 'Content-Type: application/json' "$@"
}

wait_for_dns() {
  local domain="$1" addresses attempt attempts
  attempts=$((CLOUDFLARE_DNS_WAIT_SECONDS / 5))
  ((attempts > 0)) || attempts=1
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    addresses="$(getent ahostsv4 "$domain" 2>/dev/null | awk '{print $1}' | sort -u)"
    if grep -Fqx "$PUBLIC_IP" <<<"$addresses"; then
      log INFO "Cloudflare DNS record for ${domain} resolves to ${PUBLIC_IP}."
      return 0
    fi
    sleep 5
  done
  log ERROR "Timed out waiting for ${domain} to resolve to ${PUBLIC_IP}."
  return 1
}

configure_cloudflare_dns() {
  local domain="$1" zone_response zone_id record_response record_id payload response
  [[ -n "$CLOUDFLARE_API_TOKEN" && -n "$CLOUDFLARE_ROOT_DOMAIN" ]] || return 1
  [[ "$CLOUDFLARE_PROXIED" == "true" || "$CLOUDFLARE_PROXIED" == "false" ]] || {
    log ERROR "CLOUDFLARE_PROXIED must be true or false."
    return 1
  }
  [[ "$CLOUDFLARE_RECORD_TTL" =~ ^[0-9]+$ ]] || {
    log ERROR "CLOUDFLARE_RECORD_TTL must be numeric."
    return 1
  }

  CLOUDFLARE_HEADER_FILE="$(mktemp /tmp/openlist-cloudflare-auth.XXXXXX)"
  chmod 0600 "$CLOUDFLARE_HEADER_FILE"
  printf 'Authorization: Bearer %s\n' "$CLOUDFLARE_API_TOKEN" >"$CLOUDFLARE_HEADER_FILE"

  if ! zone_response="$(cloudflare_request --get --data-urlencode "name=${CLOUDFLARE_ROOT_DOMAIN}" 'https://api.cloudflare.com/client/v4/zones')"; then
    log ERROR "Could not look up the Cloudflare zone for ${CLOUDFLARE_ROOT_DOMAIN}."
    return 1
  fi
  zone_id="$(jq -r '.result[0].id // empty' <<<"$zone_response")"
  [[ -n "$zone_id" ]] || { log ERROR "Cloudflare did not return a writable zone for ${CLOUDFLARE_ROOT_DOMAIN}."; return 1; }

  if ! record_response="$(cloudflare_request --get --data-urlencode 'type=A' --data-urlencode "name=${domain}" "https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records")"; then
    log ERROR "Could not look up the Cloudflare DNS record for ${domain}."
    return 1
  fi
  record_id="$(jq -r '.result[0].id // empty' <<<"$record_response")"
  payload="$(jq -cn --arg name "$domain" --arg content "$PUBLIC_IP" --argjson ttl "$CLOUDFLARE_RECORD_TTL" --argjson proxied "$CLOUDFLARE_PROXIED" '{type:"A",name:$name,content:$content,ttl:$ttl,proxied:$proxied}')"

  if [[ -n "$record_id" ]]; then
    log INFO "Updating the Cloudflare A record for ${domain}."
    response="$(cloudflare_request --request PUT --data-binary @- "https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records/${record_id}" <<<"$payload")" || return 1
  else
    log INFO "Creating the Cloudflare A record for ${domain}."
    response="$(cloudflare_request --request POST --data-binary @- "https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records" <<<"$payload")" || return 1
  fi
  [[ "$(jq -r '.success // false' <<<"$response")" == "true" ]] || { log ERROR "Cloudflare rejected the DNS update."; return 1; }
  wait_for_dns "$domain"
}

if PUBLIC_IP="$(resolve_public_ip)"; then
  log INFO "Resolved public IPv4 address ${PUBLIC_IP}."
elif [[ -z "$S3_ENDPOINT" || -z "$WEBDAV_ENDPOINT" ]]; then
  log ERROR "Could not resolve a public IPv4 address for automatic endpoint configuration."
  exit 1
else
  log WARN "Could not resolve the public IPv4 address; using configured endpoints."
fi

if [[ -z "$S3_ENDPOINT_CONFIGURED" && -z "$WEBDAV_ENDPOINT_CONFIGURED" && "$CLOUDFLARE_AUTO_DNS" == "true" && -n "$CLOUDFLARE_API_TOKEN" && -n "$CLOUDFLARE_ROOT_DOMAIN" ]]; then
  if AUTO_PUBLIC_DOMAIN="$(cloudflare_domain)" && configure_cloudflare_dns "$AUTO_PUBLIC_DOMAIN"; then
    S3_ENDPOINT="https://${AUTO_PUBLIC_DOMAIN}"
    WEBDAV_ENDPOINT="https://${AUTO_PUBLIC_DOMAIN}${WEBDAV_PROXY_PATH}"
    log INFO "Using the automatically provisioned HTTPS endpoint ${AUTO_PUBLIC_DOMAIN}."
  else
    log WARN "Cloudflare DNS setup failed; falling back to the public IP endpoints."
  fi
fi
S3_ENDPOINT="${S3_ENDPOINT:-http://${PUBLIC_IP}}"
WEBDAV_ENDPOINT="${WEBDAV_ENDPOINT:-http://${PUBLIC_IP}${WEBDAV_PROXY_PATH}}"

[[ "$OPENLIST_URL" =~ ^https?:// ]] || { log ERROR "OPENLIST_URL must use HTTP or HTTPS."; exit 1; }
[[ "$WEBDAV_ENDPOINT" =~ ^https?:// ]] || { log ERROR "WEBDAV_ENDPOINT must use HTTP or HTTPS."; exit 1; }
[[ "$S3_ENDPOINT" =~ ^https?:// ]] || { log ERROR "S3_ENDPOINT must use HTTP or HTTPS."; exit 1; }
[[ "$S3_SIGN_URL_EXPIRE" =~ ^[1-9][0-9]*$ ]] || { log ERROR "S3_SIGN_URL_EXPIRE must be a positive number of hours."; exit 1; }
[[ "$WEBDAV_PROXY_PATH" =~ ^/[A-Za-z0-9._-]+$ ]] || { log ERROR "WEBDAV_PROXY_PATH must be one URL path segment, such as /webdav."; exit 1; }

PUBLIC_SERVER_NAME="${S3_ENDPOINT#*://}"
PUBLIC_SERVER_NAME="${PUBLIC_SERVER_NAME%%/*}"
PUBLIC_SERVER_NAME="${PUBLIC_SERVER_NAME%%:*}"
[[ -n "$PUBLIC_SERVER_NAME" ]] || { log ERROR "S3_ENDPOINT must include a host name or IP address."; exit 1; }

AUTH_HEADER_FILE="$(mktemp /tmp/openlist-storage-auth.XXXXXX)"
chmod 0600 "$AUTH_HEADER_FILE"
printf 'Authorization: %s\n' "$OPENLIST_TOKEN" >"$AUTH_HEADER_FILE"

api_request() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"
  local args=(
    --fail-with-body --silent --show-error
    --connect-timeout 10 --max-time 60
    --retry 3 --retry-delay 2 --retry-all-errors
    --request "$method"
    --header "@${AUTH_HEADER_FILE}"
    --header "Content-Type: application/json"
  )
  if [[ -n "$payload" ]]; then
    curl "${args[@]}" --data-binary @- "${OPENLIST_URL}${path}" <<<"$payload"
  else
    curl "${args[@]}" "${OPENLIST_URL}${path}"
  fi
}

require_success() {
  local response="$1"
  local operation="$2"
  local code message
  code="$(jq -r '.code // 500' <<<"$response")"
  message="$(jq -r '.message // "unknown OpenList error"' <<<"$response")"
  if [[ "$code" != "200" ]]; then
    log ERROR "${operation} failed: ${message}"
    return 1
  fi
}

storage_payload() {
  local driver="$1"
  local mount_path="$2"
  local addition="$3"
  local web_proxy="$4"
  local storage_id="${5:-0}"
  jq -cn \
    --argjson id "$storage_id" \
    --arg driver "$driver" \
    --arg mount_path "$mount_path" \
    --arg addition "$addition" \
    --argjson web_proxy "$web_proxy" \
    '{
      id: $id,
      mount_path: $mount_path,
      order: 0,
      driver: $driver,
      cache_expiration: 30,
      custom_cache_policies: "",
      status: "",
      addition: $addition,
      remark: "Managed by /root/load.sh",
      disabled: false,
      disable_index: false,
      enable_sign: false,
      order_by: "",
      order_direction: "",
      extract_folder: "",
      web_proxy: $web_proxy,
      webdav_policy: (if $web_proxy then "native_proxy" else "302_redirect" end),
      proxy_range: false,
      down_proxy_url: "",
      disable_proxy_sign: false
    }'
}

register_storage() {
  local driver="$1"
  local mount_path="$2"
  local addition="$3"
  local web_proxy="$4"
  local list_response storage_id endpoint payload response

  list_response="$(api_request GET '/api/admin/storage/list?page=1&per_page=0')"
  require_success "$list_response" "List storages"
  storage_id="$(jq -r --arg path "$mount_path" '.data.content[]? | select(.mount_path == $path) | .id' <<<"$list_response" | head -n 1)"

  if [[ -n "$storage_id" ]]; then
    endpoint="/api/admin/storage/update"
    payload="$(storage_payload "$driver" "$mount_path" "$addition" "$web_proxy" "$storage_id")"
    log INFO "Updating ${driver} storage at ${mount_path} (id=${storage_id})."
  else
    endpoint="/api/admin/storage/create"
    payload="$(storage_payload "$driver" "$mount_path" "$addition" "$web_proxy")"
    log INFO "Creating ${driver} storage at ${mount_path}."
  fi

  response="$(api_request POST "$endpoint" "$payload")"
  require_success "$response" "Register ${driver} storage"
  log INFO "OpenList storage is registered at ${mount_path}."
}

remove_container() {
  local name="$1"
  if docker container inspect "$name" >/dev/null 2>&1; then
    log INFO "Removing existing container ${name}."
    docker rm --force "$name" >/dev/null
  fi
}

wait_for_minio() {
  local status
  for _ in $(seq 1 24); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' openlist-minio)"
    case "$status" in
      healthy) log INFO "MinIO health check passed."; return 0 ;;
      unhealthy) log ERROR "MinIO health check failed."; docker logs --tail 40 openlist-minio; return 1 ;;
    esac
    sleep 5
  done
  log ERROR "Timed out waiting for MinIO to become healthy."
  docker logs --tail 40 openlist-minio
  return 1
}

prepare_data_dir() {
  install -d -m 0750 "$DATA_DIR"
  chmod 0750 "$DATA_DIR"
}

storage_size() {
  df -hP "$DATA_DIR" | awk 'NR == 2 { print $2 }'
}

default_mount_path() {
  local driver_label="$1"
  local node_name capacity
  node_name="$(hostname -s | tr -cd 'A-Za-z0-9._-')"
  capacity="$(storage_size)"
  [[ -n "$node_name" && -n "$capacity" ]] || { log ERROR "Could not derive the default storage mount path."; return 1; }
  printf '/cloud/%s_%s_%s\n' "$node_name" "$capacity" "$driver_label"
}

check_and_mount_disk() {
  local disk selected mount_points child_partitions uuid
  local candidates=()
  log INFO "Scanning for unused whole disks that can be mounted at ${DATA_DIR}."
  while read -r disk; do
    [[ -n "$disk" ]] || continue
    mount_points="$(lsblk -nrpo MOUNTPOINT "/dev/${disk}" | awk 'NF' || true)"
    child_partitions="$(lsblk -nlo TYPE "/dev/${disk}" | grep -x part || true)"
    [[ -z "$mount_points" && -z "$child_partitions" ]] && candidates+=("$disk")
  done < <(lsblk -nd -o NAME,TYPE | awk '$2 == "disk" { print $1 }')

  if ((${#candidates[@]} == 0)); then
    log INFO "No unused whole disks were found; ${DATA_DIR} will remain on its current filesystem."
    return
  fi
  printf 'Unused whole disks: %s\n' "${candidates[*]}" >&2
  read -r -p "Format and mount one at ${DATA_DIR}? [y/N]: " selected </dev/tty
  [[ "$selected" =~ ^[Yy]$ ]] || { log INFO "Disk formatting was skipped."; return; }
  read -r -p "Disk name to use (for example vdb): " selected </dev/tty
  [[ " ${candidates[*]} " == *" ${selected} "* ]] || { log ERROR "${selected} is not an unused whole disk."; return 1; }
  log WARN "Formatting /dev/${selected} as ext4 after interactive confirmation."
  mkfs.ext4 -F "/dev/${selected}"
  install -d -m 0750 "$DATA_DIR"
  mount "/dev/${selected}" "$DATA_DIR"
  uuid="$(blkid -s UUID -o value "/dev/${selected}")"
  grep -q "UUID=${uuid}[[:space:]]\+${DATA_DIR}[[:space:]]" /etc/fstab || printf 'UUID=%s %s ext4 defaults,nofail 0 2\n' "$uuid" "$DATA_DIR" >>/etc/fstab
  log INFO "Mounted /dev/${selected} at ${DATA_DIR} and recorded it in /etc/fstab."
}

has_certificate() {
  [[ -f "/etc/letsencrypt/live/${CERTBOT_CERT_NAME}/fullchain.pem" ]] && [[ -f "/etc/letsencrypt/live/${CERTBOT_CERT_NAME}/privkey.pem" ]]
}

ensure_public_firewall() {
  [[ "$FIREWALL_MANAGE" == "true" ]] || return 0
  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
    ufw allow 80/tcp comment 'OpenList storage HTTP proxy' >/dev/null
    ufw allow 443/tcp comment 'OpenList storage HTTPS proxy' >/dev/null
    log INFO "Allowed the public Nginx HTTP and HTTPS ports through UFW."
  elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd --permanent --add-service=http >/dev/null
    firewall-cmd --permanent --add-service=https >/dev/null
    firewall-cmd --reload >/dev/null
    log INFO "Allowed the public Nginx HTTP and HTTPS ports through firewalld."
  else
    log INFO "No active host firewall manager was detected."
  fi
}

container_host_port() {
  local name="$1" container_port="$2" binding
  binding="$(docker port "$name" "${container_port}/tcp" 2>/dev/null | head -n 1 || true)"
  [[ -n "$binding" ]] || return 1
  printf '%s\n' "${binding##*:}"
}

sync_existing_container_ports() {
  local port
  port="$(container_host_port openlist-webdav 8080 || true)"
  [[ -z "$port" ]] || WEBDAV_LISTEN_PORT="$port"
  port="$(container_host_port openlist-minio 9000 || true)"
  [[ -z "$port" ]] || MINIO_API_PORT="$port"
  port="$(container_host_port openlist-minio 9001 || true)"
  [[ -z "$port" ]] || MINIO_CONSOLE_PORT="$port"
}

find_free_loopback_port() {
  local candidate="$1" reserved_port="${2:-}"
  [[ "$candidate" =~ ^[1-9][0-9]{0,4}$ ]] || { log ERROR "Invalid TCP port: ${candidate}"; return 1; }
  while [[ "$candidate" == "$reserved_port" ]] || ss -ltnH "sport = :${candidate}" | grep -q .; do
    candidate=$((candidate + 1))
    ((candidate <= 65535)) || { log ERROR "Could not find a free TCP port."; return 1; }
  done
  printf '%s\n' "$candidate"
}

endpoint_scheme() {
  printf '%s\n' "${1%%://*}"
}

endpoint_host() {
  local endpoint="$1" host
  host="${endpoint#*://}"
  host="${host%%/*}"
  host="${host%%:*}"
  printf '%s\n' "$host"
}

requires_certificate() {
  [[ "$(endpoint_scheme "$S3_ENDPOINT")" == "https" || "$(endpoint_scheme "$WEBDAV_ENDPOINT")" == "https" ]]
}

assert_certificate_dns() {
  local resolved_addresses
  [[ ! "$PUBLIC_SERVER_NAME" =~ ^[0-9.]+$ ]] || {
    log ERROR "A DNS name is required for a Let's Encrypt certificate; update S3_ENDPOINT first."
    return 1
  }
  resolved_addresses="$(getent ahostsv4 "$PUBLIC_SERVER_NAME" 2>/dev/null | awk '{print $1}' | sort -u)"
  [[ -n "$resolved_addresses" ]] || {
    log ERROR "${PUBLIC_SERVER_NAME} has no IPv4 DNS record. Create the A record before requesting a certificate."
    return 1
  }
  [[ -z "$PUBLIC_IP" || $'\n'"$resolved_addresses"$'\n' == *$'\n'"$PUBLIC_IP"$'\n'* ]] || {
    log ERROR "${PUBLIC_SERVER_NAME} resolves to ${resolved_addresses//$'\n'/, }, not this host (${PUBLIC_IP})."
    return 1
  }
  log INFO "Verified that ${PUBLIC_SERVER_NAME} resolves to this host."
}

write_proxy_locations() {
  cat <<EOF
    location = ${WEBDAV_PROXY_PATH} {
        return 301 ${WEBDAV_PROXY_PATH}/;
    }
    location ^~ ${WEBDAV_PROXY_PATH}/ {
        rewrite ^${WEBDAV_PROXY_PATH}/(.*)$ /\$1 break;
        client_max_body_size 0;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_pass http://127.0.0.1:${WEBDAV_LISTEN_PORT};
    }
    location / {
        client_max_body_size 0;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_pass http://127.0.0.1:${MINIO_API_PORT};
    }
EOF
}

configure_nginx() {
  sync_existing_container_ports
  ensure_public_firewall
  install -d -m 0755 "${NGINX_WEBROOT}/.well-known/acme-challenge"
  if has_certificate; then
    cat >"$NGINX_CONFIG_FILE" <<EOF
server {
    listen 80;
    server_name ${PUBLIC_SERVER_NAME};
    root ${NGINX_WEBROOT};
    location ^~ /.well-known/acme-challenge/ { try_files \$uri =404; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name ${PUBLIC_SERVER_NAME};
    ssl_certificate /etc/letsencrypt/live/${CERTBOT_CERT_NAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${CERTBOT_CERT_NAME}/privkey.pem;
EOF
    write_proxy_locations >>"$NGINX_CONFIG_FILE"
    printf '}\n' >>"$NGINX_CONFIG_FILE"
  else
    cat >"$NGINX_CONFIG_FILE" <<EOF
server {
    listen 80;
    server_name ${PUBLIC_SERVER_NAME};
    root ${NGINX_WEBROOT};
    location ^~ /.well-known/acme-challenge/ { try_files \$uri =404; }
EOF
    write_proxy_locations >>"$NGINX_CONFIG_FILE"
    printf '}\n' >>"$NGINX_CONFIG_FILE"
  fi
  nginx -t
  nginx -s reload
  log INFO "Nginx proxy is configured for ${PUBLIC_SERVER_NAME}."
}

ensure_minio_bucket() {
  log INFO "Ensuring MinIO bucket ${S3_BUCKET} exists."
  docker run --rm --network host --env-file "$MINIO_ENV_FILE" --env "S3_BUCKET=${S3_BUCKET}" --env "MINIO_API_PORT=${MINIO_API_PORT}" --entrypoint /bin/sh minio/mc -ec '
    mc alias set local "http://127.0.0.1:$MINIO_API_PORT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc mb --ignore-existing "local/$S3_BUCKET" >/dev/null
    mc ls "local/$S3_BUCKET" >/dev/null
  '
}

issue_certificate() {
  if ! command -v certbot >/dev/null 2>&1; then
    log INFO "Installing Certbot for the TLS certificate request."
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update
      DEBIAN_FRONTEND=noninteractive apt-get install -y certbot
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y certbot
    elif command -v yum >/dev/null 2>&1; then
      yum install -y certbot
    else
      log ERROR "Install Certbot, then run this command again."
      exit 1
    fi
  fi
  [[ -n "$CERTBOT_EMAIL" ]] || { log ERROR "CERTBOT_EMAIL is required for the certbot command."; exit 1; }
  assert_certificate_dns
  configure_nginx
  certbot certonly --webroot --non-interactive --agree-tos --email "$CERTBOT_EMAIL" \
    --cert-name "$CERTBOT_CERT_NAME" -w "$NGINX_WEBROOT" -d "$PUBLIC_SERVER_NAME"
  configure_nginx
  log INFO "Certificate deployed for ${PUBLIC_SERVER_NAME}. Update S3_ENDPOINT to https and rerun the relevant deployment command."
}

ensure_certificate() {
  requires_certificate || return 0
  has_certificate && return
  [[ "$CERTBOT_AUTO_ISSUE" == "true" ]] || {
    log ERROR "A HTTPS endpoint is configured but the ${CERTBOT_CERT_NAME} certificate is missing. Run /root/load.sh certbot or set CERTBOT_AUTO_ISSUE=true."
    return 1
  }
  [[ -n "$CERTBOT_EMAIL" ]] || {
    log ERROR "CERTBOT_EMAIL is required to automatically request the certificate for HTTPS endpoints."
    return 1
  }
  log INFO "No TLS certificate is installed; requesting one automatically."
  issue_certificate
}

deploy_webdav() {
  local addition mount_path="${1:-${WEBDAV_MOUNT_PATH:-$(default_mount_path WebDav)}}"
  log INFO "Deploying the WebDAV container."
  prepare_data_dir
  ensure_certificate
  remove_container openlist-webdav
  WEBDAV_LISTEN_PORT="$(find_free_loopback_port "$WEBDAV_LISTEN_PORT")"
  configure_nginx
  docker run --detach \
    --name openlist-webdav \
    --restart always \
    --publish "127.0.0.1:${WEBDAV_LISTEN_PORT}:8080" \
    --volume "${DATA_DIR}:/data" \
    rclone/rclone serve webdav /data \
      --addr :8080 \
      --user "$WEBDAV_USER" \
      --pass "$WEBDAV_PASSWORD" >/dev/null

  addition="$(jq -cn \
    --arg address "$WEBDAV_ENDPOINT" \
    --arg username "$WEBDAV_USER" \
    --arg password "$WEBDAV_PASSWORD" \
    '{vendor:"other",address:$address,username:$username,password:$password,root_folder_path:"/",tls_insecure_skip_verify:false}')"
  register_storage WebDav "$mount_path" "$addition" true
  log INFO "WebDAV deployment completed."
}

deploy_minio() {
  local addition mount_path="${1:-${S3_MOUNT_PATH:-$(default_mount_path S3)}}"
  log INFO "Deploying the MinIO container."
  prepare_data_dir
  ensure_certificate
  remove_container openlist-minio
  MINIO_API_PORT="$(find_free_loopback_port "$MINIO_API_PORT")"
  MINIO_CONSOLE_PORT="$(find_free_loopback_port "$MINIO_CONSOLE_PORT" "$MINIO_API_PORT")"
  configure_nginx
  docker run --detach \
    --name openlist-minio \
    --restart always \
    --user 0:0 \
    --env-file "$MINIO_ENV_FILE" \
    --publish "127.0.0.1:${MINIO_API_PORT}:9000" \
    --publish "127.0.0.1:${MINIO_CONSOLE_PORT}:9001" \
    --volume "${DATA_DIR}:/data" \
    --health-cmd 'curl --fail --silent http://127.0.0.1:9000/minio/health/live || exit 1' \
    --health-interval 30s \
    --health-timeout 10s \
    --health-retries 3 \
    --health-start-period 20s \
    quay.io/minio/minio server /data --console-address :9001 >/dev/null

  wait_for_minio
  ensure_minio_bucket
  addition="$(jq -cn \
    --arg bucket "$S3_BUCKET" \
    --arg endpoint "$S3_ENDPOINT" \
    --arg region "$S3_REGION" \
    --arg access_key_id "$MINIO_ROOT_USER" \
    --arg secret_access_key "$MINIO_ROOT_PASSWORD" \
    --argjson sign_url_expire "$S3_SIGN_URL_EXPIRE" \
    '{
      root_folder_path:"",
      bucket:$bucket,
      endpoint:$endpoint,
      region:$region,
      access_key_id:$access_key_id,
      secret_access_key:$secret_access_key,
      session_token:"",
      custom_host:"",
      enable_custom_host_presign:false,
      sign_url_expire:$sign_url_expire,
      placeholder:"",
      force_path_style:true,
      list_object_version:"",
      remove_bucket:false,
      add_filename_to_disposition:false,
      enable_direct_upload:false,
      direct_upload_host:""
    }')"
  register_storage S3 "$mount_path" "$addition" false
  log INFO "MinIO deployment completed."
}

show_status() {
  docker ps --filter 'name=^openlist-' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
}

interactive_deploy() {
  local choice default_path mount_path
  check_and_mount_disk
  printf '\n1) WebDAV\n2) MinIO (S3)\n' >&2
  read -r -p "Choose a storage protocol [1/2]: " choice </dev/tty
  case "$choice" in
    1)
      default_path="$(default_mount_path WebDav)"
      read -r -p "OpenList mount path [${default_path}]: " mount_path </dev/tty
      deploy_webdav "${mount_path:-$default_path}"
      ;;
    2)
      default_path="$(default_mount_path S3)"
      read -r -p "OpenList mount path [${default_path}]: " mount_path </dev/tty
      deploy_minio "${mount_path:-$default_path}"
      ;;
    *)
      log ERROR "Choose 1 for WebDAV or 2 for MinIO."
      return 2
      ;;
  esac
}

case "${1:-}" in
  "") interactive_deploy ;;
  m) deploy_minio "${2:-$(default_mount_path S3)}" ;;
  w) deploy_webdav "${2:-$(default_mount_path WebDav)}" ;;
  minio) deploy_minio "${2:-${S3_MOUNT_PATH:-$(default_mount_path S3)}}" ;;
  webdav) deploy_webdav "${2:-${WEBDAV_MOUNT_PATH:-$(default_mount_path WebDav)}}" ;;
  certbot|ssl) issue_certificate ;;
  status) show_status ;;
  *)
    printf 'Usage: %s [w|m|webdav|minio|certbot|status] [mount-path]\n' "$0" >&2
    exit 2
    ;;
esac
