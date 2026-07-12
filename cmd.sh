echo "== processi node e loro MAIL_DIGEST_KEY (md5) =="
for p in $(pgrep node 2>/dev/null); do
  k=$(tr '\0' '\n' < /proc/$p/environ 2>/dev/null | grep '^MAIL_DIGEST_KEY=' | head -1 | cut -d= -f2-)
  cwd=$(readlink /proc/$p/cwd 2>/dev/null)
  [ -n "$k" ] && echo "  pid $p cwd=$cwd md5=$(printf '%s' "$k" | md5sum | cut -d' ' -f1)"
done
echo "== porta backend in ascolto =="
ss -ltnp 2>/dev/null | grep -iE 'node|:3000|:8080|withus' | head
echo "== DNS api.withusassicurazioni.it vs IP pubblico VPS =="
getent hosts api.withusassicurazioni.it | head
echo "  IP pubblico VPS: $(curl -s --max-time 8 https://api.ipify.org 2>/dev/null)"
echo "== chi risponde: PUBBLICO vs LOCALHOST con la chiave locale =="
PID=""; for p in $(pgrep node 2>/dev/null); do tr '\0' '\n' < /proc/$p/environ 2>/dev/null | grep -q '^MAIL_DIGEST_KEY=' && { PID=$p; break; }; done
K=$(tr '\0' '\n' < /proc/$PID/environ | grep '^MAIL_DIGEST_KEY=' | head -1 | cut -d= -f2-)
PORT=$(ss -ltnp 2>/dev/null | grep -oE '127.0.0.1:[0-9]+|0.0.0.0:[0-9]+|\*:[0-9]+' | grep -oE '[0-9]+$' | sort -u | head -20 | tr '\n' ' ')
echo "  porte candidate: $PORT"
echo "  PUBBLICO  http $(curl -s -o /dev/null -w '%{http_code}' "https://api.withusassicurazioni.it/mail/digest?key=$K&filtro=oggi" --max-time 30)"
for pt in 3000 8080 8787 4000 5000; do
  c=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$pt/mail/digest?key=$K&filtro=oggi" --max-time 8 2>/dev/null)
  [ "$c" != "000" ] && echo "  localhost:$pt http $c"
done
