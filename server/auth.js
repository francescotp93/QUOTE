// Middleware di autenticazione: verifica il token Supabase delle app IAM/QUOTO.
// Il frontend invia l'access_token nell'header Authorization: Bearer <token>.
import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'Server non configurato (manca SUPABASE_JWT_SECRET).' });

  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Accesso non autorizzato (token mancante).' });

  let payload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch (e) {
    // dettaglio temporaneo per diagnosi: "invalid signature" = secret errato,
    // "invalid algorithm" = il progetto usa chiavi asimmetriche, ecc.
    return res.status(401).json({ error: 'Token rifiutato: ' + e.message });
  }
  req.user = { id: payload.sub, email: (payload.email || '').toLowerCase() };

  // Restrizione opzionale: solo le email elencate possono usare la posta.
  const allowed = (process.env.MAIL_ALLOWED_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(req.user.email)) {
    return res.status(403).json({ error: 'Questo account non è abilitato alla posta.' });
  }
  next();
}
