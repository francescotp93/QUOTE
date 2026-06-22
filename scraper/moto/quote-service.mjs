import { chromium } from 'playwright';
import http from 'http';

const userDataDir = new URL('./userdata', import.meta.url).pathname;
const PORTAL    = 'https://www.24hassistance.com';
const LOGIN_URL = 'https://login.24hassistance.com/?ReturnUrl=https://www.24hassistance.com';
const FASTQUOTE = 'https://www.24hassistance.com/motoplatinum/v2#/quotation/fastquote';
const log = (...a) => console.log(new Date().toLocaleTimeString('it-IT'), ...a);

const GARANZIE = { furto: 'Furto e Incendio', infortuni: 'Infortuni del conducente', assistenza: 'Assistenza', tutela: 'Tutela legale', monopattino: 'Estensione monopattino' };

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

// fastquote -> "Cosa cerchi?" -> SCEGLI E PERSONALIZZA -> pagina A (RC/rivalsa/WeRepair/MOTO.APP)
async function fastquote(targa, nascita) {
  await page.goto(FASTQUOTE, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);
  try { await page.locator('button:has-text("Accetta")').first().click({ timeout: 2500 }); } catch {}
  await page.fill('#FastQuoteBirthDate', nascita).catch(() => {});
  await page.fill('#FastQuotePlate', targa).catch(() => {});
  await page.waitForTimeout(600);
  await page.click('#cta_mp_fastquote_1').catch(() => {});
  await page.waitForFunction(() => /rca completa|scegli e personalizza|rinuncia alla rivalsa/i.test(document.body.innerText || ''), { timeout: 80000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button,a')].filter(b => /scegli e personalizza/i.test(b.innerText || ''));
    for (const b of btns) { let c = b; for (let i = 0; i < 9 && c; i++) { c = c.parentElement; if (c && /rca completa/i.test(c.innerText || '')) { b.click(); return; } } }
    if (btns[0]) btns[0].click();
  });
  await page.waitForFunction(() => /rinuncia alla rivalsa|responsabilità civile|werepair/i.test(document.body.innerText || ''), { timeout: 80000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

// imposta RINUNCIA ALLA RIVALSA su Sì o No (pagina A)
async function setRivalsa(siNo) {
  const vuoiSi = /^s/i.test(String(siNo));
  const r = await page.evaluate((vuoiSi) => {
    const blocks = [...document.querySelectorAll('*')].filter(e => /rinuncia alla rivalsa/i.test(e.innerText || '') && e.querySelector('select'));
    for (const b of blocks) {
      const sel = b.querySelector('select');
      const want = vuoiSi ? /^s[iì]$/i : /^no$/i;
      const opt = [...sel.options].find(o => want.test((o.text || '').trim()));
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); sel.dispatchEvent(new Event('input', { bubbles: true })); return 'native'; }
    }
    return null;
  }, vuoiSi);
  if (r) { await page.waitForTimeout(1600); return r; }
  try {
    const lab = page.locator('xpath=//*[contains(translate(text(),"RINUNCIA","rinuncia"),"rinuncia alla rivalsa")]').first();
    await lab.locator('xpath=ancestor::*[1]').locator('select, [role=combobox], .ng-select, mat-select, .dropdown, [class*=select]').first().click({ timeout: 3000 });
    await page.waitForTimeout(800);
    await page.getByText(vuoiSi ? /^s[iì]$/i : /^no$/i).first().click({ timeout: 3000 });
    await page.waitForTimeout(1600);
    return 'custom';
  } catch (e) { log('setRivalsa:', e.message); return null; }
}

// CONTINUA -> pagina garanzie accessorie (CVT/ARD)
async function continuaGaranzie() {
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find(x => /^\s*continua\s*$/i.test((x.innerText || '').trim())); if (b) b.click(); });
  await page.waitForFunction(() => /furto e incendio|infortuni del conducente|tutela legale|monopattino/i.test(document.body.innerText || ''), { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2800);
}

async function aggiungiGaranzia(nome) {
  return await page.evaluate((n) => {
    const ALTRI = ['furto e incendio', 'infortuni del conducente', 'assistenza', 'tutela legale', 'monopattino'];
    const nl = n.toLowerCase();
    const btns = [...document.querySelectorAll('button,a')].filter(b => /aggiungi/i.test(b.innerText || ''));
    for (const b of btns) {
      let c = b;
      for (let i = 0; i < 8 && c; i++) {
        c = c.parentElement; if (!c) break;
        const t = (c.innerText || '').toLowerCase();
        if (t.includes(nl)) {
          const altri = ALTRI.filter(x => x !== nl && t.includes(x));
          if (altri.length === 0) { b.click(); return true; }
        }
      }
    }
    return false;
  }, nome);
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
  } catch (e) { log('setSE:', e.message); }
  try { await page.getByRole('button', { name: /chiudi/i }).first().click({ timeout: 3000 }); } catch {}
  await page.waitForTimeout(1500);
}

async function readResult() {
  const text = (await page.evaluate(() => document.body.innerText || '')).replace(/\n{2,}/g, '\n');
  const g = re => { const m = text.match(re); return m ? m[1] : null; };
  const incluse = await page.evaluate(() => {
    const out = [];
    [...document.querySelectorAll('button,a')].filter(b => /rimuovi/i.test(b.innerText || '')).forEach(b => {
      let c = b; for (let i = 0; i < 11 && c; i++) { c = c.parentElement; if (c) { const m = (c.innerText || '').match(/furto e incendio|infortuni del conducente|assistenza|tutela legale|estensione[^\n]*monopattino/i); if (m && !out.includes(m[0])) { out.push(m[0]); break; } } }
    });
    return out;
  });
  return {
    veicolo: (text.match(/(Suzuki|Honda|Yamaha|Kawasaki|Aprilia|Ducati|BMW|Piaggio|Vespa|KTM|Triumph|Harley|Benelli|Moto Guzzi|MV Agusta|Kymco|SYM|Peugeot)[^\n]{0,45}/i) || [])[0] || null,
    premio_totale: g(/Totale(?:\s*da pagare)?[^\d]{0,25}([\d.]+,\d{2})/i),
    garanzie_incluse: incluse,
    werepair: /we\s?repair/i.test(text),
    tuttiPrezzi: [...text.matchAll(/([\d.]+,\d{2})\s*€/g)].map(x => x[1]),
  };
}

async function richDump() {
  return page.evaluate(() => {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    const sel = 'button,a[role=button],select,option,input,[role=combobox],[role=checkbox],mat-select,.dropdown-toggle,label';
    const ctrls = [...document.querySelectorAll(sel)].map(e => ({ tag: e.tagName.toLowerCase(), id: e.id || null, type: e.getAttribute('type') || null, text: clean(e.innerText || e.value), cls: (e.getAttribute('class') || '').slice(0, 45) || null })).filter(x => (x.text && x.text.length) || x.id);
    return { url: location.href, text: (document.body.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 2800), ctrls };
  });
}

http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/status')) return res.end(JSON.stringify({ url: page.url() }));

    if (u.pathname.startsWith('/quote')) {
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const nascita = (u.searchParams.get('nascita') || '').trim();
      if (!targa || !nascita) return res.end(JSON.stringify({ error: 'Uso: /quote?targa=..&nascita=GG/MM/AAAA[&se=20&rivalsa=si&garanzie=furto,tutela]' }));
      const rivalsa = u.searchParams.get('rivalsa') || 'si';              // default: rinuncia rivalsa SI
      let se = u.searchParams.get('se'); if (se == null || se === '') se = '20'; // default Moto Platinum: 20
      let garanzie = (u.searchParams.get('garanzie') || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
      if (!garanzie.includes('tutela')) garanzie.unshift('tutela'); // tutela legale SEMPRE inclusa
      log('Preventivo:', targa, nascita, 'rivalsa=', rivalsa, 'se=', se, 'gar=', garanzie.join('|'));

      await fastquote(targa, nascita);
      const rivOK = await setRivalsa(rivalsa);
      await continuaGaranzie();
      const aggiunte = [];
      for (const k of garanzie) { const n = GARANZIE[k]; if (n && await aggiungiGaranzia(n)) { aggiunte.push(k); await page.waitForTimeout(2000); } }
      let v = Number(String(se).replace(',', '.')); if (!isFinite(v) || v < 10) v = 10;
      const seApplicato = String(v).replace('.', ',');
      await setSE(seApplicato);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: 'shots/quote-2-risultato.png', fullPage: true });
      const r = await readResult();
      return res.end(JSON.stringify({ compagnia: 'Moto Platinum', input: { targa, nascita, rivalsa, se: seApplicato, garanzie: aggiunte }, rivalsa_impostata: rivOK, ...r }, null, 2));
    }

    if (u.pathname.startsWith('/map')) {
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const nascita = (u.searchParams.get('nascita') || '').trim();
      if (!targa || !nascita) return res.end(JSON.stringify({ error: 'Uso: /map?targa=..&nascita=..' }));
      await fastquote(targa, nascita);
      await page.screenshot({ path: 'shots/map-1-options.png', fullPage: true });
      const options = await richDump();
      await continuaGaranzie();
      await page.screenshot({ path: 'shots/map-2-accessorie.png', fullPage: true });
      const accessorie = await richDump();
      return res.end(JSON.stringify({ options, accessorie }, null, 2));
    }

    if (u.pathname.startsWith('/rivalsa')) {
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const nascita = (u.searchParams.get('nascita') || '').trim();
      if (!targa || !nascita) return res.end(JSON.stringify({ error: 'Uso: /rivalsa?targa=..&nascita=..' }));
      await fastquote(targa, nascita);
      await page.screenshot({ path: 'shots/rivalsa.png', fullPage: true });
      const info = await page.evaluate(() => {
        const lab = [...document.querySelectorAll('*')].find(e => /rinuncia alla rivalsa/i.test(e.innerText || '') && (e.innerText || '').length < 120);
        if (!lab) return { trovato: false };
        let c = lab; for (let i = 0; i < 5; i++) { if (c.parentElement) c = c.parentElement; }
        return { trovato: true, html: c.outerHTML.slice(0, 3500) };
      });
      return res.end(JSON.stringify(info, null, 2));
    }
    if (u.pathname.startsWith('/shot')) { await page.screenshot({ path: 'shots/current.png', fullPage: true }); return res.end(JSON.stringify({ ok: true, url: page.url() })); }
    res.end(JSON.stringify({ endpoints: ['/status', '/quote?targa=..&nascita=..&se=20&rivalsa=si&garanzie=furto,tutela', '/map', '/rivalsa', '/shot'] }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
}).listen(4100, '127.0.0.1', () => log('Telecomando HTTP su 127.0.0.1:4100'));

setInterval(async () => { try { await page.goto(PORTAL, { waitUntil: 'domcontentloaded', timeout: 45000 }); log('[keep-alive] ok'); } catch (e) { log('[keep-alive] err:', e.message); } }, 4 * 60 * 1000);
log('=== SERVIZIO ATTIVO. curl localhost:4100/... ===');
await new Promise(() => {});
