echo "backend: $(systemctl is-active withus-backend) — avviato: $(systemctl show withus-backend -p ActiveEnterTimestamp --value)"
echo "--- rotte di quotazione chiamate dal riavvio (10:04):"
journalctl -u withus-backend --since '2026-09-11 10:04:30' --no-pager 2>/dev/null | grep -E ' (GET|POST) +/(moto/(preventivo|premio|allianz-auto|quota-auto)|api/v1/quote)' | grep -v '/status/' | cut -c1-170
echo "--- righe del registro esiti nel giornale:"
journalctl -u withus-backend --since '2026-09-11 10:04:30' --no-pager 2>/dev/null | grep -i '\[esiti\]' | tail -10 | cut -c1-220
echo "--- totale richieste dal riavvio: $(journalctl -u withus-backend --since '2026-09-11 10:04:30' --no-pager 2>/dev/null | grep -cE ' (GET|POST) ')"
