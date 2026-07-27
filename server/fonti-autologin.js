/**
 * Auto-login Fonti — risolve il "codice" del secondo fattore in automatico,
 * così l'accesso alla compagnia si rinnova da solo (niente telefono/copia-incolla).
 *
 * Tipi di 2FA gestiti (campo `tipo2fa` nella config della fonte):
 *   - 'totp'  → codice generato dal segreto (app authenticator)     → AUTOMATICO
 *   - 'email' → codice OTP letto dalla casella IMAP del portale       → AUTOMATICO
 *   - 'push'  → approvazione sul telefono (es. Allianz Duo)          → MANUALE (non simulabile)
 *   - 'sms'   → codice via SMS                                        → MANUALE (per ora)
 *
 * ESM. Le dipendenze "impure" (lettura mail) sono INIETTATE (deps.mailFetch) → testabile.
 */
import { totpCode } from './totp.js';
import { extractOtp, scegliMailOtp } from './otp-extract.js';

/**
 * Ritorna il codice 2FA da passare allo scraper, oppure null se il metodo è manuale.
 * @param cfg config fonte: { tipo2fa, totp, otp_mittente?, otp_oggetto?, otp_length? }
 * @param deps { mailFetch?: async (cfg) => [{from,subject,text,date}] }  (opzionale)
 */
export async function codiceAutomatico(cfg = {}, deps = {}) {
  const tipo = String(cfg.tipo2fa || (cfg.totp ? 'totp' : '')).toLowerCase();

  if (tipo === 'totp' || (!tipo && cfg.totp)) {
    if (!cfg.totp) throw new Error('Segreto TOTP mancante per questa fonte.');
    return { codice: totpCode(cfg.totp), metodo: 'totp' };
  }

  if (tipo === 'email' || tipo === 'emailotp') {
    if (typeof deps.mailFetch !== 'function') throw new Error('Lettura mail non disponibile.');
    const messaggi = await deps.mailFetch(cfg);
    const msg = scegliMailOtp(messaggi, { mittente: cfg.otp_mittente, oggetto: cfg.otp_oggetto });
    if (!msg) throw new Error('Nessuna mail OTP trovata per questa fonte.');
    const codice = extractOtp((msg.text || '') + ' ' + (msg.subject || ''), { length: cfg.otp_length || 6 });
    if (!codice) throw new Error('Codice OTP non riconosciuto nella mail.');
    return { codice, metodo: 'email', mailDate: msg.date };
  }

  return { codice: null, metodo: tipo || 'manuale' }; // push/sms/nessuno → manuale
}

/**
 * Fail-fast del giro premio: l'errore di una fonte indica "sessione scaduta / non loggato"?
 * In tal caso la fonte va scartata SUBITO (non attesa fino al timeout lungo).
 */
export function isAuthError(msg) {
  return /non\s*loggat|sessione\s*scadut|scadut|verifica\s*accesso|\bduo\b|rifai il login|autenticaz|non autorizzat|\b401\b|\b403\b/i.test(String(msg || ''));
}

/**
 * Dato l'esito di una fonte nel giro premio, decide se serve un re-login automatico.
 * Ritorna { skip, relogin }.
 */
export function valutaEsitoFonte(errore) {
  if (!errore) return { skip: false, relogin: false };
  const auth = isAuthError(errore);
  return { skip: auth, relogin: auth };
}
