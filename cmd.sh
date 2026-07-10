set +e
echo "=== journal allianz: righe menu/autoLogin/duo/passcode/tentativo ultime 120 ==="
sudo journalctl -u allianz-scraper.service --no-pager -n 300 2>&1 | grep -iE 'menu sales|autoLogin|forzo|duo|passcode|otp|tentativo|preventivo motor|loggato|campi compilati|step' | tail -40
echo "=== /status ==="
curl -s --max-time 8 http://127.0.0.1:4200/status; echo
echo "---fine---"
