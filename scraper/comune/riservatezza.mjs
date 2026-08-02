// ═══════════════════════════════════════════════════════════════════════════════
//  RISERVATEZZA — quello che non deve uscire dallo scraper
//
//  Perché esiste. Quando il portale di una compagnia cambia, per ritarare i
//  selettori serve una «fotografia» della pagina: quali campi ci sono, come si
//  chiamano, che testo mostrano. Quella fotografia la fa richDump(), e finisce
//  in tre posti: la risposta HTTP delle rotte di diagnostica, la risposta di
//  GET /fonti/:id/auto (che il backend gira al browser VERBATIM,
//  server/fonti.js:153 → res.json(d)), e i log.
//
//  Il problema è che richDump fotografa OGNI campo leggendo `innerText || value`
//  su un selettore che comprende `input` (allianz:206-209, italiana:214,
//  moto:215). Quindi ci finiscono dentro due cose che non devono uscire:
//
//   1. il valore dei campi password del portale della compagnia — le NOSTRE
//      credenziali di accesso, in chiaro, dentro una risposta HTTP;
//   2. i dati dei clienti che in quel momento stanno a schermo: nome, codice
//      fiscale, targa, data di nascita, IBAN. La fotografia prende anche 3.000
//      caratteri del testo della pagina.
//
//  La fotografia serve per i SELETTORI, non per i valori: tag, id, name e type
//  restano intatti e bastano a ritarare. Quello che si perde qui è solo il
//  contenuto, che per quello scopo non serve a niente.
//
//  Niente dipendenze e niente DOM: gira in Node dopo page.evaluate, e si prova
//  senza browser.
// ═══════════════════════════════════════════════════════════════════════════════

/** Il segno che si mette al posto di un valore riservato. */
export const COPERTO = '••••';

/* Un campo è un segreto se lo dice il suo tipo, oppure se lo dice il suo nome.
   Il nome conta perché molti portali usano type="text" per il codice OTP. */
const NOMI_SEGRETI = /(pass|pwd|psw|secret|segret|token|otp|passcode|codice[-_ ]?(duo|otp|sicurezza)|2fa|mfa|pin|cvv|iban)/i;

export function eSegreto(controllo) {
  if (!controllo) return false;
  const tipo = String(controllo.type || '').toLowerCase();
  if (tipo === 'password') return true;
  const nome = [controllo.name, controllo.id, controllo.placeholder].filter(Boolean).join(' ');
  return NOMI_SEGRETI.test(nome);
}

/** Qualunque cosa diventa il segno di coperto. La lunghezza non si rivela:
    sapere che una password è lunga 14 caratteri è già un'informazione. */
export function mascheraSegreto() {
  return COPERTO;
}

/** 'FL208KP' → 'FL***KP'. Restano le lettere, che servono a capire il formato. */
export function mascheraTarga(t) {
  const s = String(t == null ? '' : t);
  if (s.length < 5) return s;
  return s.slice(0, 2) + '*'.repeat(s.length - 4) + s.slice(-2);
}

/** '14/03/1978' → '**\/**\/1978'. L'anno resta: serve a capire se il campo è
    una data di nascita o una data di decorrenza, e da solo non identifica. */
export function mascheraNascita(d) {
  const s = String(d == null ? '' : d);
  return s.replace(/\b(\d{1,2})([\/\-.])(\d{1,2})\2(\d{4})\b/g, (_m, _g, sep, __, anno) =>
    '**' + sep + '**' + sep + anno);
}

/** 'RSSMRA80A01H501U' → 'RSS**********01U'. Resta la forma, non la persona. */
export function mascheraCodiceFiscale(c) {
  const s = String(c == null ? '' : c);
  return s.replace(/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z][0-9A-Z]{3}[A-Z]\b/gi,
    (m) => m.slice(0, 3) + '*'.repeat(10) + m.slice(-3));
}

const REGOLE_TESTO = [
  [/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z][0-9A-Z]{3}[A-Z]\b/gi, (m) => m.slice(0, 3) + '*'.repeat(10) + m.slice(-3)],
  [/\bIT\d{2}[0-9A-Z]{11,23}\b/gi, (m) => m.slice(0, 4) + '*'.repeat(m.length - 8) + m.slice(-4)],
  [/\b[A-Z]{2}\d{3}[A-Z]{2}\b/g, (m) => mascheraTarga(m)],
  [/\b\d{1,2}([\/\-.])\d{1,2}\1\d{4}\b/g, (m) => mascheraNascita(m)],
  [/\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g, (m) => m[0] + '***@' + m.split('@')[1]],
  [/(?<!\d)(?:\+39\s?)?3\d{2}[\s.-]?\d{6,7}(?!\d)/g, () => COPERTO],
];

/**
 * Passa un testo libero (il body della pagina) e toglie i dati che
 * identificano una persona, lasciando le etichette. Le etichette sono
 * l'unica cosa che serve a ritarare i selettori.
 */
export function ripulisciTesto(testo) {
  let s = String(testo == null ? '' : testo);
  for (const [re, sost] of REGOLE_TESTO) s = s.replace(re, sost);
  return s;
}

/**
 * Ripulisce l'elenco dei controlli fotografati.
 *  - se il campo è un segreto, il suo contenuto sparisce del tutto;
 *  - negli altri il contenuto viene ripulito dai dati personali.
 * Tag, id, name e type non si toccano mai: sono il motivo per cui la
 * fotografia esiste.
 */
export function ripulisciControlli(controlli) {
  if (!Array.isArray(controlli)) return controlli;
  return controlli.map((c) => {
    if (!c || typeof c !== 'object') return c;
    if (eSegreto(c)) return { ...c, text: COPERTO, riservato: true };
    return 'text' in c ? { ...c, text: ripulisciTesto(c.text) } : c;
  });
}

/**
 * Ripulisce una fotografia intera prima che esca dallo scraper.
 * Aggiunge `ripulito: true`, così chi la riceve sa che è già passata di qui —
 * e chi legge una fotografia SENZA quel segno sa che è cruda.
 */
export function ripulisciDump(dump) {
  if (!dump || typeof dump !== 'object') return dump;
  const fuori = { ...dump, ripulito: true };
  if ('text' in fuori) fuori.text = ripulisciTesto(fuori.text);
  if ('ctrls' in fuori) fuori.ctrls = ripulisciControlli(fuori.ctrls);
  if ('title' in fuori) fuori.title = ripulisciTesto(fuori.title);
  return fuori;
}

/**
 * Ripulitura profonda, per qualunque forma. Serve alle fotografie che non hanno
 * la forma { text, ctrls } — per esempio dumpPage() di allianz, che restituisce
 * un albero di frame con dentro etichette e un pezzo di testo della pagina.
 * Taglia largo di proposito: una fotografia meno leggibile costa molto meno di
 * un dato di cliente che gira.
 */
export function ripulisciQualsiasi(x) {
  if (x == null) return x;
  if (typeof x === 'string') return ripulisciTesto(x);
  if (Array.isArray(x)) return x.map(ripulisciQualsiasi);
  if (typeof x === 'object') {
    const fuori = {};
    for (const [k, v] of Object.entries(x)) {
      fuori[k] = NOMI_SEGRETI.test(k) ? COPERTO : ripulisciQualsiasi(v);
    }
    return fuori;
  }
  return x;
}

/**
 * Per i log. Un log non è un posto riservato: ci finisce dentro chiunque abbia
 * accesso alla macchina, e i log si spediscono per posta quando si chiede
 * assistenza. È la stessa ripulitura profonda, con un nome che dice dove va.
 */
export function perLog(x) {
  return ripulisciQualsiasi(x);
}
