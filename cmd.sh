#!/usr/bin/env bash
G=http://127.0.0.1:4500
for i in $(seq 1 7); do
  c=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)
  if [ "$c" = "4172fe1" ]; then echo "deploy ok (backend=$c), attendo restart scraper"; sleep 14; break; fi
  echo "attendo deploy (backend=$c)"; sleep 18
done
echo "backend: $(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)"
echo "=== /nexus-probe?mode=a4j ==="
curl -s --max-time 120 "$G/nexus-probe?mode=a4j"; echo
echo "=== /nexus-probe?mode=selectOption ==="
curl -s --max-time 95 "$G/nexus-probe?mode=selectOption"; echo
