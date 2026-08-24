#!/usr/bin/env bash
# Verifica finale IAM (sola lettura; errori in /tmp per non sporcare il repo)
set -u
echo "IAM HEAD: $(git -C /opt/withus-iam rev-parse --short HEAD 2>/tmp/_e)  (atteso 887d4b9)"
F=/opt/withus-iam/index.html
echo "index: fontiEsitoHTML=$(grep -c fontiEsitoHTML "$F" 2>/dev/null)  f-prog=$(grep -c 'f-prog' "$F" 2>/dev/null)  Verifica-in-corso=$(grep -c 'Verifica in corso' "$F" 2>/dev/null)"
echo "autopull.sh: IAM alla riga $(grep -n 'IAM=/opt/withus-iam' /opt/withus-backend/deploy/autopull.sh 2>/dev/null | head -1 | cut -d: -f1), early-exit alla riga $(grep -n '\"\$LOCAL\" = \"\$REMOTE\"' /opt/withus-backend/deploy/autopull.sh 2>/dev/null | head -1 | cut -d: -f1)"
echo "log deploy IAM: $(journalctl -u withus-autopull 2>/dev/null | grep -i 'IAM aggiornato' | tail -1)"
echo "(fine)"
