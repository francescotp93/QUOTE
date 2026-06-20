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

async function registraVendita({ prodotto, etich, prezzo, cliente, metodo, payRef }) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dati = { stato:'pagato', lead:true, public:true, fonte:'shop online',
    contatto:{ nome:cliente.nome, cognome:cliente.cognome, cf:cliente.cf, email:cliente.email, telefono:cliente.telefono },
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

export const shopRouter = Router();

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
    await registraVendita({ prodotto:req.body.prodotto, etich:q.etich, prezzo:q.prezzo, cliente:leggiCliente(req.body.cliente), metodo:'Carta (Stripe)', payRef:d.id });
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
    await registraVendita({ prodotto:req.body.prodotto, etich:q.etich, prezzo:q.prezzo, cliente:leggiCliente(req.body.cliente), metodo:'PayPal', payRef:cap?.id || d.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
