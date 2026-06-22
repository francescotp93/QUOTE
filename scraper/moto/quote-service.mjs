import { chromium } from 'playwright';
import http from 'http';

const userDataDir = new URL('./userdata', import.meta.url).pathname;
const PORTAL    = 'https://www.24hassistance.com';
const LOGIN_URL = 'https://login.24hassistance.com/?ReturnUrl=https://www.24hassistance.com';
const FASTQUOTE = 'https://www.24hassistance.com/motoplatinum/v2#/quotation/fastquote';
const log = (...a) => console.log(new Date().toLocaleTimeString('it-IT'), ...a);

const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: false, viewport: null, locale: 'it-IT',
  args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'],
});
const page = ctx.pages()[0] || await ctx.newPage();

async function loggedIn() {
  await page.goto(PORTAL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (/login\.24hassistance/i.test(page.url())) return false;
  return await page.evaluate(() => /esci|logout|area riservat|preventiv|polizz/i.test(document.body.innerText || ''));
}

let ok = await loggedIn();
if (!ok) {
  log('Non loggato: accedi via VNC...');
  await page.goto(LOGIN_URL).catch(() => {});
  for (let i = 0; i < 100; i++) { await page.waitForTimeout(3000); if (!/login\.24hassistance/i.test(page.url())) { ok = true; break; } }
}
log(ok ? 'LOGGATO: ' + page.url() : 'login non rilevato');
if (ok) await ctx.storageState({ path: 'auth.json' }).catch(() => {});

async function fastquote(targa, nascita) {
  await page.goto(FASTQUOTE, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);
  try { await page.locator('button:has-text("Accetta")').first().click({ timeout: 2500 }); } catch {}
  await page.fill('#FastQuoteBirthDate', nascita).catch(() => {});
  await page.fill('#FastQuotePlate', targa).catch(() => {});
  await page.waitForTimeout(600);
  await page.click('#cta_mp_fastquote_1').catch(() => {});
  // schermata "Cosa cerchi?" -> clicca SCEGLI E PERSONALIZZA sulla card RCA completa
  await page.waitForFunction(() => /rca completa|scegli e personalizza|rinuncia alla rivalsa/i.test(document.body.innerText || ''), { timeout: 80000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const scelta = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button,a')].filter(b => /scegli e personalizza/i.test(b.innerText || ''));
    for (const b of btns) { let c = b; for (let i = 0; i < 9 && c; i++) { c = c.parentElement; if (c && /rca completa/i.test(c.innerText || '')) { b.click(); return 'rca'; } } }
    if (btns[0]) { btns[0].click(); return 'first'; }
    return 'gia-in-personalizza';
  });
  // attende la pagina di personalizzazione (rivalsa / werepair / totale)
  await page.waitForFunction(() => /rinuncia alla rivalsa|responsabilità civile|totale|werepair/i.test(document.body.innerText || ''), { timeout: 80000 }).catch(() => {});
  await page.waitForTimeout(3500);
  return scelta;
}

async function richDump() {
  return page.evaluate(() => {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    const sel = 'button,a[role=button],select,option,input,[role=combobox],[role=checkbox],[role=switch],mat-select,.mat-select,.dropdown-toggle,label';
    const ctrls = [...document.querySelectorAll(sel)].map(e => ({
      tag: e.tagName.toLowerCase(), id: e.id || null, type: e.getAttribute('type') || null,
      name: e.getAttribute('name') || null, text: clean(e.innerText || e.value),
      cls: (e.getAttribute('class') || '').slice(0, 45) || null,
    })).filter(x => (x.text && x.text.length) || x.id);
    return { url: location.href, text: (document.body.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 2800), ctrls };
  });
}


async function openPrv() {
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('span,div,a,button')].filter(e => e.children.length <= 1 && /prv/i.test(e.innerText || '') && (e.innerText || '').trim().length < 8);
    if (els[0]) (els[0].closest('button,a,[class*=dropdown],[class*=select]') || els[0]).click();
  });
  await page.waitForTimeout(1800);
}

async function setSE(valore) {
  await openPrv();
  const inp = page.locator('xpath=//*[contains(text(),"Personalizza SE")]/following::input[1]');
  try {
    await inp.click({ timeout: 5000 });
    await inp.fill(String(valore));
    await page.getByRole('button', { name: /aggiorna/i }).first().click({ timeout: 5000 });
    await page.waitForTimeout(2200);
  } catch (e) { log('setSE err:', e.message); }
  try { await page.getByRole('button', { name: /chiudi/i }).first().click({ timeout: 3000 }); } catch {}
  await page.waitForTimeout(1500);
}

async function readResult() {
  const text = (await page.evaluate(() => document.body.innerText || '')).replace(/\n{2,}/g, '\n');
  const g = re => { const m = text.match(re); return m ? m[1] : null; };
  return {
    veicolo: (text.match(/(Suzuki|Honda|Yamaha|Kawasaki|Aprilia|Ducati|BMW|Piaggio|Vespa|KTM|Triumph|Harley|Benelli|Moto Guzzi|MV Agusta|Kymco|SYM|Peugeot)[^\n]{0,45}/i) || [])[0] || null,
    totale: g(/Totale(?:\s*da pagare)?[^\d]{0,25}([\d.]+,\d{2})/i),
    rc: g(/Di cui RC[^\d]{0,15}([\d.]+,\d{2})/i),
    werepair: /we\s?repair/i.test(text),
    tuttiPrezzi: [...text.matchAll(/([\d.]+,\d{2})\s*€/g)].map(x => x[1]),
  };
}

const GARANZIE = { furto: 'Furto e Incendio', infortuni: 'Infortuni del conducente', assistenza: 'Assistenza', tutela: 'Tutela legale', monopattino: 'Estensione monopattino' };
async function aggiungiGaranzia(nome) {
  return await page.evaluate((n) => {
    const btns = [...document.querySelectorAll('button,a')].filter(b => /aggiungi/i.test(b.innerText || ''));
    for (const b of btns) { let c = b; for (let i = 0; i < 11 && c; i++) { c = c.parentElement; if (c && c.innerText && c.innerText.toLowerCase().includes(n.toLowerCase())) { b.click(); return true; } } }
    return false;
  }, nome);
}

const prezziDa = t => [...t.matchAll(/([\d.]+,\d{2})\s*€/g)].map(m => m[1]);

http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/status')) return res.end(JSON.stringify({ url: page.url() }));

    if (u.pathname.startsWith('/quote')) {
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const nascita = (u.searchParams.get('nascita') || '').trim();
      let se = u.searchParams.get('se');
      const garanzie = (u.searchParams.get('garanzie') || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
      if (!targa || !nascita) return res.end(JSON.stringify({ error: 'Uso: /quote?targa=AB12345&nascita=GG/MM/AAAA&se=10&garanzie=furto,tutela' }));
      log('Preventivo:', targa, nascita, 'se=', se, 'gar=', garanzie.join('|'));
      await fastquote(targa, nascita);
      const aggiunte = [];
      for (const key of garanzie) {
        const nome = GARANZIE[key];
        if (!nome) continue;
        if (await aggiungiGaranzia(nome)) { aggiunte.push(key); await page.waitForTimeout(2000); }
      }
      let seApplicato = null;
      if (se != null && se !== '') {
        let v = Number(String(se).replace(',', '.'));
        if (!isFinite(v) || v < 10) v = 10;
        seApplicato = String(v).replace('.', ',');
        await setSE(seApplicato);
      }
      await page.waitForTimeout(1200);
      await page.screenshot({ path: 'shots/quote-2-risultato.png', fullPage: true });
      const r = await readResult();
      return res.end(JSON.stringify({ url: page.url(), input: { targa, nascita, se: seApplicato, garanzie: aggiunte }, ...r }, null, 2));
    }
    if (u.pathname.startsWith('/map')) {
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const nascita = (u.searchParams.get('nascita') || '').trim();
      if (!targa || !nascita) return res.end(JSON.stringify({ error: 'Uso: /map?targa=..&nascita=GG/MM/AAAA' }));
      log('Map:', targa, nascita);
      await fastquote(targa, nascita);
      await page.screenshot({ path: 'shots/map-1-options.png', fullPage: true });
      const options = await richDump();
      let continued = false;
      for (const s of ['button:has-text("Continua")', 'a:has-text("Continua")', 'button:has-text("CONTINUA")']) {
        try { await page.locator(s).first().click({ timeout: 4000 }); continued = true; break; } catch {}
      }
      await page.waitForTimeout(6000);
      await page.screenshot({ path: 'shots/map-2-accessorie.png', fullPage: true });
      const accessorie = await richDump();
      log('Map fatto. continua-cliccato:', continued);
      return res.end(JSON.stringify({ continued, options, accessorie }, null, 2));
    }

    if (u.pathname.startsWith('/prv')) {
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const nascita = (u.searchParams.get('nascita') || '').trim();
      if (!targa || !nascita) return res.end(JSON.stringify({ error: 'Uso: /prv?targa=..&nascita=GG/MM/AAAA' }));
      log('PRV:', targa, nascita);
      await fastquote(targa, nascita);
      await page.waitForTimeout(1200);
      const clicked = await page.evaluate(() => {
        const els = [...document.querySelectorAll('span,div,a,button')].filter(e => e.children.length <= 1 && /prv/i.test(e.innerText || '') && (e.innerText || '').trim().length < 8);
        if (els[0]) { (els[0].closest('button,a,[class*=dropdown],[class*=select]') || els[0]).click(); return (els[0].innerText || '').trim(); }
        return null;
      });
      await page.waitForTimeout(2800);
      await page.screenshot({ path: 'shots/prv.png', fullPage: true });
      const dump = await richDump();
      log('PRV cliccato:', clicked);
      return res.end(JSON.stringify({ clicked, dump }, null, 2));
    }
    if (u.pathname.startsWith('/shot')) {
      await page.screenshot({ path: 'shots/current.png', fullPage: true });
      return res.end(JSON.stringify({ ok: true, url: page.url() }));
    }
    res.end(JSON.stringify({ endpoints: ['/status', '/quote?targa=..&nascita=GG/MM/AAAA', '/map?targa=..&nascita=..', '/prv?targa=..&nascita=..', '/shot'] }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
}).listen(4100, '127.0.0.1', () => log('Telecomando HTTP su 127.0.0.1:4100'));

setInterval(async () => {
  try { await page.goto(PORTAL, { waitUntil: 'domcontentloaded', timeout: 45000 }); log('[keep-alive] ok'); }
  catch (e) { log('[keep-alive] err:', e.message); }
}, 4 * 60 * 1000);

log('=== SERVIZIO ATTIVO. Comandi: curl localhost:4100/... ===');
await new Promise(() => {});
