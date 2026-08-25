#!/usr/bin/env bash
set -u
IAM=/opt/withus-iam
echo "IAM HEAD: $(git -C "$IAM" rev-parse --short HEAD 2>/dev/null) (atteso 402823f)"
echo "index panel-pagamenti: $(grep -c panel-pagamenti "$IAM/index.html" 2>/dev/null)"
echo "index versione withus-one: $(grep -oE 'withus-one.js\?v=[0-9a-z]+' "$IAM/index.html" 2>/dev/null)"
echo "withus-one TITOLI pagamenti: $(grep -c 'pagamenti:.*Link di pagamento' "$IAM/withus-one.js" 2>/dev/null)"
echo "(fine)"
