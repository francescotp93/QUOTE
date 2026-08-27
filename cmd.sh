#!/usr/bin/env bash
G=http://127.0.0.1:4500
echo "=== A) base Nexus + hover Portafoglio ==="
curl -s --max-time 65 "$G/explore?goto=/pda/PR_GCP_nexus-web/&hover=Portafoglio&all=1"; echo
echo
echo "=== B) base Nexus + hover Anagrafica ==="
curl -s --max-time 65 "$G/explore?goto=/pda/PR_GCP_nexus-web/&hover=Anagrafica&all=1"; echo
