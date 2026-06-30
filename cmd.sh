echo "=== attendo autopull (HEAD bef58d4) ==="
for i in $(seq 1 10); do
  H=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)
  echo "HEAD=$H"; [ "$H" = "bef58d4" ] && break; sleep 8
done
echo "=== restart allianz-scraper ==="
sudo systemctl restart allianz-scraper.service 2>&1 || systemctl restart allianz-scraper.service 2>&1
for i in $(seq 1 14); do
  S=$(curl -s -m 8 "http://127.0.0.1:4200/status" 2>/dev/null)
  echo "$S" | grep -q '"loggato":true' && { echo "PRONTO"; break; }
  sleep 8
done
echo "=== /motor step=probe ==="
curl -s -m 60 "http://127.0.0.1:4200/motor?step=probe&wait=500" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get('probe'),indent=1,ensure_ascii=False))" 2>/dev/null || echo "(probe parse fail)"
