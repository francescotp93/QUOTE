#!/usr/bin/env bash
# Dove e come e' pubblicato iam.withusassicurazioni.it, e ha gia' il fix?
set -u
echo "== Caddy: root di iam =="
grep -RniE "iam\.withusassicurazioni\.it" /etc/caddy/ 2>/dev/null | head -5
ROOT=$(grep -RhiA6 "iam\.withusassicurazioni\.it" /etc/caddy/ 2>/dev/null | grep -oE "root \* [^ ]+|root [^ ]+" | grep -oE "/[^ ]+" | head -1)
echo "root indovinato: ${ROOT:-?}"
for d in "$ROOT" /opt/withus-iam /var/www/iam /opt/withus-iam/Agente-sospesi; do
  [ -n "$d" ] && [ -d "$d" ] || continue
  echo "== $d =="
  git -C "$d" log --oneline -1 2>/dev/null | head -1
  f="$d/index.html"; [ -f "$f" ] || f=$(ls "$d"/*.html 2>/dev/null | head -1)
  [ -f "$f" ] && echo "  index: $f  fontiEsitoHTML=$(grep -c fontiEsitoHTML "$f" 2>/dev/null)  f-prog=$(grep -c 'f-prog' "$f" 2>/dev/null)  bytes=$(wc -c <"$f")"
done
echo "== autopull timer/servizio =="
systemctl list-timers 2>/dev/null | grep -iE "autopull|iam" | head -3
echo "(fine)"
