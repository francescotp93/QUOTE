#!/usr/bin/env bash
# Il controllo «una convenzione sola» è in produzione?
set -u
cd /opt/withus-backend || exit 1
echo "=== commit sulla macchina ==="; git log --oneline -1
echo "=== il controllo c'è nel codice in esecuzione ==="
grep -c "giaAssociatoAltrove" server/convenzionati.js || true
grep -c "una sola convenzione" server/convenzionati.js || true
echo "=== il servizio è ripartito ==="
systemctl show withus-backend -p ActiveEnterTimestamp
