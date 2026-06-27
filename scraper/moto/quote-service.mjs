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

// ── SNIFF: registra le chiamate XHR/fetch del portale 24H mentre si fa un preventivo a mano
//    (via VNC), per scoprire le API del nuovo wizard (vehicle/owner, dati assicurativi, quotazione).
const SNIFF = { on: false, buf: [], max: 1200, t0: 0 };
let lastDrive = 0; // timestamp dell'ultima attività di preventivo: blocca il keep-alive durante i drive
const NOISE = /googletagmanager|google-analytics|googleapis|gstatic|recaptcha|doubleclick|hotjar|facebook|fbcdn|linkedin|cloudflare|cdn|\.(png|jpe?g|gif|svg|css|woff2?|ttf|ico|map|js)(\?|$)/i;
const sniffInteresting = (url, type) => {
  if (!url) return false;
  if (NOISE.test(url)) return false;
  if (/24hassistance\.com|24hpartner|motoplatinum|\/api\/|\/quotation|\/vehicle|\/quote/i.test(url)) return (type === 'xhr' || type === 'fetch');
  return type === 'xhr' || type === 'fetch';
};
const sniffPush = o => { if (SNIFF.on && SNIFF.buf.length < SNIFF.max) SNIFF.buf.push(o); };
// Aggancio i listener all'INTERO CONTESTO (tutte le schede/finestre), non alla singola pagina:
// il preventivo moto.app può aprirsi in un nuovo tab e altrimenti non verrebbe catturato.
ctx.on('request', req => { try { if (!SNIFF.on) return; const url = req.url(); const type = req.resourceType(); if (!sniffInteresting(url, type)) return; let body = ''; try { body = req.postData() || ''; } catch {} sniffPush({ kind: 'req', t: Date.now() - SNIFF.t0, method: req.method(), url, body: String(body).slice(0, 3000) }); } catch {} });
ctx.on('response', async resp => { try { if (!SNIFF.on) return; const req = resp.request(); const url = req.url(); const type = req.resourceType(); if (!sniffInteresting(url, type)) return; const ct = (resp.headers()['content-type'] || '').toLowerCase(); let body = ''; if (/json|text/.test(ct)) { try { body = await resp.text(); } catch {} } sniffPush({ kind: 'res', t: Date.now() - SNIFF.t0, status: resp.status(), method: req.method(), url, body: String(body).slice(0, 12000) }); } catch {} });

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
  lastDrive = Date.now(); // segnala attività: sospende il keep-alive durante il preventivo
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

// ── NUOVO FLUSSO 24H (moto.app v2): fastquote → vehicle/details (allestimento) →
//    vehicle/owner (CF + comune/residenza) → quotation/options (PREZZO). Vue richiede
//    eventi REALI (click nativi Playwright), non sintetici. CF + comune bastano per il premio.
async function driveTo24h(targa, nascita, cf, comune) {
  const log = [];
  await fastquote(targa, nascita);
  for (let i = 0; i < 8; i++) {
    lastDrive = Date.now();
    if (/quotation\/(options|quote|guarantees)/.test(page.url())) { log.push('PREZZO: ' + page.url().slice(-26)); break; }
    // ALLESTIMENTO (vue-multiselect su /vehicle/details)
    const all = await page.evaluate(() => {
      const lab = [...document.querySelectorAll('label')].find(l => /allestimento/i.test(l.innerText || ''));
      let ms = null; if (lab) { let c = lab.parentElement; for (let k = 0; k < 4 && c; k++) { ms = c.querySelector('.multiselect'); if (ms) break; c = c.parentElement; } }
      ms = ms || document.querySelector('.multiselect');
      if (!ms) return 'no-ms';
      if (ms.querySelector('.multiselect__single, .multiselect__tag')) return 'sel';
      ms.click(); const inp = ms.querySelector('.multiselect__input'); if (inp) inp.focus(); return 'open';
    });
    if (all === 'open') {
      await page.waitForTimeout(800);
      try { const opt = page.locator('.multiselect__content .multiselect__option, li.multiselect__element').first(); if (await opt.count().catch(() => 0)) await opt.click({ timeout: 5000 }).catch(() => {}); } catch (e) {}
      await page.waitForTimeout(800);
    }
    // CODICE FISCALE (il portale ricava i dati dal CF)
    if (cf) {
      await page.evaluate((cf) => { const inp = [...document.querySelectorAll('input')].find(e => e.offsetParent !== null && /codice fiscale|p\.?\s*iva/i.test((e.placeholder || '') + ((e.closest('div,label') || {}).innerText || ''))); if (inp && !(inp.value || '').trim()) { inp.focus(); inp.value = cf; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); inp.dispatchEvent(new Event('blur', { bubbles: true })); } }, cf);
      await page.waitForTimeout(1800);
    }
    // COMUNE / RESIDENZA (vue-multiselect, click NATIVO altrimenti non committa)
    if (comune) {
      try {
        const already = await page.evaluate(() => !!document.querySelector('.multiselect__single'));
        if (!already) {
          const comH = await page.evaluateHandle(() => [...document.querySelectorAll('input.multiselect__input, input')].find(e => e.offsetParent !== null && /comune/i.test((e.placeholder || '') + ((e.closest('div,label') || {}).innerText || ''))) || null);
          const comInp = comH.asElement();
          if (comInp) {
            await comInp.click({ timeout: 4000 }).catch(() => {});
            await comInp.fill('').catch(() => {});
            await comInp.type(comune, { delay: 45 }).catch(() => {});
            await page.waitForTimeout(2200);
            const optLoc = page.locator('.multiselect__option, li.multiselect__element').filter({ hasText: comune.slice(0, 4) }).first();
            if (await optLoc.count().catch(() => 0)) await optLoc.click({ timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(1000);
          }
        }
      } catch (e) {}
    }
    // AVANZA: il CTA del portale è .btn-primary.rounded-pill (il testo varia)
    let clicked = null;
    for (let r = 0; r < 4 && !clicked; r++) {
      clicked = await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        const en = x => x && x.offsetParent !== null && !x.disabled && x.getAttribute('aria-disabled') !== 'true';
        const re = /^(prosegui|continua|avanti|conferma|calcola|preventivo|procedi|vai avanti)$/i;
        let b = [...document.querySelectorAll('button,a,[role=button],input[type=submit]')].find(x => en(x) && re.test(((x.innerText || x.value) || '').trim()));
        if (!b) b = [...document.querySelectorAll('button.btn-primary, .btn-primary.rounded-pill')].find(x => en(x) && !/indietro|annulla|modifica/i.test(x.innerText || ''));
        if (!b) { const a = [...document.querySelectorAll('.btn-primary, button[type=submit]')].filter(x => en(x) && !/indietro|annulla|modifica/i.test(x.innerText || '')); b = a[a.length - 1]; }
        if (b) { b.click(); return true; } return null;
      });
      if (!clicked) await page.waitForTimeout(1100);
    }
    log.push('step ' + i + ': ' + page.url().slice(-24) + ' adv=' + clicked);
    if (!clicked && !/details|owner/.test(page.url())) break;
    await page.waitForTimeout(3000);
  }
  return { url: page.url(), log };
}
// Legge i prezzi della schermata quotation/options con il contesto (etichetta) di ognuno.
async function readPremio24() {
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim();
    const NAV = /scooter|sport|barca|blog|contatti|polizze|preventivi|esci|scadenze|webinar|supporto|comunicaz|riservat/i;
    const out = [];
    [...document.querySelectorAll('*')].forEach(e => {
      if (e.children.length > 2) return;
      const m = clean(e.innerText).match(/^€?\s*([\d.]+,\d{2})\s*€?$/);
      if (!m) return;
      // salgo i parent finché trovo una RIGA con anche del testo-etichetta (lettere)
      let lab = '', c = e;
      for (let k = 0; k < 5 && c; k++) { c = c.parentElement; if (!c) break; const t = clean(c.innerText); if (/[a-zA-Z]{3}/.test(t) && t.length < 90 && !NAV.test(t)) { lab = t; break; } }
      out.push({ prezzo: m[1], ctx: lab.slice(0, 80) });
    });
    // testo della pagina senza nav/footer (righe brevi e sensate)
    const righe = (document.body.innerText || '').split('\n').map(clean).filter(t => t && t.length < 70 && !NAV.test(t));
    const pageText = righe.join(' | ').slice(0, 1400);
    const prezzi = [...((document.body.innerText || '').matchAll(/([\d.]+,\d{2})\s*€/g))].map(x => x[1]);
    // PREMIO RC = il prezzo della card "Assicurazione RCA completa". Escludo il valore veicolo (riga con CU/targa).
    const num = s => parseFloat((s || '').replace(/\./g, '').replace(',', '.'));
    const rca = out.find(p => /RCA|RC\s*completa|responsabilit/i.test(p.ctx) && !/CU\s*\d|valore/i.test(p.ctx));
    const furto = out.find(p => /incendio e furto|furto/i.test(p.ctx));
    return {
      url: location.href,
      premio_rca: rca ? rca.prezzo : null,
      premio_rca_num: rca ? num(rca.prezzo) : null,
      opzione_incendio_furto: furto ? furto.prezzo : null,
      prezziConContesto: out.slice(0, 22), prezzi: [...new Set(prezzi)].slice(0, 15), pageText,
    };
  });
}

http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/status')) return res.end(JSON.stringify({ url: page.url() }));

    if (u.pathname.startsWith('/quote')) {
      // NUOVO FLUSSO moto.app v2: targa + nascita + CF + comune → schermata prezzo (quotation/options)
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const nascita = (u.searchParams.get('nascita') || '').trim();
      const cf = (u.searchParams.get('cf') || '').toUpperCase().trim();
      const comune = (u.searchParams.get('comune') || '').trim();
      if (!targa || !nascita) return res.end(JSON.stringify({ error: 'Uso: /quote?targa=..&nascita=GG/MM/AAAA&cf=..&comune=..' }));
      log('Preventivo 24H:', targa, nascita, 'cf=', cf, 'comune=', comune);
      const drive = await driveTo24h(targa, nascita, cf, comune);
      await page.screenshot({ path: 'shots/quote-2-risultato.png', fullPage: true }).catch(() => {});
      const r = await readPremio24();
      const arrivato = /quotation\/(options|quote|guarantees)/.test(r.url || '');
      return res.end(JSON.stringify({
        compagnia: 'Moto Platinum',
        ok: arrivato && !!r.premio_rca,
        premio_totale: r.premio_rca,             // premio RC ("Assicurazione RCA completa")
        premio_totale_num: r.premio_rca_num,
        garanzie_incluse: ['Rinuncia alla rivalsa'],
        input: { targa, nascita, cf, comune }, drive_log: drive.log, ...r,
      }, null, 2));
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
      const steps = Math.min(8, parseInt(u.searchParams.get('steps') || '7', 10));
      const comune = (u.searchParams.get('comune') || 'TRAPANI').trim();
      const cf = (u.searchParams.get('cf') || '').toUpperCase().trim();
      if (!targa || !nascita) return res.end(JSON.stringify({ error: 'Uso: /flowmap?targa=..&nascita=..' }));
      await fastquote(targa, nascita);
      const seq = [];
      for (let i = 0; i < steps; i++) {
        lastDrive = Date.now(); // mantiene sospeso il keep-alive per tutta la durata del drive
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
        // ALLESTIMENTO: widget vue-multiselect (blocca PROSEGUI). Apro e scelgo la prima opzione.
        const all = await page.evaluate(() => {
          const lab = [...document.querySelectorAll('label')].find(l => /allestimento/i.test(l.innerText || ''));
          let ms = null;
          if (lab) { let c = lab.parentElement; for (let i = 0; i < 4 && c; i++) { ms = c.querySelector('.multiselect'); if (ms) break; c = c.parentElement; } }
          ms = ms || document.querySelector('.multiselect');
          if (!ms) return 'no-multiselect';
          if (ms.querySelector('.multiselect__single, .multiselect__tag')) return 'già-selezionato';
          ms.click(); const inp = ms.querySelector('.multiselect__input'); if (inp) inp.focus();
          return 'aperto';
        });
        if (all === 'aperto') {
          await page.waitForTimeout(1200);
          const picked = await page.evaluate(() => {
            const opts = [...document.querySelectorAll('.multiselect__content .multiselect__option, li.multiselect__element span')].filter(o => o.offsetParent !== null && (o.innerText || '').trim() && !/nessun|no result|lista vuota/i.test(o.innerText || ''));
            if (!opts.length) return null;
            const o = opts[0]; const txt = (o.innerText || '').trim(); o.click(); return txt;
          });
          seq[seq.length - 1].allestimento = picked;
          await page.waitForTimeout(1200);
        } else seq[seq.length - 1].allestimento = all;
        // CODICE FISCALE (step Proprietario): il portale ricava i dati dal CF (come Plurima)
        if (cf) {
          const cfRes = await page.evaluate((cf) => {
            const inp = [...document.querySelectorAll('input')].find(e => e.offsetParent !== null && /codice fiscale|p\.?\s*iva/i.test((e.placeholder || '') + ((e.closest('div,label') || {}).innerText || '')));
            if (!inp) return 'no-cf';
            if (inp.value && inp.value.trim()) return 'già:' + inp.value;
            inp.focus(); inp.value = cf;
            inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); inp.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true })); inp.dispatchEvent(new Event('blur', { bubbles: true }));
            return 'compilato';
          }, cf);
          seq[seq.length - 1].cf = cfRes;
          if (cfRes === 'compilato') await page.waitForTimeout(2800); // lookup CF
        }
        // COMUNE (step Proprietario): input "Cerca il comune" con autocomplete → digito e scelgo
        // COMUNE con AZIONI NATIVE Playwright (i click reali fanno scattare i listener Vue @mousedown,
        // che gli eventi sintetici di dispatchEvent ignorano). Digito e clicco l'opzione davvero.
        try {
          const comH = await page.evaluateHandle(() => [...document.querySelectorAll('input.multiselect__input, input')].find(e => e.offsetParent !== null && /comune/i.test((e.placeholder || '') + ((e.closest('div,label') || {}).innerText || ''))) || null);
          const comInp = comH.asElement();
          if (!comInp) { seq[seq.length - 1].comune = 'no-comune'; }
          else {
            await comInp.click({ timeout: 4000 }).catch(() => {});
            await comInp.fill('').catch(() => {});
            await comInp.type(comune, { delay: 60 }).catch(() => {});   // typing reale → parte la ricerca ISTAT
            await page.waitForTimeout(2800);
            const optLoc = page.locator('.multiselect__option, li.multiselect__element').filter({ hasText: comune.slice(0, 4) }).first();
            let cp = null;
            if (await optLoc.count().catch(() => 0)) { cp = (await optLoc.innerText().catch(() => '')).trim(); await optLoc.click({ timeout: 5000 }).catch(() => {}); }
            seq[seq.length - 1].comune = cp;
            await page.waitForTimeout(1800);
            seq[seq.length - 1].comuneOk = await page.evaluate(() => { const s = document.querySelector('.multiselect__single'); return s ? (s.innerText || '').trim().slice(0, 30) : 'no-single'; });
          }
        } catch (e) { seq[seq.length - 1].comune = 'err:' + e.message.slice(0, 40); }
        // dump dettagliato dello step corrente (campi + bottoni con stato disabled) — per capire cosa serve
        seq[seq.length - 1].dettaglio = await page.evaluate(() => {
          const clean = s => (s || '').replace(/\s+/g, ' ').trim();
          const vis = e => e && e.offsetParent !== null;
          const campi = [...document.querySelectorAll('input,select,textarea,.multiselect')].filter(vis).map(e => ({ tag: e.tagName.toLowerCase() + (e.className && /multiselect/.test(e.className) ? '.ms' : ''), type: e.type || '', ph: (e.placeholder || '').slice(0, 25), val: (e.value || '').slice(0, 20), checked: (e.type === 'checkbox' || e.type === 'radio') ? e.checked : undefined, req: e.required || e.getAttribute('aria-required') === 'true' || undefined, lab: clean((e.closest('div,label,.form-group') || {}).innerText).slice(0, 45) })).slice(0, 22);
          const btns = [...document.querySelectorAll('button,a')].filter(b => vis(b) && clean(b.innerText) && !/scooter|sport|barca|blog|contatti|polizze|preventivi|sospeso|i tuoi dati|moto\.app|sito di supporto|esci/i.test(b.innerText)).map(b => ({ t: clean(b.innerText).slice(0, 22), dis: !!b.disabled })).filter((v, i, a) => a.findIndex(x => x.t === v.t) === i).slice(0, 12);
          // errori di validazione visibili (spesso spiegano perché PROSEGUI è bloccato)
          const errori = [...document.querySelectorAll('.invalid-feedback, .error, .text-danger, [class*=error]')].filter(vis).map(e => clean(e.innerText)).filter(t => t && t.length < 60).slice(0, 8);
          // testo dell'area form (escludo header/footer/nav) + HTML compatto della sezione principale
          const main = document.querySelector('main, .container, .content, [class*=step-content], form') || document.body;
          const bodyText = clean(main.innerText).slice(0, 1200);
          const formHtml = (main.outerHTML || '').replace(/<(script|style|svg|path)[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/\s+/g, ' ').slice(0, 2500);
          return { campi, btns, errori, bodyText, formHtml };
        });
        // scroll in fondo (il PROSEGUI è spesso sotto la piega) e clicco il bottone di avanzamento.
        // Riprovo qualche volta: dopo CF/comune il bottone può abilitarsi con un attimo di ritardo.
        let clicked = null;
        for (let r = 0; r < 5 && !clicked; r++) {
          clicked = await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
            const enabled = x => x && x.offsetParent !== null && !x.disabled && x.getAttribute('aria-disabled') !== 'true';
            const re = /^(prosegui|continua|avanti|conferma|calcola|vai al preventivo|preventivo|salva e prosegui|procedi|vai avanti|fine)$/i;
            // 1) per testo
            let b = [...document.querySelectorAll('button,a,[role=button],input[type=submit]')].find(x => enabled(x) && re.test(((x.innerText || x.value) || '').trim()));
            // 2) per CLASSE: il CTA del portale moto.app è .btn-primary.rounded-pill (il testo può variare/essere icona)
            if (!b) b = [...document.querySelectorAll('button.btn-primary, .btn-primary.rounded-pill, button.btn-block.btn-primary')].find(x => enabled(x) && !/indietro|annulla|modifica/i.test(x.innerText || ''));
            // 3) ultimo .btn-primary visibile abilitato (di solito è il prosegui in basso a destra)
            if (!b) { const all = [...document.querySelectorAll('.btn-primary, button[type=submit]')].filter(x => enabled(x) && !/indietro|annulla|modifica/i.test(x.innerText || '')); b = all[all.length - 1]; }
            if (b) { b.click(); return ((b.innerText || b.value) || (b.className || '')).trim().slice(0, 30) || 'btn-primary'; }
            return null;
          });
          if (!clicked) await page.waitForTimeout(1500);
        }
        seq[seq.length - 1].clicked = clicked;
        await page.waitForTimeout(4500);
        if (!clicked) break;
      }
      return res.end(JSON.stringify({ seq }, null, 2));
    }
    if (u.pathname.startsWith('/allest')) {
      // DISCOVERY: come si seleziona l'ALLESTIMENTO sulla pagina /vehicle/details (blocca PROSEGUI)
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const nascita = (u.searchParams.get('nascita') || '').trim();
      if (!targa || !nascita) return res.end(JSON.stringify({ error: 'Uso: /allest?targa=..&nascita=..' }));
      await fastquote(targa, nascita);
      const info = await page.evaluate(() => {
        const clean = s => (s || '').replace(/\s+/g, ' ').trim();
        const tfh = [...document.querySelectorAll('tfh-ui-select')].map(s => ({ txt: clean(s.innerText).slice(0, 60), html: s.outerHTML.replace(/\s+/g, ' ').slice(0, 600) }));
        let allHtml = null;
        const lab = [...document.querySelectorAll('*')].find(e => e.children.length <= 3 && /^ALLESTIMENTO/i.test(clean(e.innerText)) && clean(e.innerText).length < 40);
        if (lab) { let c = lab; for (let i = 0; i < 6 && c; i++) { c = c.parentElement; if (c && clean(c.innerText).length > 18) { allHtml = c.outerHTML.replace(/\s+/g, ' ').slice(0, 1500); break; } } }
        const inputs = [...document.querySelectorAll('input')].filter(e => e.offsetParent !== null).map(e => ({ id: e.id || null, cls: (e.className || '').slice(0, 55), ph: e.placeholder || null, role: e.getAttribute('role') }));
        const pros = [...document.querySelectorAll('button,a')].find(b => /^\s*prosegui\s*$/i.test(clean(b.innerText)));
        const prosState = pros ? { disabled: pros.disabled, ariaDisabled: pros.getAttribute('aria-disabled'), cls: (pros.className || '').slice(0, 70) } : null;
        return { tfh, allHtml, inputs, prosState };
      });
      return res.end(JSON.stringify(info, null, 2));
    }
    if (u.pathname.startsWith('/apigrep')) {
      // Cerca nel JS del portale 24H tutti gli endpoint /api/... (incluso il calcolo premio)
      await page.goto('about:blank').catch(() => {});
      await page.goto(FASTQUOTE, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(4000);
      const out = await page.evaluate(async () => {
        const urls = [...new Set([...document.querySelectorAll('script[src]')].map(s => s.src).filter(u => /24hassistance|motoplatinum/.test(u) && /\.js/.test(u)))];
        const eps = new Set();
        for (const u of urls.slice(0, 40)) {
          try { const t = await (await fetch(u)).text(); let m; const re = /["'`](\/api\/[a-zA-Z0-9_\/.\-{}$:]+)["'`]/g; while ((m = re.exec(t))) eps.add(m[1].slice(0, 80)); } catch (e) {}
        }
        return { files: urls.length, endpoints: [...eps].sort() };
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/sniff/start')) { SNIFF.on = true; SNIFF.buf = []; SNIFF.t0 = Date.now(); return res.end(JSON.stringify({ ok: true, recording: true, msg: 'Registrazione avviata. Fai il preventivo a mano via VNC (display :99 / 127.0.0.1:5900), poi /sniff/stop.' })); }
    if (u.pathname.startsWith('/sniff/stop')) {
      SNIFF.on = false;
      const buf = SNIFF.buf.slice();
      const seq = buf.filter(e => /__ajax|\/api\/|\/quotation|\/vehicle|graphql|\/quote/i.test(e.url || ''))
        .map(e => e.kind === 'req'
          ? { t: e.t, '→': e.method + ' ' + (e.url || '').replace(/^https?:\/\/[^/]+/, ''), body: (e.body || '').slice(0, 600) }
          : { t: e.t, '←': e.status, url: (e.url || '').replace(/^https?:\/\/[^/]+/, ''), body: (e.body || '').slice(0, 1500) });
      return res.end(JSON.stringify({ ok: true, totale: buf.length, chiamate: seq.slice(0, 120) }, null, 2));
    }
    if (u.pathname.startsWith('/sniff')) return res.end(JSON.stringify({ recording: SNIFF.on, catturate: SNIFF.buf.length }));
    if (u.pathname.startsWith('/shot')) { await page.screenshot({ path: 'shots/current.png', fullPage: true }); return res.end(JSON.stringify({ ok: true, url: page.url() })); }
    res.end(JSON.stringify({ endpoints: ['/status', '/quote?targa=..&nascita=..&se=20&rivalsa=si&garanzie=furto,tutela', '/lookup?targa=..&nascita=..', '/map', '/rivalsa', '/shot'] }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
}).listen(4100, '127.0.0.1', () => log('Telecomando HTTP su 127.0.0.1:4100'));

setInterval(async () => { if (SNIFF.on || (Date.now() - lastDrive) < 270000) { return; } try { await page.goto(PORTAL, { waitUntil: 'domcontentloaded', timeout: 45000 }); log('[keep-alive] ok'); } catch (e) { log('[keep-alive] err:', e.message); } }, 4 * 60 * 1000);
log('=== SERVIZIO ATTIVO. curl localhost:4100/... ===');
await new Promise(() => {});
