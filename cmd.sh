#!/bin/bash
echo "== hdi /status =="; curl -s -m 8 http://127.0.0.1:4400/status; echo
echo "== hdi /loginstate =="; curl -s -m 8 http://127.0.0.1:4400/loginstate; echo
echo "== hdi /accedi (prova reale) =="; curl -s -m 15 http://127.0.0.1:4400/accedi; echo
sleep 6; echo "== hdi /loginstate dopo 6s =="; curl -s -m 8 http://127.0.0.1:4400/loginstate; echo
echo "== groupama /status (era vuoto) =="; curl -s -m 8 -o /dev/null -w "http=%{http_code} bytes=%{size_download}\n" http://127.0.0.1:4500/status
echo "== hdi log =="; journalctl -u hdi-scraper -n 20 --no-pager
