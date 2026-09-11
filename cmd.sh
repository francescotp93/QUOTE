echo "HEAD VPS: $(git -C /opt/withus-backend rev-parse --short HEAD)"
echo "backend: $(systemctl is-active withus-backend) — avviato: $(systemctl show withus-backend -p ActiveEnterTimestamp --value)"
echo "--- /health:"; curl -s -m 5 http://127.0.0.1:3000/health; echo
echo "--- giornale dal riavvio (errori o avvio):"
journalctl -u withus-backend --since '2026-09-11 10:04:30' --no-pager 2>/dev/null | grep -iE 'ascolto|error|errore|esiti|cannot|SyntaxError|Started|Failed' | head -12 | cut -c1-200
echo "--- richieste servite dal riavvio: $(journalctl -u withus-backend --since '2026-09-11 10:04:30' --no-pager 2>/dev/null | grep -cE ' (GET|POST) ')"
