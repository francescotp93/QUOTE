echo "ora VPS: $(date '+%F %T %Z') · backend: $(systemctl is-active withus-backend)"
echo "quotazioni chieste dal riavvio: $(journalctl -u withus-backend --since '2026-09-11 10:04:30' --no-pager 2>/dev/null | grep -E ' (GET|POST) +/(moto/(preventivo|premio|allianz-auto|quota-auto)|api/v1/quote)' | grep -vc '/status/')"
echo "richieste totali dal riavvio: $(journalctl -u withus-backend --since '2026-09-11 10:04:30' --no-pager 2>/dev/null | grep -cE ' (GET|POST) ')"
echo "righe [esiti] (scritture fallite): $(journalctl -u withus-backend --since '2026-09-11 10:04:30' --no-pager 2>/dev/null | grep -ci '\[esiti\]')"
journalctl -u withus-backend --since '2026-09-11 10:04:30' --no-pager 2>/dev/null | grep -i '\[esiti\]' | tail -5 | cut -c1-200
