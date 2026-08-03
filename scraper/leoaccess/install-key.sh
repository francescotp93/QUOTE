#!/usr/bin/env bash
# TEMPORANEO: autorizza la chiave di manutenzione di Leo su root, poi va rimosso.
set -e
mkdir -p /root/.ssh
chmod 700 /root/.ssh
KEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB1eOlU+qbnOxrtktfoMpL5JJZd4jUv2MRVAPJqLS1gl withus-vps'
touch /root/.ssh/authorized_keys
grep -qF "$KEY" /root/.ssh/authorized_keys || printf '%s\n' "$KEY" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
echo "[leoaccess] chiave autorizzata"
