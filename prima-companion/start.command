#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  QUOTO — Companion Prima · avvio per Mac
#  Doppio-click su questo file. La prima volta installa il necessario (qualche
#  minuto), poi apre il pannello e la finestra di Prima per il login.
# ─────────────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")" || exit 1
clear
echo "=================================================="
echo "   QUOTO · Companion Prima"
echo "=================================================="
echo ""

# 1) Node installato?
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node non è installato su questo Mac."
  echo "   Apro la pagina di download: installa 'LTS', poi riapri questo file."
  open "https://nodejs.org/it/download" 2>/dev/null
  osascript -e 'display dialog "Manca Node.js. Ho aperto la pagina di download: installa la versione LTS, poi riapri start.command." buttons {"OK"} default button 1' 2>/dev/null
  exit 1
fi
echo "✓ Node $(node -v)"

# 2) Dipendenze (solo la prima volta)
if [ ! -d node_modules ]; then
  echo ""
  echo "▶ Prima installazione delle dipendenze (qualche minuto)…"
  npm install --no-audit --no-fund || { echo "Errore npm install"; exit 1; }
fi

# 3) Browser Chromium per Playwright (solo la prima volta)
if [ ! -d "$HOME/Library/Caches/ms-playwright" ] && [ ! -d node_modules/playwright/.local-browsers ]; then
  echo ""
  echo "▶ Scarico il browser (Chromium, ~150MB, solo la prima volta)…"
  npx playwright install chromium || echo "  (se fallisce riprova: a volte è la rete)"
fi

# 4) Avvio + apertura pannello
echo ""
echo "▶ Avvio il companion…"
( sleep 3; open "http://localhost:8790" 2>/dev/null ) &
node companion.mjs
