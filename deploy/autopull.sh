#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Auto-deploy WithUs: tira l'ultima versione del branch e riavvia SOLO i servizi
# che sono cambiati. Lanciato da un timer systemd ogni minuto → nessun comando
# manuale nel terminale. La sessione Allianz NON si perde (i cookie sono su disco).
# ─────────────────────────────────────────────────────────────────────────────
set -u
REPO=/opt/withus-backend
BR=claude/vibrant-tesla-o0glfd
cd "$REPO" || exit 0

git fetch origin "$BR" --quiet 2>/dev/null || { echo "[autopull] fetch fallito"; exit 0; }
LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE=$(git rev-parse FETCH_HEAD 2>/dev/null)
[ -z "$REMOTE" ] && exit 0
[ "$LOCAL" = "$REMOTE" ] && exit 0   # nessuna novità

CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE" 2>/dev/null)
echo "[autopull] $(date '+%F %T') aggiorno ${LOCAL:0:7} -> ${REMOTE:0:7}"
git checkout -B "$BR" "$REMOTE" --quiet

# dipendenze (solo se cambiano i package.json)
echo "$CHANGED" | grep -q '^package.json'                && npm install --silent 2>/dev/null
echo "$CHANGED" | grep -q '^scraper/allianz/package.json' && ( cd scraper/allianz && npm install --silent 2>/dev/null )
echo "$CHANGED" | grep -q '^scraper/moto/package.json'    && ( cd scraper/moto && npm install --silent 2>/dev/null )

# riavvii mirati
if echo "$CHANGED" | grep -qE '^(server/|package\.json)'; then systemctl restart withus-backend && echo "[autopull] withus-backend riavviato"; fi
if echo "$CHANGED" | grep -q '^scraper/allianz/';        then systemctl restart allianz-scraper && echo "[autopull] allianz-scraper riavviato"; fi
if echo "$CHANGED" | grep -q '^scraper/moto/';           then systemctl restart moto-scraper   2>/dev/null && echo "[autopull] moto-scraper riavviato"; fi

echo "[autopull] fatto."
