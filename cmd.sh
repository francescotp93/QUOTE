#!/usr/bin/env bash
# LA DOMANDA CHE DECIDE TUTTO: con un BROWSER VERO, da questa macchina si
# arriva alla pagina di login di Prima? (curl nudo prende 403 da chiunque,
# anche da casa: non dimostra niente.)
# Nessuna credenziale, nessun tentativo di accesso: si guarda solo la pagina.
set -u
cd /opt/withus-backend/prima-intermediari || { echo "pacchetto non presente"; exit 1; }

echo "== 1. il browser dello scraper Prima, che gira gia' su questa macchina =="
BROWSER=$(node -e "try{console.log(require('/opt/withus-backend/scraper/prima/node_modules/playwright').chromium.executablePath())}catch(e){console.log('')}" 2>/dev/null)
[ -x "$BROWSER" ] && echo "  trovato: $BROWSER" || echo "  non trovato, uso quello del pacchetto"

if [ ! -x "$BROWSER" ]; then
  echo "  scarico il browser del pacchetto (una volta sola)…"
  npx --yes playwright install chromium 2>&1 | tail -2
  BROWSER=$(node -e "console.log(require('playwright').chromium.executablePath())" 2>/dev/null)
fi

echo
echo "== 2. apro la pagina di login, come farebbe un operatore =="
Xvfb :98 -screen 0 1280x800x24 >/dev/null 2>&1 &
XVFB=$!
sleep 2
DISPLAY=:98 BROWSER_PATH="$BROWSER" timeout 180 node -e "
const { chromium } = require('playwright');
(async () => {
  const opz = { headless: false };
  if (process.env.BROWSER_PATH) opz.executablePath = process.env.BROWSER_PATH;
  const b = await chromium.launch(opz);
  const p = await b.newPage();
  try {
    await p.goto('https://intermediari.prima.it/preventivi', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(8000);
    const t = (await p.title()) || '';
    const testo = ((await p.textContent('body').catch(()=>'')) || '').replace(/\s+/g,' ').slice(0,220);
    const pw = await p.locator('input[type=password]').count().catch(()=>0);
    const mail = await p.locator('input[type=email], input[name=email], input[name=username]').count().catch(()=>0);
    console.log('  indirizzo:   ' + (p.url()||'').slice(0,95));
    console.log('  titolo:      ' + t.slice(0,80));
    console.log('  campi login: email=' + mail + '  password=' + pw);
    console.log('  testo:       ' + testo);
    const bloccato = /just a moment|attention required|cloudflare|checking your browser/i.test(t + ' ' + testo);
    console.log('');
    if (bloccato)        console.log('  >>> BLOCCATO anche col browser vero: da questa macchina non si passa.');
    else if (pw || mail) console.log('  >>> SI PASSA: la pagina di login risponde e i campi ci sono.');
    else                 console.log('  >>> INCERTO: non bloccato ma non vedo i campi.');
  } catch (e) {
    console.log('  errore: ' + String(e.message).slice(0,180));
    console.log('  >>> NON RAGGIUNGIBILE da questa macchina.');
  } finally { await b.close().catch(()=>{}); }
})();
" 2>&1 | grep -vE "^\s*$|^\s+at "
kill $XVFB 2>/dev/null || true

echo
echo "== 3. e cosa dice adesso lo scraper Prima del pannello =="
curl -s -m 8 http://127.0.0.1:4600/loginstate | head -c 300; echo
