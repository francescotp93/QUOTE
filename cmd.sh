for f in /opt/withus-backend/server/.env.bak-20260711-220430 /opt/withus-backend/server/.env.bak-20260711-220226 /opt/withus-backend/server/.env; do
  echo "== $f =="
  echo "  MAIL_USER configurati:"
  grep -E '^MAIL_USER(_[0-9]+)?=' "$f" 2>/dev/null | sed 's/=/= /' | sed 's/^/    /'
  echo "  password MAIL presenti: $(grep -cE '^MAIL_PASS(_[0-9]+)?=' "$f" 2>/dev/null)"
  echo "  host custom: $(grep -cE '^MAIL_(IMAP|SMTP)_HOST(_[0-9]+)?=' "$f" 2>/dev/null)"
done
