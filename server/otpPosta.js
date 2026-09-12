// ═══════════════════════════════════════════════════════════════════════════════
//  IL CODICE DI ACCESSO SE LO PRENDE DA SOLO — dalla posta dell'agenzia
//
//  «Vediamo di non farli sconnettere più» (Francesco, 12/09/2026).
//
//  Groupama manda il codice di accesso via EMAIL. Finora quel codice lo doveva
//  leggere una persona: apri la posta, copia sei cifre, incollale nel pannello
//  Fonti. Se nessuno lo fa entro pochi minuti la sessione resta fuori, e il
//  primo preventivo del mattino fallisce — è successo l'11 e il 12 settembre.
//  La posta dell'agenzia il backend la sa già leggere (server/mail.js, IMAP):
//  quel codice se lo può prendere da sé.
//
//  LE REGOLE, e non sono negoziabili:
//   · si guarda SOLO la finestra del login. Si leggono solo i messaggi arrivati
//     DOPO il momento in cui il login è partito, e solo per il tempo di
//     attesa: mai la posta di ieri, mai quella di un altro.
//   · si guarda SOLO il mittente della compagnia. Un'email di chiunque altro
//     non viene nemmeno aperta.
//   · il codice NON finisce nel giornale, mai. Nei log entra il fatto che è
//     stato trovato, l'ora del messaggio e il mittente — non le sei cifre, e
//     nemmeno il testo intorno.
//   · un codice già usato non si riusa: si tiene memoria degli identificativi
//     dei messaggi già letti, così una seconda chiamata non ripesca il vecchio
//     codice e non lo manda al portale, che lo rifiuterebbe.
//   · se qualcosa non c'è — nessuna casella configurata, nessuna email, IMAP
//     che non risponde — NON si rompe niente: si torna a chiedere il codice a
//     una persona, esattamente come prima.
// ═══════════════════════════════════════════════════════════════════════════════
import { simpleParser } from 'mailparser';
import { caselleDisponibili, conImap } from './mail.js';

/* Da chi arriva il codice, per compagnia. Si confronta il DOMINIO del mittente:
   il nome della casella cambia senza preavviso («noreply@», «no-reply@»,
   «servizi@»), il dominio no. */
export const MITTENTI_OTP = {
  groupama: /(^|[.@])groupama\.it$|(^|[.@])groupama\.com$/i,
};

/* Quanto vale un codice appena arrivato. Oltre questa età non si prende: un
   codice monouso vive poco, e mandarne uno vecchio al portale significa farselo
   rifiutare e bruciare un tentativo. */
const ETA_MASSIMA_MS = 10 * 60 * 1000;
/* Quanti messaggi recenti guardare in una casella. Il codice, se è arrivato, è
   fra gli ultimi: scorrere oltre vuol dire solo leggere posta che non ci
   riguarda. */
const QUANTI_MESSAGGI = 12;

/* Il codice dentro il testo. Sei cifre isolate, non un pezzo di un numero più
   lungo (un importo, un numero di pratica, un anno affiancato). Si prende la
   prima corrispondenza vicina a una parola che parla di codice, altrimenti la
   prima isolata: i portali scrivono «il tuo codice di verifica è 123456». */
const SEI_CIFRE = /(?<![0-9])([0-9]{6})(?![0-9])/g;
const PAROLE_CODICE = /codice|otp|verifica|accesso|one[\s-]?time|token|pin/i;

export function estraiCodice(testo) {
  const t = String(testo || '');
  if (!t) return null;
  /* Prima si cercano le sei cifre che stanno accanto alla parola giusta: in una
     email c'è quasi sempre anche un numero di telefono o una data, e prendere
     il primo numero che capita significa mandare al portale la cosa sbagliata. */
  /* La parola giusta si cerca soprattutto PRIMA del numero — «il tuo codice di
     verifica è 123456» — e solo pochissimo dopo. Guardare avanti a lungo fa
     prendere per un codice il numero della frase precedente: nella prova,
     «Importo 250000 euro. Nessun codice qui» faceva passare l'importo. */
  for (const m of t.matchAll(SEI_CIFRE)) {
    const prima = t.slice(Math.max(0, m.index - 60), m.index);
    const dopo = t.slice(m.index + 6, m.index + 6 + 12);
    if (PAROLE_CODICE.test(prima) || PAROLE_CODICE.test(dopo)) return m[1];
  }
  /* Nessuna parola giusta accanto: NON si tira a indovinare. Prima qui c'era un
     ripiego — «se in tutta l'email c'è una sola sequenza di sei cifre, sarà
     lei» — e su «polizza 445566 emessa» prendeva il numero di polizza. Mandare
     al portale un numero che non è il codice brucia un tentativo, e dopo tre
     tentativi falliti il freno chiude gli accessi: si rischia di far bloccare
     l'utenza dell'agenzia per un numero letto male. Meglio chiedere il codice a
     una persona. */
  return null;
}

/* I messaggi già usati, per non ripescare due volte lo stesso codice. Sta in
   memoria: al riavvio si riparte puliti, e il peggio che può succedere è
   rileggere un codice che nel frattempo è scaduto — cioè quello che succedeva
   sempre prima di questo modulo. */
const usati = new Set();
export function _dimenticaUsati() { usati.clear(); }   // solo per le prove

function mittenteDi(parsed) {
  const a = parsed && parsed.from && parsed.from.value && parsed.from.value[0];
  return String((a && a.address) || '').toLowerCase();
}
const dominioDi = (indirizzo) => String(indirizzo || '').split('@').pop();

/* Cerca in UNA casella. Ritorna { codice, quando, mittente } oppure null. */
async function cercaInCasella(casella, filtroMittente, dopo, deps) {
  const imap = (deps && deps.conImap) || conImap;
  return imap(casella, async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const totale = client.mailbox ? client.mailbox.exists : 0;
      if (!totale) return null;
      const da = Math.max(1, totale - QUANTI_MESSAGGI + 1);
      const trovati = [];
      for await (const m of client.fetch(`${da}:*`, { source: true, internalDate: true, envelope: true })) {
        trovati.push(m);
      }
      /* Dal più recente: il codice buono è l'ultimo arrivato. */
      for (const m of trovati.reverse()) {
        const chiave = casella + '#' + m.uid;
        if (usati.has(chiave)) continue;
        const quando = m.internalDate ? new Date(m.internalDate).getTime() : 0;
        if (dopo && quando && quando < dopo) continue;                 // arrivata prima del login: non è la nostra
        if (quando && Date.now() - quando > ETA_MASSIMA_MS) continue;  // troppo vecchia per essere valida
        const parsed = await simpleParser(m.source).catch(() => null);
        if (!parsed) continue;
        const mittente = mittenteDi(parsed);
        if (!filtroMittente.test(dominioDi(mittente)) && !filtroMittente.test(mittente)) continue;
        const codice = estraiCodice([parsed.subject, parsed.text].filter(Boolean).join('\n'));
        if (!codice) continue;
        usati.add(chiave);
        return { codice, quando, mittente, casella };
      }
      return null;
    } finally { lock.release(); }
  });
}

/* LA FUNZIONE CHE SERVE FUORI. Aspetta che il codice arrivi e lo restituisce.
   `dopo` è il momento in cui il login è partito: tutto ciò che è arrivato prima
   non c'entra. Non lancia mai: chi chiama, se torna null, continua a chiedere
   il codice a una persona come faceva prima. */
export async function attendiCodice({ fonte, dopo, attesaMs = 90000, passoMs = 6000, caselle, log, deps } = {}) {
  const scrivi = log || (() => {});
  const filtro = MITTENTI_OTP[String(fonte || '').toLowerCase()];
  if (!filtro) { scrivi('[otp-posta] ' + fonte + ': nessun mittente conosciuto, il codice resta da inserire a mano'); return null; }
  let elenco = caselle;
  if (!elenco) {
    try { elenco = ((deps && deps.caselleDisponibili) || caselleDisponibili)(); } catch (_) { elenco = []; }
  }
  if (!elenco.length) { scrivi('[otp-posta] nessuna casella di posta configurata: il codice resta da inserire a mano'); return null; }
  const fine = Date.now() + attesaMs;
  let giro = 0;
  for (;;) {
    giro++;
    for (const casella of elenco) {
      try {
        const t = await cercaInCasella(casella, filtro, dopo, deps);
        if (t) {
          /* Nel giornale il CODICE non entra: entra che è arrivato, da chi e
             quando. Chi cerca un guasto ha quello che gli serve; chi legge il
             giornale non si porta via un codice di accesso. */
          scrivi('[otp-posta] codice di ' + fonte + ' trovato nella posta (mittente ' + t.mittente + ', messaggio delle ' + new Date(t.quando).toLocaleTimeString('it-IT') + ')');
          return t;
        }
      } catch (e) {
        /* Una casella che non risponde non ferma le altre, e non ferma il
           login: al massimo il codice lo inserisce una persona. */
        scrivi('[otp-posta] casella non leggibile (' + String(e && e.message || e).slice(0, 120) + ')');
      }
    }
    if (Date.now() >= fine) {
      scrivi('[otp-posta] nessun codice di ' + fonte + ' nella posta dopo ' + Math.round(attesaMs / 1000) + 's e ' + giro + ' controlli: lo inserisca una persona');
      return null;
    }
    await new Promise(r => setTimeout(r, passoMs));
  }
}
