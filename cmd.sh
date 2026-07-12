ENV=/opt/withus-backend/server/.env
K=$(grep '^MAIL_DIGEST_KEY=' "$ENV" | head -1 | cut -d= -f2- | tr -d '"')
echo "env key len: ${#K}"
echo "env key md5: $(printf '%s' "$K" | md5sum | cut -d' ' -f1)"
# md5 della chiave EFFETTIVAMENTE vista dal processo node in esecuzione
PID=""
for p in $(pgrep node 2>/dev/null); do
  if tr '\0' '\n' < /proc/$p/environ 2>/dev/null | grep -q '^MAIL_DIGEST_KEY='; then PID=$p; break; fi
done
if [ -n "$PID" ]; then
  PK=$(tr '\0' '\n' < /proc/$PID/environ | grep '^MAIL_DIGEST_KEY=' | head -1 | cut -d= -f2-)
  echo "proc key len: ${#PK}  md5: $(printf '%s' "$PK" | md5sum | cut -d' ' -f1)"
else
  echo "proc: nessun node con MAIL_DIGEST_KEY (endpoint usa MAIL_SELFTEST_KEY?)"
  for p in $(pgrep node 2>/dev/null); do
    if tr '\0' '\n' < /proc/$p/environ 2>/dev/null | grep -q '^MAIL_SELFTEST_KEY='; then
      SK=$(tr '\0' '\n' < /proc/$p/environ | grep '^MAIL_SELFTEST_KEY=' | head -1 | cut -d= -f2-)
      echo "selftest key len: ${#SK}  md5: $(printf '%s' "$SK" | md5sum | cut -d' ' -f1)"; break
    fi
  done
fi
