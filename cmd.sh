#!/usr/bin/env bash
G=http://127.0.0.1:4500
echo "=== base + hover Portafoglio + click 'Nuova Proposta' → prima schermata emissione ==="
curl -s --max-time 90 "$G/explore?goto=/pda/PR_GCP_nexus-web/&hover=Portafoglio&click=Nuova%20Proposta&all=1"; echo
