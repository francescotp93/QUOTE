#!/usr/bin/env bash
G=http://127.0.0.1:4500
echo "=== /status ==="
curl -s --max-time 25 "$G/status"; echo
echo
echo "=== /explore goto Nexus base (PR_GCP_nexus-web) — sola lettura ==="
curl -s --max-time 90 "$G/explore?goto=/pda/PR_GCP_nexus-web/&all=1"; echo
