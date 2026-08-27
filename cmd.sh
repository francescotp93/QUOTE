#!/usr/bin/env bash
G=http://127.0.0.1:4500
for i in $(seq 1 7); do
  c=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)
  if [ "$c" = "51f821b" ]; then echo "deploy ok (backend=$c), attendo restart scraper"; sleep 14; break; fi
  echo "attendo deploy (backend=$c)"; sleep 18
done
echo "backend: $(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)"
echo "=== status ==="; curl -s --max-time 20 "$G/status"; echo
echo "=== /nexus-probe?mode=contraente (scudo 75s) ==="
curl -s --max-time 100 "$G/nexus-probe?mode=contraente"; echo
