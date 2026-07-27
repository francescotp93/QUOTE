/**
 * Estrazione OTP dalle email dei portali compagnia.
 * Molte fonti (Groupama/AXA/Prima/...) mandano il codice di verifica via EMAIL.
 * Poiché le caselle sono già gestite in IMAP dal backend (server/mail.js), possiamo
 * LEGGERE la mail e tirar fuori il codice da soli, senza che l'operatore lo copi.
 * Qui la parte PURA (testabile): dato il testo della mail → il codice.
 * ESM, nessuna dipendenza.
 */

const DEFAULT_KEYWORDS = ['codice di verifica', 'codice di sicurezza', 'codice otp', 'verification code', 'security code', 'one-time', 'codice', 'code', 'otp', 'pin', 'password temporanea'];

/**
 * Estrae il codice OTP da un testo (corpo mail o oggetto).
 * Strategia: prima un numero di `length` cifre vicino a una parola-chiave; poi il primo
 * numero isolato di `length` cifre. Evita di catturare numeri più lunghi (importi, id).
 * @returns string | null
 */
export function extractOtp(text, opts = {}) {
  if (!text) return null;
  const { length = 6, keywords = DEFAULT_KEYWORDS } = opts;
  const t = String(text).replace(/ /g, ' ');
  const n = `(?<![0-9])\\d{${length}}(?![0-9])`; // numero di ESATTAMENTE `length` cifre

  // 1) numero vicino a una parola-chiave (entro ~40 caratteri)
  const kw = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const near = new RegExp(`(?:${kw})[\\s\\S]{0,40}?(${n})`, 'i').exec(t);
  if (near) return near[1];

  // 2) primo numero isolato della lunghezza giusta
  const any = new RegExp(n).exec(t);
  return any ? any[0] : null;
}

/**
 * Sceglie, tra più email candidate, quella più recente e pertinente per una fonte.
 * @param messaggi [{ from, subject, text, date }] (date = ms o ISO)
 * @param cfg { mittente?:regex-string, oggetto?:regex-string }
 * @returns il messaggio scelto | null
 */
export function scegliMailOtp(messaggi, cfg = {}) {
  const fromRe = cfg.mittente ? new RegExp(cfg.mittente, 'i') : null;
  const subjRe = cfg.oggetto ? new RegExp(cfg.oggetto, 'i') : null;
  const cand = (messaggi || []).filter((m) =>
    (!fromRe || fromRe.test(m.from || '')) && (!subjRe || subjRe.test(m.subject || '')));
  cand.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return cand[0] || null;
}
