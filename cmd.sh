#!/usr/bin/env bash
# Restart kube-scraper (per caricare la fix Blazor gia' deployata) + login fresco di verifica
set -u
echo "== HEAD /opt/withus-backend =="
git -C /opt/withus-backend log -1 --oneline 2>&1 | tail -1
echo
echo "== fix markers on-disk (atteso >=1 ciascuno) =="
echo -n "pressSequentially: "; grep -c pressSequentially /opt/withus-backend/scraper/kube/quote-service.mjs 2>&1
echo -n "connetti: "; grep -c connetti /opt/withus-backend/scraper/kube/quote-service.mjs 2>&1
echo
echo "== kube-scraper PRE =="
systemctl is-active kube-scraper 2>&1
echo "-- /status PRE --"
curl -s --max-time 8 http://127.0.0.1:4900/status 2>&1; echo
echo
echo "== restart kube-scraper =="
systemctl restart kube-scraper 2>&1 && echo "restart OK" || echo "restart FAIL"
sleep 15
echo "-- /status POST restart --"
curl -s --max-time 8 http://127.0.0.1:4900/status 2>&1; echo
echo
echo "== trigger login fresco (/accedi) =="
curl -s --max-time 30 http://127.0.0.1:4900/accedi 2>&1; echo
echo
echo "== polling /status =="
for i in 1 2 3 4 5 6; do sleep 8; echo "-- t=$((i*8))s --"; curl -s --max-time 8 http://127.0.0.1:4900/status 2>&1; echo; done
echo FINE.
