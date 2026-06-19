// ── Pagamenti online: PayPal (Orders API v2) ───────────────────────────────────
// Config via env: PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_ENV ('sandbox' | 'live').
// Il Secret resta solo qui sul server; il Client ID è pubblico (serve all'SDK nel browser).
import { Router } from 'express';

function ppBase() {
  return (process.env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}
function ppConfigured() { return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET); }

async function ppToken() {
  const auth = Buffer.from(process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_SECRET).toString('base64');
  const r = await fetch(ppBase() + '/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('PayPal auth: ' + (d.error_description || d.error || ('HTTP ' + r.status)));
  return d.access_token;
}

// ── Router pubblico: /pay/config (chiavi pubbliche per caricare gli SDK) ─────────
export const publicPay = Router();
publicPay.get('/config', (req, res) => {
  res.json({
    paypalClientId: process.env.PAYPAL_CLIENT_ID || null,
    paypalEnv: (process.env.PAYPAL_ENV || 'sandbox'),
    paypalReady: ppConfigured(),
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    stripeReady: stripeConfigured(),
  });
});

function stripeConfigured() { return !!process.env.STRIPE_SECRET_KEY; }

// ── Router protetto (richiede login Supabase) ───────────────────────────────────
export const securePay = Router();

// Crea un ordine PayPal e restituisce l'id (il browser lo userà per il pagamento)
securePay.post('/paypal/create-order', async (req, res) => {
  if (!ppConfigured()) return res.status(503).json({ error: 'PayPal non configurato sul server.' });
  const amount = Math.round((parseFloat(req.body?.amount) || 0) * 100) / 100;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Importo non valido.' });
  const reference = String(req.body?.reference || '').slice(0, 120);
  try {
    const token = await ppToken();
    const r = await fetch(ppBase() + '/v2/checkout/orders', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'EUR', value: amount.toFixed(2) },
          description: ('Premio polizza ' + reference).slice(0, 127),
          custom_id: reference || undefined,
        }],
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || ('HTTP ' + r.status));
    res.json({ id: d.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Cattura (incassa) l'ordine dopo l'approvazione dell'utente
securePay.post('/paypal/capture', async (req, res) => {
  if (!ppConfigured()) return res.status(503).json({ error: 'PayPal non configurato sul server.' });
  const orderId = String(req.body?.orderId || '').trim();
  if (!orderId) return res.status(400).json({ error: 'orderId mancante.' });
  try {
    const token = await ppToken();
    const r = await fetch(ppBase() + '/v2/checkout/orders/' + encodeURIComponent(orderId) + '/capture', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || ('HTTP ' + r.status));
    const cap = d.purchase_units?.[0]?.payments?.captures?.[0];
    res.json({ status: d.status, id: cap?.id || d.id, payer: d.payer?.email_address || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Stripe (carta di credito) ───────────────────────────────────────────────────
const STRIPE_BASE = 'https://api.stripe.com/v1';
function stripeHeaders() {
  return { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' };
}
// Crea un PaymentIntent e restituisce il client_secret (usato dal browser per pagare)
securePay.post('/stripe/create-intent', async (req, res) => {
  if (!stripeConfigured()) return res.status(503).json({ error: 'Stripe non configurato sul server.' });
  const amount = Math.round((parseFloat(req.body?.amount) || 0) * 100); // in centesimi
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Importo non valido.' });
  const reference = String(req.body?.reference || '').slice(0, 200);
  try {
    const body = new URLSearchParams();
    body.set('amount', String(amount));
    body.set('currency', 'eur');
    body.set('automatic_payment_methods[enabled]', 'true');
    if (reference) { body.set('description', ('Premio polizza ' + reference).slice(0, 300)); body.set('metadata[reference]', reference); }
    const r = await fetch(STRIPE_BASE + '/payment_intents', { method: 'POST', headers: stripeHeaders(), body: body.toString() });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error?.message || ('HTTP ' + r.status));
    res.json({ clientSecret: d.client_secret, id: d.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Verifica lo stato di un pagamento Stripe (sicurezza: non fidarsi solo del browser)
securePay.post('/stripe/verify', async (req, res) => {
  if (!stripeConfigured()) return res.status(503).json({ error: 'Stripe non configurato sul server.' });
  const id = String(req.body?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id mancante.' });
  try {
    const r = await fetch(STRIPE_BASE + '/payment_intents/' + encodeURIComponent(id), { headers: stripeHeaders() });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error?.message || ('HTTP ' + r.status));
    res.json({ status: d.status, id: d.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
