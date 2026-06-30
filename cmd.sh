echo "=== HEAD backend ==="
git -C /opt/withus-backend log --oneline -1 2>/dev/null
echo "=== attendo scraper loggato ==="
for i in $(seq 1 12); do
  S=$(curl -s -m 8 "http://127.0.0.1:4200/status" 2>/dev/null)
  echo "$S" | grep -q '"loggato":true' && { echo "PRONTO: $S"; break; }
  echo "...non pronto ($i): $S"; sleep 8
done
