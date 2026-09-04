#!/usr/bin/env bash
# Il codice che legge `da_confermare` e i parametri F-11 e' in produzione?
set -u
cd /opt/withus-backend || exit 1
echo "=== ultimo commit sulla macchina ==="
git log --oneline -1
echo
echo "=== il codice che legge la colonna e le nuove chiavi ==="
grep -c "da_confermare" server/parametriPrevidenziali.js || true
grep -c "coefficiente_rendita_fondo" server/parametriPrevidenziali.js || true
echo
echo "=== il servizio quando e' ripartito ==="
systemctl show withus-backend -p ActiveEnterTimestamp
