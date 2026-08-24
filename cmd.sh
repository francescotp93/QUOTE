#!/usr/bin/env bash
# Verifica (sola lettura): IAM ha raggiunto il fix?
set -u
echo "IAM HEAD:   $(git -C /opt/withus-iam rev-parse --short HEAD 2>/dev/null)"
echo "atteso:     887d4b9"
F=/opt/withus-iam/index.html
echo "index: fontiEsitoHTML=$(grep -c fontiEsitoHTML "$F" 2>/dev/null)  f-prog=$(grep -c 'f-prog' "$F" 2>/dev/null)"
echo "autopull.sh ordine (IAM prima dell'exit?): $(grep -n 'IAM=/opt/withus-iam\|LOCAL. = .REMOTE' /opt/withus-backend/deploy/autopull.sh 2>/dev/null | tr '\n' ' ')"
echo "ultimo deploy IAM nel log: $(journalctl -u withus-autopull 2>/dev/null | grep -i 'IAM aggiornato' | tail -1)"
echo "(fine)"
