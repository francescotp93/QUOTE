#!/usr/bin/env bash
set -u
echo "== header HTTPS reali per index.html =="
curl -sk -m 12 -I --resolve iam.withusassicurazioni.it:443:127.0.0.1 \
  https://iam.withusassicurazioni.it/index.html 2>/dev/null | grep -iE "HTTP/|cache-control|etag|last-modified|expires|age|vary" | head
echo "== dove e' configurato iam in Caddy =="
grep -rlni "iam.withusassicurazioni" /etc/caddy 2>/dev/null
echo "-- blocco (con root/header/file_server) --"
grep -rhA25 -ni "iam\.withusassicurazioni" /etc/caddy 2>/dev/null | grep -iE "iam\.withusassicurazioni|root|header|file_server|encode|cache|import|try_files" | head -25
echo "(fine)"
