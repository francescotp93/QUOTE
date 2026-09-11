echo "ora VPS: $(date '+%F %T %Z')"
echo "backend: $(systemctl is-active withus-backend) — avviato: $(systemctl show withus-backend -p ActiveEnterTimestamp --value)"
echo "--- righe [esiti] (registro che NON e' riuscito a scrivere), dal riavvio:"
journalctl -u withus-backend --since '2026-09-11 10:04:30' --no-pager 2>/dev/null | grep -i '\[esiti\]' | tail -10 | cut -c1-220
echo "(nessuna riga qui sopra = il registro non ha mai fallito una scrittura)"
echo "--- chiamate alle rotte di quotazione dal riavvio:"
journalctl -u withus-backend --since '2026-09-11 10:04:30' --no-pager 2>/dev/null | grep -E ' (GET|POST) +/(moto/|api/v1/quote)' | grep -v '/status/' | tail -15 | cut -c1-170
echo "--- conteggi dal riavvio: richieste totali $(journalctl -u withus-backend --since '2026-09-11 10:04:30' --no-pager 2>/dev/null | grep -cE ' (GET|POST) ') · su /moto $(journalctl -u withus-backend --since '2026-09-11 10:04:30' --no-pager 2>/dev/null | grep -cE ' (GET|POST) +/moto/')"
