#!/bin/bash
echo "== groupama service =="; systemctl is-active groupama-scraper; systemctl show groupama-scraper -p NRestarts -p ActiveEnterTimestamp
echo "== porta =="; ss -ltn 2>/dev/null | grep 4500 || echo "4500 NON in ascolto"
echo "== /status =="; curl -s -m 6 http://127.0.0.1:4500/status | head -c 600; echo
echo "== /loginstate =="; curl -s -m 6 http://127.0.0.1:4500/loginstate | head -c 400; echo
echo "== log =="; journalctl -u groupama-scraper -n 40 --no-pager
echo "== backend =="; journalctl -u withus-backend -n 25 --no-pager | grep -i -E "groupama|fonti" | tail -20
