#!/usr/bin/env bash
set -u
echo "== blocco IAM in autopull.sh (righe 118-175) =="
sed -n '118,175p' /opt/withus-backend/deploy/autopull.sh 2>/dev/null
echo "== /opt/withus-iam: e' sporco? divergente? =="
echo "status:"; git -C /opt/withus-iam status --short 2>/dev/null | head -20
echo "HEAD:        $(git -C /opt/withus-iam rev-parse --short HEAD 2>/dev/null)"
echo "origin/main: $(git -C /opt/withus-iam rev-parse --short origin/main 2>/dev/null)"
echo "merge-base:  $(git -C /opt/withus-iam merge-base HEAD origin/main 2>/dev/null | cut -c1-7)"
echo "ahead/behind: $(git -C /opt/withus-iam rev-list --left-right --count HEAD...origin/main 2>/dev/null)"
echo "(fine)"
