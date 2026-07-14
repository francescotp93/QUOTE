#!/usr/bin/env bash
# READ-ONLY: le credenziali nello store sono decifrabili con la chiave DEGLI SCRAPER (4d1bed)?
set -u
SCR=/opt/withus-backend/scraper/diagnosi-fonti.mjs
echo "=== diagnosi store con l'ambiente di axa-scraper (chiave 4d1bed) ==="
env $(systemctl show axa-scraper -p Environment --value 2>/dev/null) node "$SCR" 2>&1 | grep -vE 'Store credenziali|^\s*$' | sed 's/^/[axa-env] /'
echo
echo "=== conferma incrociata con moto-scraper ==="
env $(systemctl show moto-scraper -p Environment --value 2>/dev/null) node "$SCR" 2>&1 | grep -iE 'Impronta|decifrabili|non decifrabili' | head -3 | sed 's/^/[moto-env] /'
echo "FINE."
