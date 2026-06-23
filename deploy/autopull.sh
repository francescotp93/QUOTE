#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Auto-deploy WithUs: tira l'ultima versione del branch, INSTALLA da solo i nuovi
# scraper (nuove compagnie) e riavvia SOLO i servizi cambiati. Lanciato da un timer
# systemd ogni minuto → nessun comando manuale nel terminale, mai.
# La sessione di ogni scraper NON si perde ai riavvii (i cookie sono su disco).
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

# dipendenze backend (solo se cambia il package.json)
echo "$CHANGED" | grep -q '^package.json' && npm install --silent 2>/dev/null

# ── Auto-installa i NUOVI scraper (nuove compagnie) ──────────────────────────
# Per ogni scraper/<compagnia>/deploy/*.service non ancora installato: npm install,
# scarica il browser, copia il service, lo abilita e lo avvia. Zero terminale.
for svc in scraper/*/deploy/*.service; do
  [ -f "$svc" ] || continue
  name=$(basename "$svc")
  dir=$(dirname "$(dirname "$svc")")        # scraper/<compagnia>
  if [ ! -f "/etc/systemd/system/$name" ]; then
    echo "[autopull] NUOVO scraper '$dir' → installo $name"
    ( cd "$dir" && npm install --silent 2>/dev/null && npx --yes playwright install chromium >/dev/null 2>&1 )
    chmod +x "$dir"/*.sh 2>/dev/null
    cp "$svc" /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable --now "$name" && echo "[autopull] $name installato e avviato ✅"
  else
    # service già installato ma il file nel repo è cambiato → aggiorna la definizione
    if echo "$CHANGED" | grep -q "^${svc}$"; then
      cp "$svc" /etc/systemd/system/ && systemctl daemon-reload && echo "[autopull] $name (definizione aggiornata)"
    fi
  fi
done

# ── Riavvii mirati: ogni scraper con cartella cambiata riavvia il suo servizio ─
for dir in scraper/*/; do
  comp=$(basename "${dir%/}")
  echo "$CHANGED" | grep -q "^scraper/$comp/" || continue
  svcfile=$(ls "$dir"deploy/*.service 2>/dev/null | head -1)
  [ -n "$svcfile" ] || continue
  name=$(basename "$svcfile")
  # se la cartella ha un package.json cambiato, reinstalla le dipendenze
  echo "$CHANGED" | grep -q "^scraper/$comp/package.json" && ( cd "$dir" && npm install --silent 2>/dev/null )
  systemctl restart "$name" 2>/dev/null && echo "[autopull] $name riavviato"
done

# ── Backend ──────────────────────────────────────────────────────────────────
if echo "$CHANGED" | grep -qE '^(server/|package\.json)'; then
  systemctl restart withus-backend && echo "[autopull] withus-backend riavviato"
fi

echo "[autopull] fatto."
