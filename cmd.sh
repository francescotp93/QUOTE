for i in $(seq 1 10); do H=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null); [ "$H" = "8680ffd" ] && break; sleep 8; done
echo "HEAD=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)"
sudo systemctl restart allianz-scraper.service 2>&1 || systemctl restart allianz-scraper.service 2>&1
for i in $(seq 1 13); do S=$(curl -s -m 8 "http://127.0.0.1:4200/status" 2>/dev/null); echo "$S" | grep -q '"loggato":true' && { echo PRONTO; break; }; sleep 8; done
curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=30" >/dev/null 2>&1
echo "=== /premio GY263BY ==="
curl -s -m 120 "http://127.0.0.1:4200/premio?targa=GY263BY&nascita=17/07/1993" 2>/dev/null
