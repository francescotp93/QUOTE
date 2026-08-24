#!/usr/bin/env bash
# Installazione su VPS Debian/Ubuntu. Da lanciare una volta.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Dipendenze di sistema =="
sudo apt-get update
# xvfb + x11vnc servono solo per il login mensile con OTP.
# Le altre sono le librerie richieste da Chromium headless.
sudo apt-get install -y xvfb x11vnc ca-certificates fonts-liberation \
  libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 \
  libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2

echo "== Dipendenze Node =="
npm ci --omit=dev 2>/dev/null || npm install --omit=dev
npx playwright install chromium

echo "== Permessi =="
chmod 700 storage 2>/dev/null || mkdir -p storage && chmod 700 storage
chmod 600 .env 2>/dev/null || true

cat <<'MSG'

== Fatto. Prossimi passi ==

  1. Compila .env  (cp .env.example .env)
  2. Esegui lo schema SQL su Supabase: sql/001_schema.sql
  3. Primo login con OTP:   ./scripts/login-vnc.sh
  4. Prova senza scrivere:  npm run scrape:dry
  5. Installa il cron:      crontab deploy/crontab

MSG
