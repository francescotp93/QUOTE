ENV=/opt/withus-backend/server/.env
echo "== caselle MAIL configurate (indirizzi; password mascherate) =="
grep -E '^MAIL_USER(_[0-9]+)?=' "$ENV" | sed 's/=/= /'
echo "== conteggio password presenti =="
echo "MAIL_PASS totali: $(grep -cE '^MAIL_PASS(_[0-9]+)?=' "$ENV")"
echo "== host IMAP/SMTP configurati =="
grep -E '^MAIL_(IMAP|SMTP)_HOST=' "$ENV" | sed 's/=/= /' || echo "(default aruba)"
echo "== eventuali riferimenti a withus.coop / hditrapani / ag1428 nel .env =="
grep -iE 'withus.coop|hditrapani|ag1428' "$ENV" | sed 's/=.*/= <presente>/'
