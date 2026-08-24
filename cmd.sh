#!/usr/bin/env bash
# Riproduce la logica del blocco IAM SENZA reset (sola lettura): dove si rompe?
set -u
IAM=/opt/withus-iam
echo "remote url: $(git -C "$IAM" remote get-url origin 2>&1)"
git -C "$IAM" fetch origin main 2>ferr.log; echo "fetch exit=$?"
echo "fetch stderr: $(head -c 300 ferr.log)"
L=$(git -C "$IAM" rev-parse HEAD 2>/dev/null); R=$(git -C "$IAM" rev-parse FETCH_HEAD 2>/dev/null)
echo "L(HEAD)=$L"
echo "R(FETCH_HEAD)=$R"
echo "L==R? $([ "$L" = "$R" ] && echo si || echo no)"
git -C "$IAM" merge-base --is-ancestor "$L" "$R" 2>/dev/null; echo "L e' antenato di R (FF pulito)? exit=$?"
echo "tree sporco?:"; git -C "$IAM" status --porcelain 2>/dev/null | head -5
echo "-- se il blocco girasse ORA, resetterebbe a: ${R:0:7} --"
echo "(fine)"
