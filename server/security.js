// ═══════════════════════════════════════════════════════════════════════════════
//  server/security.js — Hardening runtime a DIPENDENZE ZERO per withus-backend.
//  Fornisce: rate limiting in-memory, lockout tentativi OTP, guardia di
//  concorrenza per i job del comparatore moto, security headers, validazione
//  segreti forti.
//
//  NOTA SCALING: gli store sono in-memory → pensati per una singola istanza
//  (Render). Se in futuro si scala a più istanze, sostituire lo store con Redis
//  (es. Upstash) mantenendo la stessa interfaccia.
// ═══════════════════════════════════════════════════════════════════════════════

const now = () => Date.now();

// ── IP client affidabile dietro proxy (Render/Vercel) ────────────────────────
export function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

// ── Store in-memory con pulizia periodica (evita memory leak) ────────────────
function createStore() {
  const map = new Map();
  const timer = setInterval(() => {
    const t = now();
    for (const [k, v] of map) if (v.resetAt && v.resetAt <= t && !(v.blockedUntil && v.blockedUntil > t)) map.delete(k);
  }, 5 * 60 * 1000);
  if (timer && timer.unref) timer.unref();
  return map;
}

// ── Rate limiter generico ────────────────────────────────────────────────────
export function rateLimit({ windowMs = 60_000, max = 240, keyGenerator, message } = {}) {
  const hits = createStore();
  const keyOf = keyGenerator || ((req) => clientIp(req) + '|' + (req.baseUrl || req.path || ''));
  return function rateLimitMw(req, res, next) {
    const key = keyOf(req);
    const t = now();
    let e = hits.get(key);
    if (!e || e.resetAt <= t) { e = { count: 0, resetAt: t + windowMs }; hits.set(key, e); }
    e.count++;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - e.count)));
    if (e.count > max) {
      const retry = Math.ceil((e.resetAt - t) / 1000);
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: message || 'Troppe richieste. Riprova tra qualche istante.', retryAfter: retry });
    }
    next();
  };
}

// ── Lockout OTP ──────────────────────────────────────────────────────────────
// Traccia i tentativi FALLITI di verifica OTP per una chiave (contatto/sessione
// di firma) e blocca temporaneamente dopo troppi errori, per fermare il brute
// force del codice a 6 cifre. Uso previsto in sign.js:
//   const lock = createOtpLockout();
//   if (lock.isBlocked(key)) -> 429
//   ...verifica... se sbagliato: lock.fail(key); se giusto: lock.reset(key);
export function createOtpLockout({ maxAttempts = 5, blockMs = 15 * 60_000 } = {}) {
  const store = createStore();
  return {
    isBlocked(key) {
      const e = store.get(key);
      return !!(e && e.blockedUntil && e.blockedUntil > now());
    },
    retryAfter(key) {
      const e = store.get(key);
      return (e && e.blockedUntil && e.blockedUntil > now()) ? Math.ceil((e.blockedUntil - now()) / 1000) : 0;
    },
    // registra un tentativo fallito; ritorna true se ORA è in lockout
    fail(key) {
      const t = now();
      let e = store.get(key);
      if (!e || e.resetAt <= t) e = { count: 0, resetAt: t + blockMs, blockedUntil: 0 };
      e.count++;
      if (e.count >= maxAttempts) e.blockedUntil = t + blockMs;
      store.set(key, e);
      return !!(e.blockedUntil && e.blockedUntil > t);
    },
    reset(key) { store.delete(key); },
  };
}

// Middleware pronto: blocca la richiesta se la chiave OTP è in lockout.
// keyGenerator estrae la chiave (es. contatto normalizzato) dalla req.
export function otpLockoutGuard(lockout, keyGenerator) {
  return function otpLockoutMw(req, res, next) {
    const key = keyGenerator(req);
    if (key && lockout.isBlocked(key)) {
      const retry = lockout.retryAfter(key);
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: 'Troppi tentativi. Riprova più tardi.', retryAfter: retry });
    }
    req.otpKey = key;
    req.otpLockout = lockout;
    next();
  };
}

// ── Guardia job moto ─────────────────────────────────────────────────────────
// Il comparatore moto avvia job di scraping costosi. Limita i job concorrenti
// totali e per-utente per evitare saturazione del backend e dei portali.
export function createMotoJobGuard({ maxConcurrent = 3, maxPerUser = 1 } = {}) {
  let active = 0;
  const perUser = new Map();
  return function motoJobGuard(req, res, next) {
    // solo le richieste che avviano un job (POST); le GET di stato passano
    if (req.method === 'GET') return next();
    const uid = (req.user && req.user.id) || clientIp(req);
    const uCount = perUser.get(uid) || 0;
    if (active >= maxConcurrent) {
      res.setHeader('Retry-After', '10');
      return res.status(429).json({ error: 'Sistema occupato: troppe quotazioni moto in corso. Riprova tra poco.' });
    }
    if (uCount >= maxPerUser) {
      res.setHeader('Retry-After', '5');
      return res.status(429).json({ error: 'Hai già una quotazione moto in corso. Attendi il completamento.' });
    }
    active++; perUser.set(uid, uCount + 1);
    let released = false;
    const release = () => {
      if (released) return; released = true;
      active = Math.max(0, active - 1);
      const c = (perUser.get(uid) || 1) - 1;
      if (c <= 0) perUser.delete(uid); else perUser.set(uid, c);
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };
}

// ── Security headers (mini-helmet, zero dipendenze) ──────────────────────────
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  res.removeHeader('X-Powered-By');
  next();
}

// ── Validazione segreti forti ────────────────────────────────────────────────
export function assertStrongSecret(name, value, min = 32) {
  if (!value || String(value).length < min) {
    throw new Error(`Config di sicurezza: ${name} deve essere impostato e lungo almeno ${min} caratteri.`);
  }
  return String(value);
}
