// ── Shop pubblico: quotazione + pagamento dalla landing (senza login) ────────────
// Sicurezza: il PREZZO è calcolato SEMPRE qui sul server (mai fidarsi del browser).
// Pagamento via Stripe o PayPal; a incasso riuscito registra la vendita e avvisa l'ufficio.
import { Router } from 'express';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
const STAFF_INBOX = process.env.STAFF_EMAIL || 'intermediari@withusassicurazioni.it';
const NOTIFY_FROM = process.env.NOTIFY_FROM || STAFF_INBOX;

// ── Tariffe pubbliche (autoritative). Allineate a QUOTO. ─────────────────────────
const SAL = { attiva:{base:{s:900,n:1700},plus:{s:1460,n:2600},plat:{s:2800,n:5400}}, protezione:{base:{s:1300,n:2500},plus:{s:1800,n:3500},plat:{s:2800,n:5700}} };
const OPZ = {
  infortuni:      { etich:'Infortuni',            opzioni:[60,90,120,180,200] },
  animali:        { etich:'Animali (Dottorpet)',  opzioni:[95,129,240,360], addon:50 },
  'aglea-ltc':    { etich:'Aglea LTC',            opzioni:[150,200,350] },
  'aglea-medici': { etich:'Aglea Medici',          opzioni:[1150,2200,1800,3500] },
  'aglea-salute360':{ etich:'Salute 360',          opzioni:[1160,1960] },
  'aglea-senis':  { etich:'Senis Assistance',      opzioni:[1950] },
};
function calcPrezzo(prodotto, p) {
  p = p || {};
  if (prodotto === 'vita') return { prezzo: 144, etich: 'RC Vita Privata' };
  if (prodotto === 'aglea-attiva' || prodotto === 'aglea-protezione') {
    const linea = prodotto === 'aglea-attiva' ? 'attiva' : 'protezione';
    const liv = ['base','plus','plat'].includes(p.liv) ? p.liv : 'base';
    const comp = p.comp === 'n' ? 'n' : 's';
    const v = SAL[linea][liv][comp];
    return v ? { prezzo: v, etich: 'Aglea ' + linea + ' ' + liv + ' (' + (comp==='n'?'Nucleo':'Singolo') + ')' } : null;
  }
  if (OPZ[prodotto]) {
    const cfg = OPZ[prodotto];
    const i = Math.max(0, Math.min(cfg.opzioni.length - 1, parseInt(p.opt, 10) || 0));
    let prezzo = cfg.opzioni[i];
    if (cfg.addon && p.addon) prezzo += cfg.addon;
    return { prezzo, etich: cfg.etich };
  }
  return null; // prodotto non quotabile pubblicamente (es. RC Prof, Auto, Casa)
}

// ── Helper ──────────────────────────────────────────────────────────────────────
function ppBase() { return (process.env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'; }
async function ppToken() {
  const auth = Buffer.from(process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_SECRET).toString('base64');
  const r = await fetch(ppBase() + '/v1/oauth2/token', { method: 'POST', headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  const d = await r.json(); if (!r.ok) throw new Error('PayPal auth'); return d.access_token;
}
function stripeH() { return { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }; }
function esc(s){ return String(s ?? '').replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function registraVendita({ prodotto, etich, prezzo, cliente, metodo, payRef, documenti, accettazioni }) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dati = { stato:'pagato', lead:true, public:true, fonte:'shop online',
    contatto:{ nome:cliente.nome, cognome:cliente.cognome, cf:cliente.cf, email:cliente.email, telefono:cliente.telefono },
    documenti: Array.isArray(documenti) ? documenti.slice(0,8) : [],
    accettazioni: accettazioni || null,
    pagamento:{ metodo, importo:prezzo, payRef, data:new Date().toISOString() }, prodottoKey:prodotto };
  const nome = ((cliente.nome||'') + ' ' + (cliente.cognome||'')).trim();
  if (key) {
    await fetch(`${SUPABASE_URL}/rest/v1/quote_preventivi`, { method:'POST',
      headers:{ apikey:key, Authorization:'Bearer '+key, 'Content-Type':'application/json', Prefer:'return=minimal' },
      body: JSON.stringify([{ modulo:'shop', prodotto:etich, premio:prezzo, cliente:nome, dati, creato_nome:'Shop online' }]) });
  }
  // avviso ufficio + conferma cliente
  const bk = process.env.BREVO_API_KEY;
  if (bk) {
    const send = (to, subject, html) => fetch('https://api.brevo.com/v3/smtp/email', { method:'POST',
      headers:{ 'api-key':bk, 'content-type':'application/json', accept:'application/json' },
      body: JSON.stringify({ sender:{ email:NOTIFY_FROM, name:'QUOTO Shop' }, to:to.map(e=>({email:e})), subject, htmlContent:html }) });
    const det = `<p><b>Prodotto:</b> ${esc(etich)}<br><b>Importo pagato:</b> € ${prezzo.toFixed(2)} (${esc(metodo)})<br><b>Cliente:</b> ${esc(nome)} · CF ${esc(cliente.cf||'—')}<br><b>Contatti:</b> ${esc(cliente.email||'—')} · ${esc(cliente.telefono||'—')}</p>`;
    try { await send([STAFF_INBOX], 'Nuova vendita online — ' + etich, '<h2>Nuova vendita dallo shop</h2>'+det+'<p>Completa la polizza in QUOTO → Richieste.</p>'); } catch(_) {}
    if (cliente.email) { try { await send([cliente.email], 'Conferma pagamento — With Us', '<h2>Grazie '+esc(cliente.nome||'')+'!</h2><p>Abbiamo ricevuto il pagamento. Un nostro operatore completerà la tua polizza e ti contatterà a breve.</p>'+det); } catch(_) {} }
  }
}

function leggiCliente(b){ return { nome:String(b?.nome||'').trim().slice(0,80), cognome:String(b?.cognome||'').trim().slice(0,80), cf:String(b?.cf||'').trim().toUpperCase().slice(0,16), email:String(b?.email||'').trim().slice(0,160), telefono:String(b?.telefono||'').trim().slice(0,40) }; }

// ── Anteprima social per-prodotto (Open Graph) + redirect alla landing ───────────
// Serve link "belli" da condividere su WhatsApp con immagine e titolo del prodotto.
const LANDING_BASE = process.env.LANDING_URL || 'https://quoto.withusassicurazioni.it/landing.html';
const OGIMG = (id) => 'https://images.unsplash.com/photo-' + id + '?w=1200&h=630&fit=crop&q=70&auto=format';
const META = {
  'vita':            { n:'RC Vita Privata', d:'Proteggi la tua famiglia da 12 € al mese.', img:OGIMG('1511895426328-dc8714191300') },
  'aglea-attiva':    { n:'Aglea Salus · Attiva', d:'Salute, ricovero, prevenzione e Long Term Care inclusa.', img:OGIMG('1576091160399-112ba8d25d1d') },
  'aglea-protezione':{ n:'Aglea Salus · Protezione', d:'Copertura sanitaria completa, ogni giorno.', img:OGIMG('1576091160399-112ba8d25d1d') },
  'aglea-ltc':       { n:'Aglea Salus · Long Term Care', d:'Una rendita a vita in caso di non autosufficienza.', img:OGIMG('1576091160399-112ba8d25d1d') },
  'aglea-medici':    { n:'Aglea Medici', d:'La polizza sanitaria pensata per i medici.', img:OGIMG('1576091160399-112ba8d25d1d') },
  'aglea-salute360': { n:'Salute 360', d:'Protezione sanitaria completa, giovane e famiglia.', img:OGIMG('1576091160399-112ba8d25d1d') },
  'aglea-senis':     { n:'Senis Assistance', d:'La protezione sanitaria pensata per i senior.', img:OGIMG('1576091160399-112ba8d25d1d') },
  'infortuni':       { n:'Assicurazione Infortuni', d:'Un sostegno economico in caso di infortunio, 24h.', img:OGIMG('1571019613454-24bc7b8f0c10') },
  'tutela':          { n:'Tutela Legale', d:'Avvocato e spese legali a carico nostro.', img:OGIMG('1589829545856-d10d557cf95f') },
  'viaggio':         { n:'Assicurazione Viaggio', d:'Assistenza, spese mediche e bagaglio per i tuoi viaggi.', img:OGIMG('1488646953014-85cb44e25828') },
  'animali':         { n:'Assicurazione Animali', d:'Cure veterinarie e RC per cani e gatti.', img:OGIMG('1601758228041-f3b2795255f1') },
  'rcprof':          { n:'RC Professionale', d:'La copertura su misura per la tua professione.', img:OGIMG('1521791136064-7986c2920216') },
  'casa':            { n:'Assicurazione Casa', d:'Proteggi la tua casa da incendio, furto e danni.', img:OGIMG('1568605114967-8130f3a36994') },
  'auto':            { n:'Assicurazione Auto / Moto', d:'RC Auto e garanzie al miglior prezzo.', img:OGIMG('1503376780353-7e6692767b70') },
};
export const ogRouter = Router();
ogRouter.get('/:prodotto', (req, res) => {
  const k = req.params.prodotto; const m = META[k] || META.vita;
  const target = LANDING_BASE + '?prodotto=' + encodeURIComponent(k);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send('<!doctype html><html lang="it"><head><meta charset="utf-8">'
    + '<title>' + esc(m.n) + ' — With Us</title>'
    + '<meta property="og:title" content="' + esc(m.n) + ' — With Us Assicurazioni">'
    + '<meta property="og:description" content="' + esc(m.d) + '">'
    + '<meta property="og:image" content="' + m.img + '">'
    + '<meta property="og:type" content="website"><meta property="og:url" content="' + esc(target) + '">'
    + '<meta name="twitter:card" content="summary_large_image">'
    + '<meta http-equiv="refresh" content="0;url=' + esc(target) + '"></head>'
    + '<body style="font-family:Arial;text-align:center;padding:40px">Apertura preventivo… <a href="' + esc(target) + '">Continua</a>'
    + '<script>location.replace(' + JSON.stringify(target) + ')</script></body></html>');
});

export const shopRouter = Router();

// Caricamento documento del cliente su Supabase Storage (bucket "documenti")
shopRouter.post('/upload', async (req, res) => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return res.status(503).json({ error: 'Storage non configurato.' });
  const { filename, contentType, data } = req.body || {};
  if (!data) return res.status(400).json({ error: 'File mancante.' });
  try {
    const buf = Buffer.from(String(data).split(',').pop(), 'base64');
    if (buf.length > 12 * 1024 * 1024) return res.status(400).json({ error: 'File troppo grande (max 12MB).' });
    const safe = String(filename || 'doc').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const path = 'shop/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_' + safe;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/documenti/${path}`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': contentType || 'application/octet-stream', 'x-upsert': 'true' }, body: buf,
    });
    if (!r.ok) throw new Error('Upload: ' + (await r.text()).slice(0, 150));
    res.json({ ok: true, url: `${SUPABASE_URL}/storage/v1/object/public/documenti/${path}`, nome: safe });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Quotazione pubblica (prezzo calcolato dal server)
shopRouter.post('/quote', (req, res) => {
  const q = calcPrezzo(req.body?.prodotto, req.body?.params);
  if (!q) return res.status(404).json({ error: 'Prodotto non quotabile online.' });
  res.json({ ok: true, prezzo: q.prezzo, etich: q.etich });
});

// ── Stripe ───────────────────────────────────────────────────────────────────
shopRouter.post('/checkout/stripe/create-intent', async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Pagamenti non configurati.' });
  const q = calcPrezzo(req.body?.prodotto, req.body?.params);
  if (!q) return res.status(400).json({ error: 'Prodotto non quotabile.' });
  try {
    const body = new URLSearchParams();
    body.set('amount', String(Math.round(q.prezzo * 100)));
    body.set('currency', 'eur');
    body.set('automatic_payment_methods[enabled]', 'true');
    body.set('description', q.etich);
    body.set('metadata[prodotto]', String(req.body?.prodotto || ''));
    const r = await fetch('https://api.stripe.com/v1/payment_intents', { method:'POST', headers:stripeH(), body:body.toString() });
    const d = await r.json(); if (!r.ok) throw new Error(d.error?.message || 'Stripe');
    res.json({ clientSecret: d.client_secret, id: d.id, prezzo: q.prezzo, etich: q.etich });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
shopRouter.post('/checkout/stripe/confirm', async (req, res) => {
  const q = calcPrezzo(req.body?.prodotto, req.body?.params);
  if (!q) return res.status(400).json({ error: 'Prodotto non valido.' });
  const id = String(req.body?.id || '');
  try {
    const r = await fetch('https://api.stripe.com/v1/payment_intents/' + encodeURIComponent(id), { headers: stripeH() });
    const d = await r.json(); if (!r.ok) throw new Error(d.error?.message || 'Stripe');
    if (d.status !== 'succeeded') return res.status(400).json({ error: 'Pagamento non riuscito (' + d.status + ').' });
    if (Number(d.amount) !== Math.round(q.prezzo * 100)) return res.status(400).json({ error: 'Importo non valido.' });
    await registraVendita({ prodotto:req.body.prodotto, etich:q.etich, prezzo:q.prezzo, cliente:leggiCliente(req.body.cliente), metodo:'Carta (Stripe)', payRef:d.id, documenti:req.body.documenti, accettazioni:req.body.accettazioni });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PayPal ───────────────────────────────────────────────────────────────────
shopRouter.post('/checkout/paypal/create-order', async (req, res) => {
  if (!process.env.PAYPAL_CLIENT_ID) return res.status(503).json({ error: 'Pagamenti non configurati.' });
  const q = calcPrezzo(req.body?.prodotto, req.body?.params);
  if (!q) return res.status(400).json({ error: 'Prodotto non quotabile.' });
  try {
    const token = await ppToken();
    const r = await fetch(ppBase() + '/v2/checkout/orders', { method:'POST', headers:{ Authorization:'Bearer '+token, 'Content-Type':'application/json' },
      body: JSON.stringify({ intent:'CAPTURE', purchase_units:[{ amount:{ currency_code:'EUR', value:q.prezzo.toFixed(2) }, description:q.etich.slice(0,127) }] }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.message || 'PayPal');
    res.json({ id: d.id, prezzo: q.prezzo, etich: q.etich });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
shopRouter.post('/checkout/paypal/capture', async (req, res) => {
  const q = calcPrezzo(req.body?.prodotto, req.body?.params);
  if (!q) return res.status(400).json({ error: 'Prodotto non valido.' });
  const orderId = String(req.body?.orderId || '');
  try {
    const token = await ppToken();
    const r = await fetch(ppBase() + '/v2/checkout/orders/' + encodeURIComponent(orderId) + '/capture', { method:'POST', headers:{ Authorization:'Bearer '+token, 'Content-Type':'application/json' } });
    const d = await r.json(); if (!r.ok) throw new Error(d.message || 'PayPal');
    if (d.status !== 'COMPLETED') return res.status(400).json({ error: 'Pagamento non completato.' });
    const cap = d.purchase_units?.[0]?.payments?.captures?.[0];
    if (cap && Number(cap.amount?.value) !== Number(q.prezzo.toFixed(2))) return res.status(400).json({ error: 'Importo non valido.' });
    await registraVendita({ prodotto:req.body.prodotto, etich:q.etich, prezzo:q.prezzo, cliente:leggiCliente(req.body.cliente), metodo:'PayPal', payRef:cap?.id || d.id, documenti:req.body.documenti, accettazioni:req.body.accettazioni });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
