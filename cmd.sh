#!/usr/bin/env bash
# Domanda sola: da QUESTA macchina si arriva alla pagina di login di Prima, o
# Cloudflare la blocca come blocca lo scraper? Nessuna credenziale, nessun
# tentativo di accesso: si guarda solo che pagina risponde.
set -u
cd /opt/withus-backend/prima-intermediari 2>/dev/null || { echo "pacchetto non presente"; exit 1; }

echo "== 1. senza browser, come vede il server la pagina di login =="
curl -s -o /tmp/prima-login.html -w "  http %{http_code}  ·  %{size_download} byte  ·  %{time_total}s\n" \
  -m 30 -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36" \
  https://intermediari.prima.it/preventivi 2>&1
echo "  indizi nella pagina:"
for s in "cloudflare" "Just a moment" "cf-challenge" "Attention Required" "auth0" "password" "Accedi"; do
  n=$(grep -c -i "$s" /tmp/prima-login.html 2>/dev/null || echo 0)
  [ "$n" != "0" ] && printf '    %-18s trovato (%s volte)\n' "$s" "$n"
done
rm -f /tmp/prima-login.html

echo
echo "== 2. con il browser vero, come fa il pacchetto =="
DISPLAY_NUM=98
Xvfb ":$DISPLAY_NUM" -screen 0 1280x800x24 >/dev/null 2>&1 &
XVFB=$!
sleep 2
DISPLAY=":$DISPLAY_NUM" timeout 120 node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: false });
  const p = await b.newPage();
  try {
    await p.goto('https://intermediari.prima.it/preventivi', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(6000);
    const t = (await p.title()) || '';
    const testo = ((await p.textContent('body').catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 200);
    const campoPw = await p.locator('input[type=password]').count().catch(() => 0);
    const campoMail = await p.locator('input[type=email], input[name=email], input[name=username]').count().catch(() => 0);
    console.log('  indirizzo:  ' + (p.url() || '').slice(0, 90));
    console.log('  titolo:     ' + t.slice(0, 80));
    console.log('  campi login: email=' + campoMail + '  password=' + campoPw);
    console.log('  testo:      ' + testo);
    const bloccato = /just a moment|attention required|cloudflare|verifica.*umano|checking your browser/i.test(t + ' ' + testo);
    console.log('');
    console.log(bloccato
      ? '  >>> BLOCCATO: da questa macchina non si arriva nemmeno alla pagina di login.'
      : (campoPw > 0 || campoMail > 0
          ? '  >>> SI PASSA: la pagina di login risponde, i campi ci sono.'
          : '  >>> INCERTO: non bloccato, ma non vedo i campi di login. Da guardare.'));
  } catch (e) {
    console.log('  errore: ' + String(e.message).slice(0, 160));
    console.log('  >>> NON RAGGIUNGIBILE da questa macchina.');
  } finally { await b.close().catch(() => {}); }
})();
" 2>&1 | grep -v "^$"
kill $XVFB 2>/dev/null || true
