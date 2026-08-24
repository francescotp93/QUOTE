#!/usr/bin/env bash
# Caching IAM: Caddy dice al browser di ricaricare o di tenere la vecchia?
set -u
echo "== blocco Caddy per iam =="
CF=$(ls /etc/caddy/Caddyfile 2>/dev/null; ls /etc/caddy/conf.d/*.caddy 2>/dev/null; ls /etc/caddy/*.caddy 2>/dev/null)
for f in $CF; do
  grep -qi "iam.withusassicurazioni" "$f" 2>/dev/null && { echo "-- $f --"; awk '/iam\.withusassicurazioni/{p=1} p{print} p&&/^}/{exit}' "$f" 2>/dev/null | head -40; }
done
echo "== header serviti per / e /index.html (via localhost) =="
for path in / /index.html; do
  echo "--- GET $path ---"
  curl -s -m 10 -I -H "Host: iam.withusassicurazioni.it" "http://127.0.0.1$path" 2>/dev/null | grep -iE "HTTP/|cache-control|etag|last-modified|expires" | head
done
echo "== il file servito ha il fix? =="
F=/opt/withus-iam/index.html
echo "fontiEsitoHTML=$(grep -c fontiEsitoHTML "$F" 2>/dev/null)  HEAD=$(git -C /opt/withus-iam rev-parse --short HEAD 2>/dev/null)"
echo "(fine)"
