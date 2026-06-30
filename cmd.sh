for i in $(seq 1 12); do H=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null); [ "$H" = "16aaae5" ] && break; sleep 8; done
echo "HEAD=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)"
sleep 6
curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=30" >/dev/null 2>&1
echo "=== backend /moto/allianz-auto ==="
curl -s -m 170 "http://127.0.0.1:3000/moto/allianz-auto?targa=GY263BY&nascita=17/07/1993" 2>/dev/null
