// Middleware di autenticazione: verifica il token Supabase delle app IAM/QUOTO.
// Supporta sia le chiavi "nuove" asimmetriche (ES256/RS256, verificate via JWKS)
// sia il vecchio segreto HS256 (SUPABASE_JWT_SECRET).
import { jwtVerify, createRemoteJWKSet, decodeProtectedHeader } from 'jose';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
let _jwks;
function jwks() {
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(SUPABASE_URL + '/auth/v1/.well-known/jwks.json'));
  return _jwks;
}

export async function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Accesso non autorizzato (token mancante).' });

  let payload;
  try {
    const alg = decodeProtectedHeader(token).alg;
    if (alg === 'HS256') {
      const secret = process.env.SUPABASE_JWT_SECRET;
      if (!secret) throw new Error('SUPABASE_JWT_SECRET non configurato');
      ({ payload } = await jwtVerify(token, new TextEncoder().encode(secret)));
    } else {
      // chiavi asimmetriche: verifica con le chiavi pubbliche di Supabase (JWKS)
      ({ payload } = await jwtVerify(token, jwks()));
    }
  } catch (e) {
    return res.status(401).json({ error: 'Token rifiutato: ' + e.message });
  }
  req.user = { id: payload.sub, email: (payload.email || '').toLowerCase() };
  next();
}
