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
  // Caricamento PULITO: la SPA usa hash-routing, quindi un goto allo stesso path con
  // hash diverso non ricarica l'app e si resta sulla pagina della targa precedente
  // (es. /vehicle/details). Passando da about:blank si forza il reboot sul form fastquote.
  await page.goto('about:blank').catch(() => {});
  // domcontentloaded (non networkidle): la pagina e' piena di tracker che non si fermano mai;
  // aspettiamo il form vero con waitForSelector, cosi' partiamo prima.
  await page.goto(FASTQUOTE, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  try { await page.locator('button:has-text("Accetta")').first().click({ timeout: 2000 }); } catch {}
  // attende che il form fastquote sia davvero montato prima di scrivere
  await page.waitForSelector('#FastQuotePlate', { timeout: 30000 }).catch(() => {});
  await page.fill('#FastQuoteBirthDate', nascita).catch(() => {});
  await page.fill('#FastQuotePlate', targa).catch(() => {});
  await page.waitForTimeout(400);
  await page.click('#cta_mp_fastquote_1').catch(() => {});
  await page.waitForFunction(() => /rca completa|scegli e personalizza|rinuncia alla rivalsa/i.test(document.body.innerText || ''), { timeout: 80000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button,a')].filter(b => /scegli e personalizza/i.test(b.innerText || ''));
    for (const b of btns) { let c = b; for (let i = 0; i < 9 && c; i++) { c = c.parentElement; if (c && /rca completa/i.test(c.innerText || '')) { b.click(); return; } } }
    if (btns[0]) btns[0].click();
  });
  await page.waitForFunction(() => /rinuncia alla rivalsa|responsabilità civile|werepair/i.test(document.body.innerText || ''), { timeout: 80000 }).catch(() => {});
  await page.waitForTimeout(1800);
}

// imposta RINUNCIA ALLA RIVALSA su Sì o No (pagina A)
async function setRivalsa(siNo) {
  const vuoiSi = /^s/i.test(String(siNo));
  // 1) apri il dropdown custom tfh-ui-select della rivalsa
  const opened = await page.evaluate(() => {
    const t = [...document.querySelectorAll('tfh-ui-select')].find(s => /rinuncia alla rivalsa/i.test(s.innerText || ''));
    if (!t) return false;
    const btn = t.querySelector('.selected-option') || t.querySelector('[role=button]') || t;
    btn.click(); return true;
  });
  if (!opened) { log('setRivalsa: controllo non trovato'); return 'no-control'; }
  await page.waitForTimeout(1000);
  // 2) clicca l'opzione Sì (o No), evitando la selected-option corrente
  const want = vuoiSi ? 'sì' : 'no';
  const set = await page.evaluate((want) => {
    const norm = s => (s || '').trim().toLowerCase().replace(/^si$/, 'sì');
    const t = [...document.querySelectorAll('tfh-ui-select')].find(s => /rinuncia alla rivalsa/i.test(s.innerText || ''));
    let pool = t ? [...t.querySelectorAll('*')] : [];
    pool = pool.concat([...document.querySelectorAll('.option,.dropdown-item,li,[role=option]')]);
    for (const e of pool) {
      if (e.children.length !== 0) continue;
      if (norm(e.innerText) !== want) continue;
      if (e.closest('.selected-option')) continue;
      (e.closest('[role=button],li,.option,.dropdown-item,div') || e).click();
      return true;
    }
    return false;
  }, want);
  await page.waitForTimeout(1600);
  // 3) verifica
  const ora = await page.evaluate(() => {
    const t = [...document.querySelectorAll('tfh-ui-select')].find(s => /rinuncia alla rivalsa/i.test(s.innerText || ''));
    const so = t && t.querySelector('.selected-option');
    return so ? (so.innerText || '').trim() : null;
  });
  log('setRivalsa ->', set, '| ora:', ora);
  return { set, valore: ora };
}

// CONTINUA -> pagina garanzie accessorie (CVT/ARD)
async function continuaGaranzie() {
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find(x => /^\s*continua\s*$/i.test((x.innerText || '').trim())); if (b) b.click(); });
  await page.waitForFunction(() => /furto e incendio|infortuni del conducente|tutela legale|monopattino/i.test(document.body.innerText || ''), { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1800);
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
  await page.waitForTimeout(1200);
}
async function setSE(valore) {
  await openPrv();
  const inp = page.locator('xpath=//*[contains(text(),"Personalizza SE")]/following::input[1]');
  try {
    await inp.click({ timeout: 5000 });
    await inp.fill(String(valore));
    await page.getByRole('button', { name: /aggiorna/i }).first().click({ timeout: 5000 });
    await page.waitForTimeout(1500);
  } catch (e) { log('setSE:', e.message); }
  try { await page.getByRole('button', { name: /chiudi/i }).first().click({ timeout: 3000 }); } catch {}
  await page.waitForTimeout(1000);
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

// Recupera i dati veicolo che Moto Platinum ricava dalla targa (banca dati motorizzazione).
// La pagina /vehicle/details espone i dati come coppie ETICHETTA / valore (su righe
// separate, oppure "Etichetta: valore"): li leggiamo in modo strutturato — molto più
// affidabile delle regex sul testo intero.
const MARCHE = 'Suzuki|Honda|Yamaha|Kawasaki|Aprilia|Ducati|BMW|Piaggio|Vespa|KTM|Triumph|Harley[ -]?Davidson|Benelli|Moto Guzzi|MV Agusta|Kymco|SYM|Peugeot|Husqvarna|Royal Enfield|Can[ -]?Am|Indian|Zero|Niu|Sym|Malaguti|Beta|Fantic|Cagiva|Gilera|Derbi';
async function readVeicolo() {
  const lines = await page.evaluate(() =>
    (document.body.innerText || '').split('\n').map(s => s.trim()).filter(Boolean));
  // valore associato a un'etichetta: gestisce "Etichetta: valore" e "Etichetta\nvalore"
  const after = (labelRe) => {
    for (let i = 0; i < lines.length; i++) {
      if (!labelRe.test(lines[i])) continue;
      const inline = lines[i].split(/:\s*/);
      if (inline.length > 1 && inline.slice(1).join(':').trim()) return inline.slice(1).join(':').trim();
      const next = lines[i + 1] || '';
      if (next && !/^modifica$/i.test(next)) return next.trim();
    }
    return null;
  };
  const onlyNum = s => { const m = (s || '').match(/[\d.]+/); return m ? m[0] : null; };
  const onlyDate = s => { const m = (s || '').match(/\d{2}\/\d{2}\/\d{4}/); return m ? m[0] : null; };

  const marca = after(/^MARCA$/i);
  const modello = after(/^MODELLO$/i);
  const allestimento = after(/^ALLESTIMENTO$/i);
  const descr = [marca, modello].filter(Boolean).join(' ')
    || (lines.join('\n').match(new RegExp('(' + MARCHE + ')[^\\n]{0,45}', 'i')) || [])[0] || null;

  return {
    descrizione: descr,
    marca: marca || null,
    modello: modello || null,
    allestimento: allestimento || null,
    immatricolazione: onlyDate(after(/PRIMA IMMATRICOLAZION/i)),
    cilindrata: onlyNum(after(/^Cilindrata\b/i)),
    cilindri: onlyNum(after(/Cilindri/i)),
    potenza_kw: onlyNum(after(/^KW\b/i)),
    potenza_cv: onlyNum(after(/^CV\b/i)),
    carrozzeria: after(/^Carrozzeria\b/i),
    cambio: after(/Tipo di cambio/i),
    marce: onlyNum(after(/^Marce\b/i)),
    valore: onlyNum(after(/VALORE ASSICURATO/i)),
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
      for (const k of garanzie) { const n = GARANZIE[k]; if (n && await aggiungiGaranzia(n)) { aggiunte.push(k); await page.waitForTimeout(1200); } }
      let v = Number(String(se).replace(',', '.')); if (!isFinite(v) || v < 10) v = 10;
      const seApplicato = String(v).replace('.', ',');
      await setSE(seApplicato);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: 'shots/quote-2-risultato.png', fullPage: true });
      const r = await readResult();
      return res.end(JSON.stringify({ compagnia: 'Moto Platinum', input: { targa, nascita, rivalsa, se: seApplicato, garanzie: aggiunte }, rivalsa_impostata: rivOK, ...r }, null, 2));
    }

    if (u.pathname.startsWith('/lookup')) {
      // Recupero rapido dati veicolo DALLA SOLA TARGA (per pre-compilare il wizard, stile K-UBE).
      // La data di nascita serve solo al portale per procedere: se assente ne usiamo una farlocca.
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const nascita = (u.searchParams.get('nascita') || '').trim() || '01/01/1980';
      if (!targa) return res.end(JSON.stringify({ error: 'Uso: /lookup?targa=..[&nascita=GG/MM/AAAA]' }));
      log('Lookup targa:', targa, '(nascita', nascita + ')');
      await fastquote(targa, nascita);
      await page.screenshot({ path: 'shots/lookup.png', fullPage: true });
      const veicolo = await readVeicolo();
      const _text = (await page.evaluate(() => (document.body.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 2600)));
      const _dump = await richDump(); // controlli pagina, per tarare i selettori veicolo
      return res.end(JSON.stringify({ ok: true, targa, nascita, veicolo, _text, _dump }, null, 2));
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
        const selects = [...document.querySelectorAll('select')].map(s => ({ id: s.id || null, name: s.name || null, cls: (s.className || '').slice(0, 50), opzioni: [...s.options].map(o => (o.text || '').trim()) }));
        const lab = [...document.querySelectorAll('*')].find(e => e.children.length <= 2 && /rinuncia alla rivalsa/i.test(e.innerText || '') && (e.innerText || '').trim().length < 45);
        let rigaHtml = null, dropdown = null;
        if (lab && lab.parentElement) {
          const row = lab.parentElement;
          rigaHtml = row.outerHTML.replace(/\s+/g, ' ').slice(0, 1800);
          const dd = row.querySelector('select,[role=combobox],[role=button],.dropdown,[class*=select],[class*=dropdown]');
          if (dd) dropdown = { tag: dd.tagName.toLowerCase(), cls: (dd.className || '').slice(0, 70), txt: (dd.innerText || '').trim().slice(0, 30) };
        }
        return { selects, dropdown, rigaHtml };
      });
      return res.end(JSON.stringify(info, null, 2));
    }
    if (u.pathname.startsWith('/flowmap')) {
      // DISCOVERY: il portale 24H ora dopo la targa passa da un wizard a step (Veicolo →
      // Proprietario → Dati assicurativi → Preventivo). Mappo gli step avanzando con PROSEGUI.
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const nascita = (u.searchParams.get('nascita') || '').trim();
      const steps = Math.min(7, parseInt(u.searchParams.get('steps') || '6', 10));
      if (!targa || !nascita) return res.end(JSON.stringify({ error: 'Uso: /flowmap?targa=..&nascita=..' }));
      await fastquote(targa, nascita);
      const seq = [];
      for (let i = 0; i < steps; i++) {
        const snap = await page.evaluate(() => {
          const clean = s => (s || '').replace(/\s+/g, ' ').trim();
          const vis = e => e && e.offsetParent !== null;
          const heads = [...document.querySelectorAll('h1,h2,h3,.active,[class*=step]')].map(e => clean(e.innerText)).filter(t => t && t.length < 40).filter((v, i, a) => a.indexOf(v) === i).slice(0, 8);
          const selects = [...document.querySelectorAll('select')].filter(vis).map(s => ({ id: s.id || null, name: s.name || null, val: s.value, opts: [...s.options].slice(0, 6).map(o => clean(o.text)) })).slice(0, 8);
          const inputs = [...document.querySelectorAll('input')].filter(vis).map(s => ({ id: s.id || null, name: s.name || null, type: s.type, val: (s.value || '').slice(0, 20), ph: (s.placeholder || '').slice(0, 25) })).slice(0, 12);
          const btns = [...document.querySelectorAll('button,a')].filter(b => vis(b) && clean(b.innerText)).map(b => clean(b.innerText).slice(0, 25)).filter((v, i, a) => a.indexOf(v) === i).slice(0, 20);
          const prezzi = [...((document.body.innerText || '').matchAll(/([\d.]+,\d{2})\s*€/g))].map(x => x[1]).slice(0, 8);
          return { url: location.href.slice(-45), heads, selects, inputs, btns, prezzi, txt: (document.body.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 600) };
        });
        seq.push(snap);
        if (snap.prezzi.length) break;
        await page.evaluate(() => { const as = [...document.querySelectorAll('select')].find(s => s.offsetParent !== null && /allestiment/i.test((s.id || '') + (s.name || '') + ((s.closest('div,label') || {}).innerText || ''))); if (as && !as.value) { const o = [...as.options].find(o => o.value); if (o) { as.value = o.value; as.dispatchEvent(new Event('change', { bubbles: true })); } } });
        await page.waitForTimeout(800);
        const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find(x => x.offsetParent !== null && /^(prosegui|continua|avanti|conferma|calcola)$/i.test((x.innerText || '').trim())); if (b) { b.click(); return (b.innerText || '').trim(); } return null; });
        seq[seq.length - 1].clicked = clicked;
        await page.waitForTimeout(3800);
        if (!clicked) break;
      }
      return res.end(JSON.stringify({ seq }, null, 2));
    }
    if (u.pathname.startsWith('/shot')) { await page.screenshot({ path: 'shots/current.png', fullPage: true }); return res.end(JSON.stringify({ ok: true, url: page.url() })); }
    res.end(JSON.stringify({ endpoints: ['/status', '/quote?targa=..&nascita=..&se=20&rivalsa=si&garanzie=furto,tutela', '/lookup?targa=..&nascita=..', '/map', '/rivalsa', '/shot'] }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
}).listen(4100, '127.0.0.1', () => log('Telecomando HTTP su 127.0.0.1:4100'));

setInterval(async () => { try { await page.goto(PORTAL, { waitUntil: 'domcontentloaded', timeout: 45000 }); log('[keep-alive] ok'); } catch (e) { log('[keep-alive] err:', e.message); } }, 4 * 60 * 1000);
log('=== SERVIZIO ATTIVO. curl localhost:4100/... ===');
await new Promise(() => {});
