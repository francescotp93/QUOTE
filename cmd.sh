#!/usr/bin/env bash
# Diagnosi sezione Fonti (read-only)
set -u
echo "=== backend attivo? ==="; systemctl is-active withus-backend; systemctl show withus-backend -p ActiveEnterTimestamp --value
echo
echo "=== /fonti risponde? (401 = auth ok, 500 = bug) ==="
curl -s -o /tmp/f.txt --max-time 12 -w "GET /fonti -> %{http_code}\n" http://127.0.0.1:3000/fonti
echo "  corpo:"; head -c 300 /tmp/f.txt; echo
echo
echo "=== store fonti valido? ==="
F=/opt/withus-backend/server/fonti.store.json
[ -f "$F" ] && { node -e "const s=JSON.parse(require('fs').readFileSync('$F','utf8')); const ids=Object.keys(s).filter(k=>k!=='__custom'); const cust=Object.keys(s.__custom||{}); console.log('  fonti fisse:',ids.join(',')); console.log('  fonti custom:',cust.join(',')||'(nessuna)');" 2>&1 || echo "  ❌ store JSON NON valido"; } || echo "  ❌ store assente"
echo
echo "=== errori recenti nel log backend (fonti) ==="
journalctl -u withus-backend --since "40 min ago" --no-pager 2>/dev/null | grep -iE "error|fonti|throw|cannot|undefined|500" | tail -15 || echo "  (nessun errore evidente)"
echo "FINE."
