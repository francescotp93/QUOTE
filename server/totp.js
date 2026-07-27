/**
 * TOTP (RFC 6238) — genera il codice a 6 cifre da un "segreto" di un'app authenticator.
 * Serve a rendere la schermata Fonti auto-sufficiente: dove il 2FA è un codice-app,
 * salviamo il segreto (cifrato) e il codice lo generiamo NOI, senza il telefono.
 * ESM, nessuna dipendenza (solo node:crypto).
 */
import crypto from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Decodifica un segreto Base32 (formato tipico dei QR authenticator). */
export function base32Decode(s) {
  const clean = String(s || '').toUpperCase().replace(/=+$/,'').replace(/[^A-Z2-7]/g, '');
  let bits = 0, val = 0; const out = [];
  for (const c of clean) {
    const idx = B32.indexOf(c);
    if (idx < 0) continue;
    val = (val << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

/** True se la stringa è un segreto Base32 valido (solo A-Z, 2-7, spazi/=). */
export function looksBase32(s) {
  return /^[A-Za-z2-7=\s]+$/.test(String(s || '')) && /[A-Za-z]/.test(String(s || ''));
}

/**
 * Codice TOTP corrente.
 * @param secret segreto (Base32 se sembra tale, altrimenti trattato come testo/UTF-8)
 * @param opts { digits=6, period=30, timestamp=now(ms), algo='sha1' }
 */
export function totpCode(secret, opts = {}) {
  const { digits = 6, period = 30, timestamp = Date.now(), algo = 'sha1' } = opts;
  const key = looksBase32(secret) ? base32Decode(secret) : Buffer.from(String(secret), 'utf8');
  let counter = Math.floor(Math.floor(timestamp / 1000) / period);
  const buf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) { buf[i] = counter & 0xff; counter = Math.floor(counter / 256); }
  const hmac = crypto.createHmac(algo, key).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[off] & 0x7f) << 24) | ((hmac[off + 1] & 0xff) << 16) | ((hmac[off + 2] & 0xff) << 8) | (hmac[off + 3] & 0xff);
  return (bin % (10 ** digits)).toString().padStart(digits, '0');
}

/** Secondi rimanenti prima che il codice cambi (utile per decidere se attendere). */
export function totpSecondsLeft(period = 30, timestamp = Date.now()) {
  return period - (Math.floor(timestamp / 1000) % period);
}
