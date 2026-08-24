#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Correzione una-tantum (richiesta da Francesco, 24/08/2026).
#
# Il backend aveva in .env  HDI_SCRAPER_URL=http://127.0.0.1:4401  — ma lo scraper
# HDI e' in ascolto su :4400 (vedi la description del suo systemd service). Il
# backend bussava a una porta vuota, la sonda dava HDI per "spento/scaduto" e il
# Pannello Fonti scriveva "Il motore non ha confermato l'accesso" mentre HDI era
# in realta' loggato. Allianz/Italiana non hanno l'override e infatti funzionano.
#
# Qui rimetto la porta a :4400 e riavvio il backend UNA volta (setup.d segna il
# "fatto" all'uscita 0 e non ripassa piu'). Idempotente: se e' gia' a posto (o la
# riga non c'e') non tocca niente e non riavvia.
# ─────────────────────────────────────────────────────────────────────────────
set -u

ENVF=/opt/withus-backend/server/.env
[ -f "$ENVF" ] || { echo "[.env assente: niente da fare]"; exit 0; }

if grep -qE '^HDI_SCRAPER_URL=.*:4401([^0-9]|$)' "$ENVF"; then
  cp -a "$ENVF" "$ENVF.bak-hdi-4401-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
  sed -i -E 's#^(HDI_SCRAPER_URL=[^:]*://[^:]*):4401\b#\1:4400#' "$ENVF"
  echo "HDI_SCRAPER_URL corretto a :4400"
  if systemctl restart withus-backend 2>/dev/null; then
    echo "withus-backend riavviato ✅"
  else
    echo "restart withus-backend NON riuscito: riprovero' al prossimo giro"
    exit 1   # non segna "fatto": cosi' ritenta finche' il riavvio non riesce
  fi
else
  echo "HDI_SCRAPER_URL gia' corretto (o assente): nessun riavvio"
fi
exit 0
