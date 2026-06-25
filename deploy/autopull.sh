#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Auto-deploy WithUs: tira l'ultima versione del branch, riavvia il BACKEND per
# primo (così il codice si aggiorna sempre), poi installa/riavvia gli scraper in
# modo NON bloccante (con timeout e in background) → un'installazione lenta di uno
# scraper non blocca mai l'aggiornamento del backend.
# Lanciato da un timer systemd ogni minuto. Le sessioni scraper non si perdono.
# ─────────────────────────────────────────────────────────────────────────────
set -u
REPO=/opt/withus-backend
BR=claude/vibrant-tesla-o0glfd
# Il service gira da root ma il repo è di 'withus': senza HOME git non legge ~/.gitconfig e
# rifiuta il repo ("dubious ownership"). Forzo HOME e l'eccezione safe.directory (a livello di
# sistema + utente) così il fetch funziona sempre, anche nel contesto systemd.
export HOME="${HOME:-/root}"
git config --system --get-all safe.directory 2>/dev/null | grep -qx "$REPO" || git config --system --add safe.directory "$REPO" 2>/dev/null || true
git config --global --get-all safe.directory 2>/dev/null | grep -qx "$REPO" || git config --global --add safe.directory "$REPO" 2>/dev/null || true
cd "$REPO" || exit 0

git fetch origin "$BR" --quiet 2>/dev/null || { echo "[autopull] fetch fallito"; exit 0; }
LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE=$(git rev-parse FETCH_HEAD 2>/dev/null)
[ -z "$REMOTE" ] && exit 0
[ "$LOCAL" = "$REMOTE" ] && exit 0   # nessuna novità

CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE" 2>/dev/null)
echo "[autopull] $(date '+%F %T') aggiorno ${LOCAL:0:7} -> ${REMOTE:0:7}"
# Allineamento robusto al remoto (i file ignorati, es. fonti.store.json, restano).
git checkout -B "$BR" "$REMOTE" --quiet 2>/dev/null || { git reset --hard "$REMOTE" --quiet 2>/dev/null; git checkout -B "$BR" "$REMOTE" --quiet 2>/dev/null; }
git reset --hard "$REMOTE" --quiet 2>/dev/null

# ── BACKEND PER PRIMO: il codice si aggiorna SEMPRE, prima di toccare gli scraper ─
echo "$CHANGED" | grep -q '^package.json' && timeout 300 npm install --silent 2>/dev/null
if echo "$CHANGED" | grep -qE '^(server/|package\.json)'; then
  systemctl restart withus-backend && echo "[autopull] withus-backend riavviato ✅"
fi

# ── Self-heal scraper Italiana: lo riavvio ad OGNI avanzamento del repo. Le sue modifiche
#    non venivano sempre rilevate dal diff (anche per via dei reset manuali), e così restava
#    sul codice vecchio. La sessione Plurima persiste in userdata, quindi è sicuro.
if echo "$CHANGED" | grep -q '^scraper/italiana/' || [ -f /etc/systemd/system/italiana-scraper.service ]; then
  systemctl restart italiana-scraper 2>/dev/null && echo "[autopull] italiana-scraper riavviato (self-heal)"
fi

# ── Scraper: install/aggiornamenti con TIMEOUT, mai bloccanti per il backend ─────
for svc in scraper/*/deploy/*.service; do
  [ -f "$svc" ] || continue
  case "$svc" in scraper/_*) continue;; esac   # ignora template/scaffold (scraper/_template ecc.)
  name=$(basename "$svc")
  dir=$(dirname "$(dirname "$svc")")        # scraper/<compagnia>
  if [ ! -f "/etc/systemd/system/$name" ]; then
    echo "[autopull] NUOVO scraper '$dir' → installo $name (in background)"
    chmod +x "$dir"/*.sh 2>/dev/null
    cp "$svc" /etc/systemd/system/
    systemctl daemon-reload
    # Installazione pesante (npm + browser) in BACKGROUND con timeout: poi avvia il servizio.
    ( cd "$dir" \
        && timeout 300 npm install --silent 2>/dev/null \
        && timeout 600 npx --yes playwright install chromium >/dev/null 2>&1 \
        ; systemctl enable --now "$name" && echo "[autopull] $name avviato ✅" ) &
  else
    if echo "$CHANGED" | grep -q "^${svc}$"; then
      cp "$svc" /etc/systemd/system/ && systemctl daemon-reload && echo "[autopull] $name (definizione aggiornata)"
    fi
  fi
done

# ── Riavvii mirati: ogni scraper con cartella cambiata riavvia il suo servizio ─
for dir in scraper/*/; do
  comp=$(basename "${dir%/}")
  case "$comp" in _*) continue;; esac   # ignora template/scaffold
  echo "$CHANGED" | grep -q "^scraper/$comp/" || continue
  svcfile=$(ls "$dir"deploy/*.service 2>/dev/null | head -1)
  [ -n "$svcfile" ] || continue
  name=$(basename "$svcfile")
  [ -f "/etc/systemd/system/$name" ] || continue   # se non ancora installato, ci pensa il loop sopra
  echo "$CHANGED" | grep -q "^scraper/$comp/package.json" && ( cd "$dir" && timeout 300 npm install --silent 2>/dev/null )
  systemctl restart "$name" 2>/dev/null && echo "[autopull] $name riavviato"
done

echo "[autopull] fatto."
