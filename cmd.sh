#!/usr/bin/env bash
# Le rotte dei convenzionati sono vive sul server?
set -u
cd /opt/withus-backend || exit 1
git log --oneline -1
grep -c 'convenzionatiRouter_pubblicoAssociati' server/index.js | sed 's/^/  montato in index.js: /'
systemctl show withus-backend -p ActiveEnterTimestamp --value | sed 's/^/  backend acceso dalle: /'
echo
echo "== le rotte rispondono? (400/401 = viva e controlla; 404 = non c e) =="
for r in iscrizione mia-password mio-codice miei-dati; do
  C=$(curl -s -o /dev/null -w '%{http_code}' -m 10 -X POST -H 'content-type: application/json' -d '{}' http://127.0.0.1:3000/convenzionati/$r)
  printf '  %-16s %s\n' "$r" "$C"
done
C=$(curl -s -o /dev/null -w '%{http_code}' -m 10 -X POST -H 'content-type: application/json' -d '{}' http://127.0.0.1:3000/convenzionati/associati/00000000-0000-0000-0000-000000000000/approva)
echo "  approva (senza accesso) $C   <- deve essere 401"
echo
echo "== errori recenti del backend =="
journalctl -u withus-backend --since '-10 min' --no-pager 2>/dev/null | grep -iE 'error|convenzionati|SUPABASE_SERVICE|BREVO' | tail -10
