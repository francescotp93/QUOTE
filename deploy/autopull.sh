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
# Aggiornamento robusto: se un file locale modificato bloccherebbe il checkout,
# si forza l'allineamento al remoto (i file ignorati, es. fonti.store.json, restano).
git checkout -B "$BR" "$REMOTE" --quiet 2>/dev/null || { git reset --hard "$REMOTE" --quiet 2>/dev/null; git checkout -B "$BR" "$REMOTE" --quiet 2>/dev/null; }
git reset --hard "$REMOTE" --quiet 2>/dev/null

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

# ── Configurazioni di sistema versionate (nginx) ─────────────────────────────
# Ogni file in deploy/nginx/*.conf viene applicato con rete di sicurezza:
# copia .bak del precedente, `nginx -t` PRIMA del reload, rollback se fallisce.
# Così una config sbagliata non butta mai giù il server.
if command -v nginx >/dev/null 2>&1; then
  for conf in deploy/nginx/*.conf; do
    [ -f "$conf" ] || continue
    name=$(basename "$conf")
    dest="/etc/nginx/sites-available/$name"
    if [ ! -f "$dest" ] || ! cmp -s "$conf" "$dest"; then
      [ -f "$dest" ] && cp "$dest" "$dest.bak"
      cp "$conf" "$dest"
      ln -sf "$dest" "/etc/nginx/sites-enabled/$name"
      if nginx -t >/dev/null 2>&1; then
        systemctl reload nginx && echo "[autopull] nginx: $name applicato"
      else
        echo "[autopull] nginx: $name NON valido → ROLLBACK"
        if [ -f "$dest.bak" ]; then cp "$dest.bak" "$dest"; else rm -f "$dest" "/etc/nginx/sites-enabled/$name"; fi
        nginx -t >/dev/null 2>&1 && systemctl reload nginx
      fi
    fi
  done
fi

# ── Script di primo impianto (una volta sola, con ritentativo) ───────────────
# deploy/setup.d/NN-nome.sh: eseguito a ogni giro finché non esce con 0;
# poi un segnalino in /var/lib/withus-autopull lo salta per sempre.
# Log per ciascuno: /var/lib/withus-autopull/<nome>.log
SEGNI=/var/lib/withus-autopull
mkdir -p "$SEGNI"
for s in deploy/setup.d/*.sh; do
  [ -f "$s" ] || continue
  n=$(basename "$s")
  [ -f "$SEGNI/$n.fatto" ] && continue
  chmod +x "$s"
  if "$REPO/$s" >>"$SEGNI/$n.log" 2>&1; then
    touch "$SEGNI/$n.fatto"
    echo "[autopull] impianto '$n' completato ✅ (log in $SEGNI/$n.log)"
  else
    echo "[autopull] impianto '$n' non ancora completo, riproverò (log in $SEGNI/$n.log)"
  fi
done

# ── Facciate del dominio unico: seguono SEMPRE main ──────────────────────────
# Il backend (questo checkout) resta sul suo branch; le facciate IAM e QUOTO
# servite da nginx si aggiornano da main, come facevano le GitHub Pages.
for fe in /opt/withus-iam /opt/withus-quoto; do
  [ -d "$fe/.git" ] || continue
  FE_LOC=$(git -C "$fe" rev-parse HEAD 2>/dev/null)
  git -C "$fe" fetch origin main --quiet 2>/dev/null || continue
  FE_REM=$(git -C "$fe" rev-parse FETCH_HEAD 2>/dev/null)
  [ -n "$FE_REM" ] && [ "$FE_LOC" != "$FE_REM" ] || continue
  git -C "$fe" reset --hard FETCH_HEAD --quiet && echo "[autopull] facciata $(basename "$fe") aggiornata ${FE_LOC:0:7} -> ${FE_REM:0:7}"
done

echo "[autopull] fatto."
