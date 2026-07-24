#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

readonly CONFIG_FILE="${OPENLIST_DEPLOY_CONFIG:-/root/.config/openlist-storage-deploy.env}"
readonly MINIO_ENV_FILE="${MINIO_ENV_FILE:-/root/.config/openlist-minio.env}"
readonly LOG_DIR="${OPENLIST_DEPLOY_LOG_DIR:-/var/log/openlist-storage-deploy}"
readonly LOG_FILE="${LOG_DIR}/load.log"

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
cleanup() {
  [[ -z "$AUTH_HEADER_FILE" ]] || rm -f "$AUTH_HEADER_FILE"
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

for command_name in curl docker jq stat tee; do
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
: "${WEBDAV_ENDPOINT:?WEBDAV_ENDPOINT is required}"
: "${WEBDAV_MOUNT_PATH:?WEBDAV_MOUNT_PATH is required}"
: "${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}"
: "${S3_ENDPOINT:?S3_ENDPOINT is required}"
: "${S3_MOUNT_PATH:?S3_MOUNT_PATH is required}"
: "${S3_BUCKET:=default}"
: "${S3_REGION:=openlist}"
: "${S3_SIGN_URL_EXPIRE:=4}"

[[ "$OPENLIST_URL" =~ ^https?:// ]] || { log ERROR "OPENLIST_URL must use HTTP or HTTPS."; exit 1; }
[[ "$WEBDAV_ENDPOINT" =~ ^https?:// ]] || { log ERROR "WEBDAV_ENDPOINT must use HTTP or HTTPS."; exit 1; }
[[ "$S3_ENDPOINT" =~ ^https?:// ]] || { log ERROR "S3_ENDPOINT must use HTTP or HTTPS."; exit 1; }
[[ "$S3_SIGN_URL_EXPIRE" =~ ^[1-9][0-9]*$ ]] || { log ERROR "S3_SIGN_URL_EXPIRE must be a positive number of hours."; exit 1; }

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

deploy_webdav() {
  local addition
  log INFO "Deploying the WebDAV container."
  prepare_data_dir
  remove_container openlist-webdav
  docker run --detach \
    --name openlist-webdav \
    --restart always \
    --publish 127.0.0.1:8080:8080 \
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
  register_storage WebDav "$WEBDAV_MOUNT_PATH" "$addition" true
  log INFO "WebDAV deployment completed."
}

deploy_minio() {
  local addition
  log INFO "Deploying the MinIO container."
  prepare_data_dir
  remove_container openlist-minio
  docker run --detach \
    --name openlist-minio \
    --restart always \
    --user 0:0 \
    --env-file "$MINIO_ENV_FILE" \
    --publish 127.0.0.1:9000:9000 \
    --publish 127.0.0.1:9001:9001 \
    --volume "${DATA_DIR}:/data" \
    --health-cmd 'curl --fail --silent http://127.0.0.1:9000/minio/health/live || exit 1' \
    --health-interval 30s \
    --health-timeout 10s \
    --health-retries 3 \
    --health-start-period 20s \
    quay.io/minio/minio server /data --console-address :9001 >/dev/null

  wait_for_minio
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
  register_storage S3 "$S3_MOUNT_PATH" "$addition" false
  log INFO "MinIO deployment completed."
}

show_status() {
  docker ps --filter 'name=^openlist-' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
}

case "${1:-}" in
  minio|m) deploy_minio ;;
  webdav|w) deploy_webdav ;;
  status) show_status ;;
  *)
    printf 'Usage: %s {minio|webdav|status}\n' "$0" >&2
    exit 2
    ;;
esac
