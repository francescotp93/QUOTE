#!/bin/bash
systemctl is-active hdi-scraper; systemctl show hdi-scraper -p NRestarts -p ActiveEnterTimestamp
ss -ltnp 2>/dev/null | grep 4400 || echo "porta 4400 NON in ascolto"
curl -s -m 5 http://127.0.0.1:4400/status | head -c 500; echo
journalctl -u hdi-scraper -n 30 --no-pager
git -C /opt/withus-backend log --oneline -1
