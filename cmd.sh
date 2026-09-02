#!/usr/bin/env bash
# Dopo l'ultimo rilascio: il pannello vede Groupama attiva? E Allianz chiede il codice?
set -u
cd /opt/withus-backend || exit 1
git log --oneline -1
grep -c 'attendiSchermata' scraper/groupama/quote-service.mjs | sed 's/^/  attesa-vera nel file: /'
systemctl restart groupama-scraper 2>/dev/null && echo "  groupama riavviato"
sleep 45
echo
echo "== primo /status (puo dire 'non lo so': sta ancora guardando) =="
curl -s -m 15 http://127.0.0.1:4500/status; echo
sleep 35
echo
echo "== secondo /status (ora la risposta e' quella vera) =="
curl -s -m 15 http://127.0.0.1:4500/status; echo
echo
echo "== come lo vede il PANNELLO (via backend) =="
curl -s -m 25 http://127.0.0.1:3000/salute 2>/dev/null | head -c 600; echo
echo
echo "== Allianz =="
curl -s -m 15 http://127.0.0.1:4200/status; echo
echo
echo "== log Groupama =="
journalctl -u groupama-scraper --since "-3 min" --no-pager 2>/dev/null | grep -v 'systemd\[' | tail -12
