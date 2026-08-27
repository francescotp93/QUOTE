#!/usr/bin/env bash
G=http://127.0.0.1:4500
for i in $(seq 1 6); do
  c=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)
  if [ "$c" = "f08d649" ]; then echo "deploy ok (backend=$c), attendo restart"; sleep 12; break; fi
  echo "attendo deploy (backend=$c)"; sleep 20
done
echo "backend: $(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)"
echo "=== /nexus-probe ==="; curl -s --max-time 140 "$G/nexus-probe"; echo
