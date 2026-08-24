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
# Dal 02/08/2026 la verita' e' una sola e sta su main: qui c'e' sia il frontend
# (che GitHub Pages pubblica da main) sia il backend con i dieci scraper. Finche'
# la VPS insegue ancora il ramo vecchio questa riga non ha effetto: diventa viva
# nel momento in cui si sposta la macchina su main, e da allora la tiene li'.
BR=main
# Il service gira da root ma il repo è di 'withus': senza HOME git non legge ~/.gitconfig e
# rifiuta il repo ("dubious ownership"). Forzo HOME e l'eccezione safe.directory (a livello di
# sistema + utente) così il fetch funziona sempre, anche nel contesto systemd.
export HOME="${HOME:-/root}"
git config --system --get-all safe.directory 2>/dev/null | grep -qx "$REPO" || git config --system --add safe.directory "$REPO" 2>/dev/null || true
git config --global --get-all safe.directory 2>/dev/null | grep -qx "$REPO" || git config --global --add safe.directory "$REPO" 2>/dev/null || true

# ── IAM (frontend statico servito da Caddy da QUESTA macchina) ───────────────
# Dal 21/08/2026 anche IAM e' ospitato qui: Caddy lo serve da /opt/withus-iam.
# DEVE stare PRIMA del "nessuna novita' → exit 0" del backend qui sotto: IAM ha
# un suo repo (Agente-sospesi), quindi cambia in modo indipendente da QUOTE. Se
# lo si controlla solo quando cambia il backend, un fix pubblicato solo su IAM
# non arriva mai in produzione finche' non si tocca anche QUOTE — ed e' proprio
# il buco che teneva iam.withusassicurazioni.it fermo a una versione vecchia.
# Si usa `git -C` (niente cd): non si tocca la CWD dei loop scraper. Agisce solo
# se la cartella e' gia' clonata. Niente da riavviare: Caddy rilegge i file statici.
IAM=/opt/withus-iam
if [ -d "$IAM/.git" ]; then
  git config --system --get-all safe.directory 2>/dev/null | grep -qx "$IAM" || git config --system --add safe.directory "$IAM" 2>/dev/null || true
  if git -C "$IAM" fetch origin main --quiet 2>/dev/null; then
    L=$(git -C "$IAM" rev-parse HEAD 2>/dev/null); R=$(git -C "$IAM" rev-parse FETCH_HEAD 2>/dev/null)
    if [ -n "$R" ] && [ "$L" != "$R" ]; then
      git -C "$IAM" reset --hard "$R" --quiet 2>/dev/null && echo "[autopull] IAM aggiornato ${L:0:7} -> ${R:0:7}"
    fi
  fi
fi

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

# ── Self-heal scraper Italiana: lo riavvio SOLO se è cambiato il suo codice (scraper/italiana/).
#    Prima lo riavviavo ad ogni deploy (anche solo frontend), causando blackout di ~15s del
#    recupero veicolo/premio ad ogni push. La sessione Plurima persiste in userdata.
if echo "$CHANGED" | grep -q '^scraper/italiana/'; then
  systemctl restart italiana-scraper 2>/dev/null && echo "[autopull] italiana-scraper riavviato (codice scraper cambiato)"
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

# ── SELF-HEAL: ogni scraper installato dev'essere ENABLED (riparte dopo un reboot del
#    VPS) e ATTIVO. Un service 'disabled' non torna su dopo un riavvio e la compagnia
#    resta muta finché qualcuno non lo riavvia a mano — è già successo con HDI (giù per
#    un intero giorno dopo un reboot notturno). enable/start sono idempotenti: su chi è
#    già a posto non fanno nulla, così questo controllo può girare ad ogni giro.
for svc in scraper/*/deploy/*.service; do
  [ -f "$svc" ] || continue
  case "$svc" in scraper/_*) continue;; esac
  name=$(basename "$svc")
  [ -f "/etc/systemd/system/$name" ] || continue
  [ "$(systemctl is-enabled "$name" 2>/dev/null)" = "enabled" ] || { systemctl enable "$name" >/dev/null 2>&1 && echo "[autopull] $name ri-abilitato (era disabled)"; }
  case "$(systemctl is-active "$name" 2>/dev/null)" in
    inactive|failed) systemctl start "$name" >/dev/null 2>&1 && echo "[autopull] $name riavviato (era giù)";;
  esac
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

echo "[autopull] fatto."
