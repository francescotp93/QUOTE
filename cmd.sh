#!/usr/bin/env bash
G=http://127.0.0.1:4500
for i in $(seq 1 5); do
  c=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)
  if [ "$c" = "4ad2d1f" ]; then echo "deploy ok (backend=$c), attendo restart scraper"; sleep 12; break; fi
  echo "attendo deploy (backend=$c)"; sleep 20
done
echo "backend commit: $(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)"
echo "=== /status ==="; curl -s --max-time 25 "$G/status"; echo
echo "=== /nexus-probe ==="; curl -s --max-time 130 "$G/nexus-probe"; echo
