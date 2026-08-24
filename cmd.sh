#!/usr/bin/env bash
set -u
echo "== servizio autopull: ExecStart =="
systemctl cat withus-autopull.service 2>/dev/null | grep -iE "ExecStart|WorkingDirectory" | head
SCRIPT=$(systemctl cat withus-autopull.service 2>/dev/null | grep -oE "/[^ ]+autopull\.sh" | head -1)
echo "script: ${SCRIPT:-?}"
echo "== lo script installato contiene il blocco IAM? =="
grep -niE "withus-iam|Agente-sospesi" "$SCRIPT" 2>/dev/null | head
echo "== stato repo /opt/withus-iam =="
echo "branch: $(git -C /opt/withus-iam rev-parse --abbrev-ref HEAD 2>/dev/null)"
git -C /opt/withus-iam remote -v 2>/dev/null | head -1
git -C /opt/withus-iam fetch origin --quiet 2>/dev/null
echo "HEAD locale:  $(git -C /opt/withus-iam rev-parse --short HEAD 2>/dev/null)"
echo "origin/main:  $(git -C /opt/withus-iam rev-parse --short origin/main 2>/dev/null)"
echo "== ultime righe log autopull =="
journalctl -u withus-autopull -n 15 --no-pager 2>/dev/null | tail -15
echo "(fine)"
