#!/usr/bin/env bash
G=http://127.0.0.1:4500
echo "=== A) goto homeEmissione-flow (ingresso emissione?) ==="
curl -s --max-time 70 "$G/explore?goto=/pda/PR_GCP_nexus-web/spring/homeEmissione-flow&all=1"; echo
echo
echo "=== B) main-flow + hover Portafoglio (menu) ==="
curl -s --max-time 70 "$G/explore?goto=/pda/PR_GCP_nexus-web/spring/main-flow&hover=Portafoglio&all=1"; echo
