// ─────────────────────────────────────────────────────────────────────────────
//  QUOTO — Companion Prima (gira sul TUO Mac)
//
//  Perché esiste: il portale Prima è dietro Cloudflare e blocca l'IP del nostro
//  server (datacenter) e anche gli IP VPN/WARP. L'unico IP che Prima accetta è
//  quello residenziale/business da cui fai NORMALMENTE il login. Questo piccolo
//  programma gira sul tuo Mac: apri Prima, fai il login UNA volta (resta salvato),
//  e da qui QUOTO può calcolare i preventivi Prima passando dal tuo IP.
//
//  STEP 1 (ora): pannello locale su http://localhost:8790 per (a) fare il login,
//                (b) provare un preventivo di test e verificare che funzioni.
//  STEP 2 (dopo): il companion prende in automatico i preventivi richiesti da
//                 QUOTO (si attiva mettendo enabled:true in config.json).
//
//  Nessuna porta aperta sul router: il companion fa solo traffico in USCITA.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dir, 'userdata');
const CFG_PATH = path.join(__dir, 'config.json');

function readCfg() {
  try { return JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')); } catch { return {}; }
}
const cfg = readCfg();
const LOGIN_URL = cfg.loginUrl || 'https://intermediari.prima.it/';
const UI_PORT = parseInt(cfg.uiPort || 8790, 10);
const log = (...a) => console.log(new Date().toLocaleTimeString('it-IT'), '[companion]', ...a);
const origin = (u) => { try { return new URL(u).origin; } catch { return 'https://www.prima.it'; } };

// ── Browser (persistente: la sessione Prima resta salvata in ./userdata) ──────
let ctx = null, page = null, launching = false;
async function ensurePage() {
  if (page && !page.isClosed()) return page;
  if (launching) { while (launching) await sleep(200); return page; }
  launching = true;
  try {
    ctx = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: null,
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
    });
    page = ctx.pages()[0] || await ctx.newPage();
  } finally { launching = false; }
  return page;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Riconoscimento login (uguale allo scraper) ────────────────────────────────
const isLoginUrl = (url) => /login|signin|accedi|auth|sso|mfa|totp|verify|2fa/i.test(url || '');
async function hasPasswordField() { return await page.$('input[type=password]').then(e => !!e).catch(() => false); }
async function otpField() {
  return await page.evaluate(() => {
    const ins = [...document.querySelectorAll('input')];
    const otp = ins.find(i => /otp|codice|code|token|verific/i.test((i.name || '') + (i.id || '') + (i.getAttribute('aria-label') || '')) && i.type !== 'password');
    return !!otp || ins.filter(i => (i.maxLength === 1) && /text|tel|number/.test(i.type)).length >= 4;
  }).catch(() => false);
}
async function loggedIn() {
  const u = page.url() || '';
  if (!/prima\.it/i.test(u)) return false;
  if (isLoginUrl(u)) return false;
  if (await hasPasswordField()) return false;
  if (await otpField()) return false;
  return true;
}

// ── PREVENTIVO PRIMA (GraphQL diretto) — identico allo scraper ────────────────
async function drivePrimaQuote(d) {
  await ensurePage();
  if (!(await loggedIn().catch(() => false))) return { ok: false, error: 'Prima non loggato: premi "Apri Prima e accedi" e fai il login.' };
  const ORIGIN = origin(LOGIN_URL);
  const out = await page.evaluate(async (ARG) => {
    const gql = async (path, query, variables) => {
      const r = await fetch(ARG.origin + path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(variables !== undefined ? { query, variables } : { query }) });
      const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, json: j, raw: t.slice(0, 400) };
    };
    const esc = s => String(s || '').replace(/\\/g, '').replace(/"/g, '\\"');
    const fq = 'mutation { fastQuote(fastQuoteData: {vehicleType: ' + (ARG.vehicleType || 'CAR') + ', vehiclePlateNumber: "' + esc(ARG.targa) + '", ownerBirthDate: "' + esc(ARG.nascita) + '", ownerOccupation: ' + ARG.professione + ', ownerCivilStatus: ' + ARG.statoCivile + ', ownerResidentialAddress: "' + esc(ARG.indirizzo) + '", ownerResidentialZipCode: "' + esc(ARG.cap) + '", ownerResidentialCity: "' + esc(ARG.cittaIstat) + '", ownerResidentialCivicNumber: "' + esc(ARG.civico) + '", phoneNumber: "' + esc(ARG.telefono) + '", ownerLicenseIdIsRequested: true, ownerLicenseYear: ' + (parseInt(ARG.annoPatente, 10) || 2010) + ', legalEntity: false, insuranceType: BONUS_MALUS, ownerNoLicense: false, privacyAll: true, userPrivacyMarketing: false, userPrivacyThirdPart: false, userPrivacyCommercial: false}) { errors { field level messages } valid uniqueIdentifier } }';
    const r1 = await gql('/api/graphql', fq);
    const fqd = r1.json && r1.json.data && r1.json.data.fastQuote;
    if (!fqd || !fqd.uniqueIdentifier) return { ok: false, error: 'fastQuote fallito (' + r1.status + ')', errors: fqd && fqd.errors, raw: r1.raw };
    const id = fqd.uniqueIdentifier;
    const qq = 'query Quote($id: UUID!) { quote(id: $id) { __typename ... on Quote { installmentPrices { installments { guarantees { slug selected priceBlocks { coveragePrice { legal } } } } } } } }';
    let ip = null, tries = 0;
    for (let i = 0; i < 16; i++) { tries = i + 1; const r2 = await gql('/mfe/covers-api/graphql', qq, { id }); const q = r2.json && r2.json.data && r2.json.data.quote; ip = q && q.installmentPrices; if (ip && ip[0] && ip[0].installments && ip[0].installments[0] && (ip[0].installments[0].guarantees || []).length) break; await new Promise(r => setTimeout(r, 1500)); }
    if (!ip || !ip[0] || !ip[0].installments || !ip[0].installments[0]) return { ok: false, error: 'Quote senza installmentPrices', id, tries };
    const gars = ip[0].installments[0].guarantees || [];
    let tot = 0; const det = [];
    for (const gr of gars) { if (!gr.selected) continue; const pb = (gr.priceBlocks || [])[0]; const price = pb && pb.coveragePrice && pb.coveragePrice.legal; const n = price ? parseFloat(String(price).replace(',', '.')) : 0; if (n > 0) { tot += n; det.push({ slug: gr.slug, price: String(price) }); } }
    return { ok: tot > 0, id, tot: Math.round(tot * 100) / 100, garanzie: det, tries };
  }, { origin: ORIGIN, vehicleType: d.vehicleType, targa: d.targa, nascita: d.nascita, professione: d.professione || 'IMPIEGATO_QUADRO_DIRIGENTE', statoCivile: d.statoCivile || 'SINGLE', indirizzo: d.indirizzo, cap: d.cap, cittaIstat: d.cittaIstat, civico: d.civico, telefono: d.telefono, annoPatente: d.annoPatente }).catch(e => ({ ok: false, error: String(e && e.message || e) }));
  if (out && out.ok) return { ok: true, compagnia: 'Prima', prodotto: 'RC Auto', via: 'companion', premio_annuale_num: out.tot, premio_annuale: out.tot.toFixed(2).replace('.', ',') + ' €', annuale: { totale: out.tot.toFixed(2).replace('.', ',') }, garanzie_incluse: (out.garanzie || []).map(g => g.slug), quote_id: out.id, dettaglio: out.garanzie };
  return out || { ok: false, error: 'quote fallita' };
}

// ── STEP 2: ponte con QUOTO (attivo solo se config.json enabled:true) ─────────
//  Il companion CHIEDE lavori al backend (traffico in USCITA). Nessuna porta aperta.
let bridgeStat = { attivo: false, ultimo: '', fatti: 0, errori: 0 };
async function bridgeGet(pathq) {
  const r = await fetch(cfg.bridgeUrl.replace(/\/$/, '') + pathq, { headers: { 'X-Companion-Token': cfg.token || '' } });
  const t = await r.text(); try { return { status: r.status, json: JSON.parse(t) }; } catch { return { status: r.status, json: null, raw: t }; }
}
async function bridgePost(pathq, body) {
  const r = await fetch(cfg.bridgeUrl.replace(/\/$/, '') + pathq, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Companion-Token': cfg.token || '' }, body: JSON.stringify(body) });
  const t = await r.text(); try { return { status: r.status, json: JSON.parse(t) }; } catch { return { status: r.status, json: null, raw: t }; }
}
async function bridgeLoop() {
  if (!cfg.enabled || !cfg.bridgeUrl) { log('ponte QUOTO: DISATTIVO (config.json enabled:false) — modalità test locale'); return; }
  bridgeStat.attivo = true;
  log('ponte QUOTO: ATTIVO →', cfg.bridgeUrl);
  for (;;) {
    let gotJob = false;
    try {
      const nx = await bridgeGet('/prima/job/next');
      const job = nx.json && nx.json.job;
      if (job && job.id) {
        gotJob = true;
        log('job', job.id, 'targa', (job.input && job.input.targa) || '?');
        let res;
        try { res = await drivePrimaQuote(job.input || {}); }
        catch (e) { res = { ok: false, error: String(e && e.message || e) }; }
        await bridgePost('/prima/job/result', { id: job.id, token: cfg.token, result: res });
        bridgeStat.fatti++; bridgeStat.ultimo = new Date().toLocaleTimeString('it-IT') + ' ' + (res.ok ? ('OK ' + res.premio_annuale) : ('ERR ' + (res.error || '')));
      }
    } catch (e) { bridgeStat.errori++; bridgeStat.ultimo = 'errore ponte: ' + e.message; }
    await sleep(gotJob ? 300 : 2500);
  }
}

// ── UI locale (http://localhost:8790) ─────────────────────────────────────────
const HTML = `<!doctype html><html lang=it><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>QUOTO · Companion Prima</title><style>
*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:24px auto;padding:0 16px;color:#0f172a;background:#f8fafc}
h1{font-size:20px;margin:0 0 4px}.sub{color:#64748b;font-size:13px;margin-bottom:18px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-bottom:14px}
.card h2{font-size:14px;margin:0 0 10px;text-transform:uppercase;letter-spacing:.03em;color:#475569}
button{background:#2563eb;color:#fff;border:0;border-radius:10px;padding:10px 14px;font-size:14px;font-weight:600;cursor:pointer}
button.ghost{background:#eef2ff;color:#2563eb}button:disabled{opacity:.5}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
label{display:block;font-size:12px;color:#475569;margin:8px 0 2px}
input,select{width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600}
.ok{background:#dcfce7;color:#166534}.no{background:#fee2e2;color:#991b1b}.wait{background:#fef9c3;color:#854d0e}
pre{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:10px;overflow:auto;font-size:12px;white-space:pre-wrap;word-break:break-word}
.muted{color:#64748b;font-size:12px}
</style></head><body>
<h1>QUOTO · Companion Prima</h1>
<div class=sub>Gira sul tuo Mac. Fa i preventivi Prima dal tuo IP (quello che Prima accetta).</div>

<div class=card><h2>1 · Accesso Prima</h2>
<div class=row><span id=stato class="pill wait">controllo…</span>
<button class=ghost onclick=apri()>Apri Prima e accedi</button>
<button class=ghost onclick=verifica()>Ho fatto il login</button></div>
<div class=muted style="margin-top:8px">Fai il login UNA volta nella finestra che si apre (metti la spunta "ricorda dispositivo" se c'è). Resta salvato.</div>
</div>

<div class=card><h2>2 · Preventivo di prova</h2>
<div class=grid>
<div><label>Targa</label><input id=targa placeholder=GY263BY></div>
<div><label>Data nascita (aaaa-mm-gg)</label><input id=nascita placeholder=1993-07-17></div>
<div><label>Professione</label><input id=professione value=IMPIEGATO_QUADRO_DIRIGENTE></div>
<div><label>Stato civile</label><select id=statoCivile><option>SINGLE</option><option selected>MARRIED</option><option>DIVORCED</option><option>WIDOWED</option><option>COHABITING</option></select></div>
<div><label>Indirizzo</label><input id=indirizzo placeholder="via/contrada"></div>
<div><label>Civico</label><input id=civico placeholder=142></div>
<div><label>CAP</label><input id=cap placeholder=91025></div>
<div><label>Codice ISTAT città</label><input id=cittaIstat placeholder=081011></div>
<div><label>Telefono</label><input id=telefono placeholder=3273528483></div>
<div><label>Anno patente</label><input id=annoPatente placeholder=2011></div>
</div>
<div class=row style="margin-top:12px"><button id=btnq onclick=preventivo()>Calcola preventivo di prova</button></div>
<div id=risult style="margin-top:12px"></div>
</div>

<div class=card><h2>3 · Ponte con QUOTO</h2>
<div id=ponte class=muted>—</div>
</div>

<script>
async function j(u,o){const r=await fetch(u,o);return r.json()}
function setStato(s){const e=document.getElementById('stato');if(s.loggato){e.className='pill ok';e.textContent='Loggato ✓'}else{e.className='pill no';e.textContent='Non loggato'}}
async function stato(){try{const s=await j('/stato');setStato(s);document.getElementById('ponte').innerHTML=s.ponte&&s.ponte.attivo?('ATTIVO · fatti '+s.ponte.fatti+' · '+ (s.ponte.ultimo||'')):'Disattivo (modalità test). Lo attiviamo insieme allo step 2.';}catch(e){}}
async function apri(){await j('/apri',{method:'POST'});setTimeout(stato,1500)}
async function verifica(){const s=await j('/verifica',{method:'POST'});setStato(s)}
async function preventivo(){
 const b=document.getElementById('btnq');b.disabled=true;
 const r=document.getElementById('risult');r.innerHTML='<span class="pill wait">calcolo… (può richiedere ~30s)</span>';
 const d={};for(const k of ['targa','nascita','professione','statoCivile','indirizzo','civico','cap','cittaIstat','telefono','annoPatente'])d[k]=document.getElementById(k).value.trim();
 try{const res=await j('/test-preventivo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
  if(res.ok){r.innerHTML='<div class="pill ok">Premio annuale: '+res.premio_annuale+'</div><pre>'+JSON.stringify(res,null,2)+'</pre>';}
  else{r.innerHTML='<div class="pill no">Errore</div><pre>'+JSON.stringify(res,null,2)+'</pre>';}
 }catch(e){r.innerHTML='<div class="pill no">Errore rete: '+e.message+'</div>'}
 b.disabled=false;
}
stato();setInterval(stato,4000);
</script></body></html>`;

function send(res, code, obj, type) {
  res.statusCode = code;
  res.setHeader('content-type', type || 'application/json; charset=utf-8');
  res.end(type ? obj : JSON.stringify(obj));
}
async function readBody(req) { return await new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); }); }

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/' || u.pathname === '/index.html') return send(res, 200, HTML, 'text/html; charset=utf-8');
    if (u.pathname === '/stato') { await ensurePage().catch(() => {}); const loggato = await loggedIn().catch(() => false); return send(res, 200, { loggato, url: page ? page.url() : '', ponte: bridgeStat }); }
    if (u.pathname === '/apri' && req.method === 'POST') { await ensurePage(); await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {}); return send(res, 200, { ok: true }); }
    if (u.pathname === '/verifica' && req.method === 'POST') { await ensurePage().catch(() => {}); const loggato = await loggedIn().catch(() => false); return send(res, 200, { loggato }); }
    if (u.pathname === '/test-preventivo' && req.method === 'POST') { const d = await readBody(req); log('test preventivo', d.targa); const r = await drivePrimaQuote(d); return send(res, 200, r); }
    return send(res, 404, { error: 'endpoint sconosciuto' });
  } catch (e) { return send(res, 500, { error: e.message }); }
}).listen(UI_PORT, '127.0.0.1', () => {
  log('Pannello pronto → http://localhost:' + UI_PORT);
  ensurePage().then(() => log('browser pronto')).catch(e => log('browser err', e.message));
  bridgeLoop().catch(e => log('bridge err', e.message));
});
