#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Dominio unico, primo impianto (15/09/2026, deciso da Francesco il 28/07/2026).
#
# Cosa fa, una volta sola:
#   1. copia i siti versionati (deploy/caddy/*.caddy) in /etc/caddy/withus/;
#   2. aggiunge al Caddyfile UNA riga: `import /etc/caddy/withus/*.caddy`;
#   3. valida, ricarica, e controlla che api. risponda ancora 200 e che la
#      configurazione in esecuzione contenga davvero il sito nuovo.
#
# Se un passo fallisce rimette il Caddyfile di prima e ricarica: Caddy torna
# esattamente com'era. Esce con 1, cosi' l'autopull ritenta al giro dopo e il
# log (/var/lib/withus-autopull/20-dominio-unico-caddy.sh.log) dice perche'.
#
# Il blocco api.withusassicurazioni.it non viene letto ne' scritto: si
# aggiunge una riga in fondo e basta. Idempotente: se la riga c'e' gia',
# ricopia i file, valida e ricarica soltanto.
#
# Cosa NON fa: il DNS. Finche' iam. punta a GitHub Pages il blocco nuovo non
# riceve traffico; il cambio su Aruba lo fa Francesco (deploy/TRASLOCO-OVH.md).
# ─────────────────────────────────────────────────────────────────────────────
set -u

CF=/etc/caddy/Caddyfile
DIR=/etc/caddy/withus
SRC=/opt/withus-backend/deploy/caddy
IMPORT='import /etc/caddy/withus/*.caddy'
API=https://api.withusassicurazioni.it/health

log() { echo "[$(date '+%F %T')] $*"; }

command -v caddy >/dev/null 2>&1 || { log "caddy non installato: mi fermo"; exit 1; }
[ -f "$CF" ] || { log "manca $CF: mi fermo"; exit 1; }
[ -f /opt/withus-iam/index.html ] || { log "manca /opt/withus-iam/index.html (IAM non ancora clonato): riprovero'"; exit 1; }
[ -f /opt/withus-backend/index.html ] || { log "manca /opt/withus-backend/index.html: mi fermo"; exit 1; }
ls "$SRC"/*.caddy >/dev/null 2>&1 || { log "nessun sito in $SRC: niente da fare"; exit 1; }

# Prima di tutto: com'e' adesso deve restare recuperabile.
BAK="$CF.buona-$(date +%Y%m%d-%H%M%S)"
cp -a "$CF" "$BAK" || { log "non riesco a fare la copia di sicurezza: mi fermo"; exit 1; }
log "copia di sicurezza: $BAK"

ripristina() {
  log "RIENTRO: rimetto il Caddyfile di prima e i siti di prima"
  cp -a "$BAK" "$CF"
  rm -rf "$DIR"
  [ -d "$DIR.prima" ] && mv "$DIR.prima" "$DIR"
  systemctl reload caddy >/dev/null 2>&1 || systemctl restart caddy >/dev/null 2>&1
  log "stato caddy dopo il rientro: $(systemctl is-active caddy)"
}

# 1. i siti versionati
rm -rf "$DIR.prima"
[ -d "$DIR" ] && cp -a "$DIR" "$DIR.prima"
mkdir -p "$DIR" && chmod 755 "$DIR"
for f in "$SRC"/*.caddy; do
  install -m 644 "$f" "$DIR/" || { log "copia di $f fallita"; ripristina; exit 1; }
done
log "siti copiati in $DIR: $(ls "$DIR" | tr '\n' ' ')"

# 2. la riga di import, una volta sola, in fondo
if grep -qxF "$IMPORT" "$CF"; then
  log "la riga di import c'e' gia'"
else
  printf '\n# Siti versionati in QUOTE/deploy/caddy/, copiati qui dall'"'"'autopull (15/09/2026).\n# Si modificano nel repository, non qui: deploy/autopull.sh li valida e li ricarica.\n%s\n' "$IMPORT" >> "$CF"
  log "riga di import aggiunta al Caddyfile"
fi

# 3. vale? si carica? api. risponde ancora? il sito nuovo e' davvero in funzione?
if ! caddy validate --config "$CF" --adapter caddyfile >"$DIR/.validate.log" 2>&1; then
  log "caddy validate NON passa:"; cat "$DIR/.validate.log"
  ripristina; exit 1
fi
log "caddy validate: ok"

if ! systemctl reload caddy; then
  log "systemctl reload caddy FALLITO (la validazione non basta: deploy/REGISTRO-RICHIESTE.md)"
  journalctl -u caddy --since '-2min' --no-pager 2>/dev/null | tail -15
  ripristina; exit 1
fi
sleep 2

STATO=$(systemctl is-active caddy)
[ "$STATO" = "active" ] || { log "caddy non e' active dopo il reload ($STATO)"; ripristina; exit 1; }

COD=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$API" || echo 000)
[ "$COD" = "200" ] || { log "api. risponde $COD invece di 200: rientro"; ripristina; exit 1; }
log "api. risponde ancora 200"

# La prova vera: la configurazione IN ESECUZIONE (non il file) contiene iam.
if curl -s -m 5 http://127.0.0.1:2019/config/ 2>/dev/null | grep -q 'iam.withusassicurazioni.it'; then
  log "il sito iam.withusassicurazioni.it e' nella configurazione in esecuzione ✅"
else
  log "il sito NON risulta nella configurazione in esecuzione: rientro"
  ripristina; exit 1
fi

rm -rf "$DIR.prima" "$DIR/.validate.log"
log "fatto. Prossimo passo (Francesco, su Aruba): iam → A 51.254.142.199. Verifica: curl -H 'Host: iam.withusassicurazioni.it' http://127.0.0.1/ deve dare 308 verso https."
exit 0
