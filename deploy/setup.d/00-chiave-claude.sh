#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Autorizza la chiave SSH di Claude Code sul VPS (richiesto da Francesco,
# 29/07/2026). Idempotente: se la chiave c'è già non fa nulla.
#
# REVOCA in qualsiasi momento: togliere la riga che finisce con "claude-code"
# da /root/.ssh/authorized_keys (o eliminare questo file e la riga a mano).
# ─────────────────────────────────────────────────────────────────────────────
set -u

CHIAVE='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO1fzZGAImRQYHcC7XuOVdLubwqvp0UT6OIInw1BrEAY claude-code'
DEST=/root/.ssh/authorized_keys

mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch "$DEST"
chmod 600 "$DEST"

if grep -qF "claude-code" "$DEST"; then
  echo "chiave claude-code già presente: niente da fare"
else
  echo "$CHIAVE" >> "$DEST"
  echo "chiave claude-code aggiunta a $DEST"
fi
exit 0
