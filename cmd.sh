#!/usr/bin/env bash
# Perche' /opt/withus-backend non tira main? (sola lettura)
set -u
B=/opt/withus-backend
echo "branch:  $(git -C "$B" rev-parse --abbrev-ref HEAD 2>/dev/null)"
echo "HEAD:    $(git -C "$B" rev-parse --short HEAD 2>/dev/null)"
echo "origin:  $(git -C "$B" remote get-url origin 2>/dev/null | sed -E 's#(x-access-token:)[^@]+@#\1***@#')"
git -C "$B" fetch origin main 2>bkerr.log; echo "fetch exit=$?"
echo "fetch err: $(head -c 250 bkerr.log)"
echo "origin/main (FETCH_HEAD): $(git -C "$B" rev-parse --short FETCH_HEAD 2>/dev/null)"
echo "atteso c9f8da5"
echo "tree sporco?:"; git -C "$B" status --porcelain 2>/dev/null | head -8
echo "-- timer attivo? --"; systemctl is-active withus-autopull.timer 2>/dev/null; systemctl is-enabled withus-autopull.timer 2>/dev/null
echo "-- ultimo giro autopull (righe utili) --"; journalctl -u withus-autopull -n 8 --no-pager 2>/dev/null | tail -8
echo "(fine)"
