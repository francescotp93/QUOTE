#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  FA IL PACCHETTO DA INSTALLARE IN CHROME
#
#  Chrome vuole una cartella (o uno zip da scompattare): questo mette insieme
#  SOLO i file che servono all'estensione. Restano fuori le prove (verifica/) e
#  il package.json, che serve solo a Node per eseguirle e in Chrome non c'entra.
#
#  Il pacchetto e' versionato nel repo perche' GitHub Pages lo pubblica: cosi'
#  dal pannello Fonti si scarica con un clic, senza passare da GitHub. Che non
#  resti indietro rispetto ai sorgenti lo controlla verifica/pacchetto.test.mjs.
#
#  Si rifa' con:  bash prima-extension/impacchetta.sh
# ─────────────────────────────────────────────────────────────────────────────
set -eu
QUI="$(cd "$(dirname "$0")" && pwd)"
cd "$QUI"
rm -f quoto-prima.zip
zip -q -X quoto-prima.zip \
  manifest.json prezzo.js page-hook.js bridge.js quoto-bridge.js \
  background.js popup.html popup.js LEGGIMI.txt
echo "fatto: $(du -h quoto-prima.zip | cut -f1)  ·  $(unzip -Z1 quoto-prima.zip | wc -l) file"
