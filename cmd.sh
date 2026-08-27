#!/usr/bin/env bash
G=http://127.0.0.1:4500
for i in $(seq 1 7); do
  c=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)
  if [ "$c" = "80888f4" ]; then echo "deploy ok (backend=$c), attendo restart scraper"; sleep 14; break; fi
  echo "attendo deploy (backend=$c)"; sleep 18
done
echo "backend: $(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)"
echo "=== /nexus-probe?mode=xhr ==="
curl -s --max-time 200 "$G/nexus-probe?mode=xhr"; echo
