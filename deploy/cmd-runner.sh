#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Runner comandi "Claude ↔ server" via GitHub (canale autonomo, niente terminale).
#  - Claude scrive un comando sul branch 'claude-cmd' (file cmd.id + cmd.sh).
#  - Questo runner (timer ogni 30s) lo esegue nel contesto /opt/withus-backend e
#    ricarica l'output (out.txt) sullo stesso branch, che Claude legge via GitHub.
#  - SOLO comandi di diagnostica/dev; il token GitHub sta in /root/.withus-gh-token.
# Lavora in un clone DEDICATO (/opt/withus-cmd) per non interferire col deploy.
# ─────────────────────────────────────────────────────────────────────────────
set -u
export HOME=/root
DIR=/opt/withus-cmd
TOKENF=/root/.withus-gh-token
REPO_PATH=francescotp93/QUOTE
BR=claude-cmd
[ -f "$TOKENF" ] || exit 0
TOKEN=$(tr -d ' \n\r\t' < "$TOKENF")
[ -z "$TOKEN" ] && exit 0
URL="https://x-access-token:${TOKEN}@github.com/${REPO_PATH}.git"

if [ ! -d "$DIR/.git" ]; then
  git clone --quiet "$URL" "$DIR" 2>/dev/null || exit 0
fi
cd "$DIR" || exit 0
git config --global --add safe.directory "$DIR" 2>/dev/null || true
git remote set-url origin "$URL" 2>/dev/null
git fetch origin --quiet 2>/dev/null || exit 0
git show-ref --verify --quiet refs/remotes/origin/"$BR" || exit 0   # nessun comando ancora
git checkout -B "$BR" origin/"$BR" --quiet 2>/dev/null
git reset --hard origin/"$BR" --quiet 2>/dev/null

ID=$(tr -d ' \n\r\t' < cmd.id 2>/dev/null)
[ -z "$ID" ] && exit 0
[ "$ID" = "$(tr -d ' \n\r\t' < .done 2>/dev/null)" ] && exit 0   # già eseguito

# Esegue il comando (contesto: la cartella del backend), con timeout di sicurezza.
OUT=$( { cd /opt/withus-backend 2>/dev/null && timeout 250 bash "$DIR/cmd.sh"; } 2>&1 | tail -c 95000 )
RC=$?
{ echo "id: $ID  exit: $RC  $(date '+%F %T')"; echo "----"; printf '%s' "$OUT"; } > out.txt
echo "$ID" > .done
git add out.txt .done 2>/dev/null
git -c user.email=runner@withus.local -c user.name=cmd-runner commit -q -m "cmd-runner: out $ID" 2>/dev/null
git push origin "$BR" --quiet 2>/dev/null
