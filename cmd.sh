#!/usr/bin/env bash
set -u
echo "== chi esegue autopull =="
systemctl show withus-autopull.service -p User -p Group -p DynamicUser -p ProtectHome -p PrivateTmp -p ReadWritePaths 2>/dev/null
echo "== ownership e permessi =="
echo "IAM dir:  $(stat -c '%U:%G %a' /opt/withus-iam 2>/dev/null)"
echo "IAM .git: $(stat -c '%U:%G %a' /opt/withus-iam/.git 2>/dev/null)"
echo "backend:  $(stat -c '%U:%G %a' /opt/withus-backend 2>/dev/null)"
echo "/etc/gitconfig: $(stat -c '%U:%G %a' /etc/gitconfig 2>/dev/null || echo assente)"
echo "safe.directory system: $(git config --system --get-all safe.directory 2>/dev/null | tr '\n' ' ')"
echo "== l'autopull ha MAI deployato IAM? =="
journalctl -u withus-autopull 2>/dev/null | grep -iE "IAM aggiornato|withus-iam|fatal|dubious|denied" | tail -8
echo "(fine)"
