#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# PRIMO IMPIANTO — dominio unico iam.withusassicurazioni.it sul VPS (OVH)
#
# Lanciato da deploy/autopull.sh: viene ritentato a ogni giro (1/min) finché
# non finisce BENE (exit 0). Ogni passo è idempotente: rieseguirlo non fa danni.
#
# Passi:
#   1. guardia: le porte 80/443 devono essere libere o già di nginx
#      (se le tiene un altro programma NON si tocca niente: c'è api. in produzione)
#   2. installa nginx + certbot se mancano
#   3. prepara i checkout delle facciate: /opt/withus-quoto e /opt/withus-iam (branch main)
#   4. attiva il sito nginx (copia + nginx -t + reload, con .bak)
#   5. aspetta che il DNS punti qui (record A su Aruba → 51.254.142.199),
#      POI chiede il certificato a Let's Encrypt (mai prima: eviterebbe
#      tentativi a vuoto e i limiti di Let's Encrypt)
#
# Log: /var/lib/withus-autopull/10-dominio-unico.sh.log
# ─────────────────────────────────────────────────────────────────────────────
set -u

DOMINIO=iam.withusassicurazioni.it
IP_VPS=51.254.142.199
EMAIL=francesco.oddo199307@gmail.com
REPO_QUOTE=/opt/withus-backend          # checkout già esistente (backend, non si tocca)
FACCIATA_QUOTO=/opt/withus-quoto
FACCIATA_IAM=/opt/withus-iam
CONF=deploy/nginx/iam.withusassicurazioni.it.conf

log(){ echo "[dominio-unico] $(date '+%F %T') $*"; }

# ── 1. Guardia sulle porte: non si rompe la produzione ───────────────────────
occupata_da_altri(){
  # vero se la porta è in ascolto da un processo che NON è nginx
  ss -tlnp "sport = :$1" 2>/dev/null | tail -n +2 | grep -q . || return 1
  ss -tlnp "sport = :$1" 2>/dev/null | grep -vq nginx
}
for porta in 80 443; do
  if occupata_da_altri "$porta"; then
    log "STOP: la porta $porta è occupata da un programma diverso da nginx."
    log "Non tocco niente (api.withusassicurazioni.it è in produzione)."
    log "Serve un controllo umano/SSH: 'ss -tlnp sport = :$porta' per vedere chi è."
    exit 1
  fi
done

# ── 2. nginx + certbot ───────────────────────────────────────────────────────
if ! command -v nginx >/dev/null 2>&1; then
  log "installo nginx…"
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx >/dev/null || { log "installazione nginx fallita"; exit 1; }
fi
if ! command -v certbot >/dev/null 2>&1; then
  log "installo certbot…"
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-nginx >/dev/null || { log "installazione certbot fallita"; exit 1; }
fi

# ── 3. Checkout delle facciate (branch main, solo lettura) ───────────────────
URL_QUOTE=$(git -C "$REPO_QUOTE" remote get-url origin 2>/dev/null)
[ -n "$URL_QUOTE" ] || { log "impossibile leggere l'origin di $REPO_QUOTE"; exit 1; }
# il repo IAM sta nello stesso account: si ricava l'indirizzo cambiando il nome
URL_IAM=$(echo "$URL_QUOTE" | sed -E 's#(/|:)(QUOTE|quote)(\.git)?$#\1Agente-sospesi\3#')

if [ ! -d "$FACCIATA_QUOTO/.git" ]; then
  log "clono la facciata QUOTO (main) in $FACCIATA_QUOTO…"
  git clone --branch main --single-branch "$URL_QUOTE" "$FACCIATA_QUOTO" || { log "clone QUOTO fallito"; exit 1; }
fi
if [ ! -d "$FACCIATA_IAM/.git" ]; then
  log "clono la facciata IAM (main) in $FACCIATA_IAM…"
  git clone --branch main --single-branch "$URL_IAM" "$FACCIATA_IAM" \
    || git clone --branch main --single-branch "https://github.com/francescotp93/Agente-sospesi.git" "$FACCIATA_IAM" \
    || { log "clone IAM fallito (repo privato? serve una chiave/token)"; exit 1; }
fi

# ── 4. Sito nginx attivo ─────────────────────────────────────────────────────
[ -f "$CONF" ] || { log "manca $CONF nel repo"; exit 1; }
DEST=/etc/nginx/sites-available/$(basename "$CONF")
if [ ! -f "$DEST" ] || ! cmp -s "$CONF" "$DEST"; then
  [ -f "$DEST" ] && cp "$DEST" "$DEST.bak"
  cp "$CONF" "$DEST"
fi
ln -sf "$DEST" "/etc/nginx/sites-enabled/$(basename "$CONF")"
if ! nginx -t >/dev/null 2>&1; then
  log "nginx -t FALLITO: ripristino e mi fermo."
  if [ -f "$DEST.bak" ]; then cp "$DEST.bak" "$DEST"; else rm -f "$DEST" "/etc/nginx/sites-enabled/$(basename "$CONF")"; fi
  exit 1
fi
systemctl enable --now nginx >/dev/null 2>&1
systemctl reload nginx || systemctl restart nginx || { log "nginx non riparte"; exit 1; }
log "sito nginx attivo (per ora in HTTP)."

# ── 5. Certificato: SOLO quando il DNS punta qui ─────────────────────────────
if certbot certificates 2>/dev/null | grep -q "$DOMINIO"; then
  log "certificato già presente: impianto completo. ✅"
  exit 0
fi
RISOLTO=$(getent ahostsv4 "$DOMINIO" 2>/dev/null | awk '{print $1; exit}')
if [ "$RISOLTO" != "$IP_VPS" ]; then
  log "aspetto il DNS: $DOMINIO risolve '$RISOLTO', serve $IP_VPS (record A su Aruba). Riprovo al prossimo giro."
  exit 1
fi
log "DNS a posto: chiedo il certificato…"
certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos -m "$EMAIL" --redirect \
  || { log "certbot fallito: riprovo al prossimo giro"; exit 1; }
log "certificato ottenuto, HTTPS attivo con rinvio automatico. Impianto completo. ✅"
exit 0
