#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
    printf 'Usage: %s DOMAIN GATEWAY_PORT [http|https]\n' "${0##*/}" >&2
    printf '\nRenders a generic Docker gateway Nginx template to stdout.\n' >&2
}

if [[ $# -lt 2 || $# -gt 3 ]]; then
    usage
    exit 64
fi

domain=$1
gateway_port=$2
mode=${3:-https}
cert_name=${OPENLIST_DRIVE_CERT_NAME:-$domain}

if [[ ! $domain =~ ^[A-Za-z0-9.-]+$ ]]; then
    printf 'Invalid domain: %s\n' "$domain" >&2
    exit 64
fi

if [[ ! $cert_name =~ ^[A-Za-z0-9.-]+$ ]]; then
    printf 'Invalid certificate name: %s\n' "$cert_name" >&2
    exit 64
fi

if [[ ! $gateway_port =~ ^[0-9]+$ ]] || (( gateway_port < 1 || gateway_port > 65535 )); then
    printf 'Invalid gateway port: %s\n' "$gateway_port" >&2
    exit 64
fi

case $mode in
    http|https) ;;
    *)
        printf 'Invalid mode: %s (expected http or https)\n' "$mode" >&2
        exit 64
        ;;
esac

template_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
case $mode in
    http) template="$template_dir/openlist-drive.docker.http.conf.template" ;;
    https) template="$template_dir/openlist-drive.docker.conf.template" ;;
esac

sed \
    -e "s|@OPENLIST_DRIVE_DOMAIN@|$domain|g" \
    -e "s|@OPENLIST_DRIVE_PORT@|$gateway_port|g" \
    -e "s|@OPENLIST_DRIVE_CERT_NAME@|$cert_name|g" \
    "$template"
