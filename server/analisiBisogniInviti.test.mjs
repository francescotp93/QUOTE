// ═══════════════════════════════════════════════════════════════════════════════
//  PROVE — gli inviti dell'Analisi dei bisogni
//
//  Qui si sorveglia una cosa sola, ed e' la porta di casa: un link pubblico che
//  apre la situazione familiare e patrimoniale di un cliente.
//
//  Le tre che contano davvero:
//   - nel database non deve MAI finire il codice in chiaro;
//   - «non esiste» e «revocato» devono rispondere allo stesso modo, altrimenti
//     provando codici a caso si scopre quali clienti hanno un'analisi aperta;
//   - dopo la firma il link si chiude, o si potrebbero cambiare le risposte
//     sotto a una firma gia' data.
// ═══════════════════════════════════════════════════════════════════════════════
import {
  generaToken, hashToken, tokenCorrisponde, calcolaScadenza,
  invitoUtilizzabile, perchePorteChiuse, mascheraRecapito,
  troppiTentativi, TENTATIVI_MASSIMI, SCADENZE_AMMESSE,
} from './analisiBisogniInviti.js';

const esiti = [];
const prova = (nome, fn) => {
  try { fn(); esiti.push([true, nome, '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

const ora = new Date('2026-08-05T10:00:00Z');
const invito = (extra) => Object.assign({
  scade_il: new Date('2026-08-08T10:00:00Z').toISOString(),
  revocato_il: null, completato_il: null, tentativi_falliti: 0,
}, extra || {});

// ── Il codice ──────────────────────────────────────────────────────────────
prova('il codice è lungo e non si ripete', () => {
  const visti = new Set();
  for (let i = 0; i < 500; i++) {
    const t = generaToken();
    deve(t.length >= 40, 'token troppo corto: ' + t.length);
    deve(!/[^A-Za-z0-9_-]/.test(t), 'il token ha caratteri da codificare in un URL: ' + t);
    deve(!visti.has(t), 'due token uguali su 500: la sorgente casuale non è casuale');
    visti.add(t);
  }
});

prova('un codice corto viene rifiutato invece che accorciato in silenzio', () => {
  let alzato = false;
  try { generaToken(8); } catch { alzato = true; }
  deve(alzato, 'accetta 8 byte: 64 bit si possono provare tutti');
});

prova('l\'impronta è a senso unico e non contiene il codice', () => {
  const t = generaToken();
  const h = hashToken(t);
  deve(/^[a-f0-9]{64}$/.test(h), 'l\'impronta non è uno sha256 esadecimale');
  deve(!h.includes(t.slice(0, 8)), 'un pezzo del codice si legge dentro la sua impronta');
  deve(hashToken(t) === h, 'la stessa impronta cambia fra due calcoli: non si potrebbe più ritrovare l\'invito');
});

prova('il confronto accetta solo il codice giusto', () => {
  const t = generaToken(), h = hashToken(t);
  deve(tokenCorrisponde(t, h), 'il codice giusto viene rifiutato');
  deve(!tokenCorrisponde(generaToken(), h), 'un codice diverso viene accettato');
  deve(!tokenCorrisponde(t, 'non-una-impronta'), 'accetta un\'impronta malformata');
  deve(!tokenCorrisponde('', h), 'accetta un codice vuoto');
  deve(!tokenCorrisponde(null, h), 'va in errore invece di rifiutare');
  /* Un'impronta della lunghezza giusta ma di un altro codice: e' il caso in
     cui timingSafeEqual va davvero chiamato, e non deve esplodere. */
  deve(!tokenCorrisponde(t, 'a'.repeat(64)), 'accetta un\'impronta della lunghezza giusta ma sbagliata');
});

// ── La scadenza ────────────────────────────────────────────────────────────
prova('la scadenza si calcola in ore e ha dei limiti', () => {
  deve(calcolaScadenza(72, ora).toISOString() === '2026-08-08T10:00:00.000Z', 'tre giorni non fanno tre giorni');
  for (const cattiva of [0, -5, NaN, 24 * 31, 'tre']) {
    let alzato = false;
    try { calcolaScadenza(cattiva, ora); } catch { alzato = true; }
    deve(alzato, 'accetta una scadenza fuori misura: ' + cattiva);
  }
  for (const buona of SCADENZE_AMMESSE) calcolaScadenza(buona, ora);
});

// ── Quando il link serve, e quando no ──────────────────────────────────────
prova('un invito vivo si può usare', () => {
  deve(invitoUtilizzabile(invito(), ora), 'un invito valido viene rifiutato');
});

prova('scaduto, revocato o completato non si usa', () => {
  deve(!invitoUtilizzabile(invito({ scade_il: '2026-08-04T10:00:00Z' }), ora), 'un invito scaduto è ancora buono');
  deve(!invitoUtilizzabile(invito({ revocato_il: '2026-08-05T09:00:00Z' }), ora), 'un invito revocato è ancora buono');
  deve(!invitoUtilizzabile(invito({ completato_il: '2026-08-05T09:00:00Z' }), ora),
    'dopo il completamento il link resta aperto: si potrebbero cambiare le risposte sotto a una firma già data');
  deve(!invitoUtilizzabile(null, ora), 'un invito inesistente viene accettato');
  deve(!invitoUtilizzabile(invito({ scade_il: 'domani' }), ora), 'una data illeggibile passa per valida');
});

// ── Che cosa si dice a chi bussa ───────────────────────────────────────────
prova('non si rivela se un link è mai esistito', () => {
  /* Se «non esiste» e «revocato» rispondessero in modo diverso, provando
     codici si scoprirebbe quali sono esistiti — e quindi quali clienti hanno
     un'analisi in corso. */
  const inesistente = perchePorteChiuse(null, ora);
  const revocato = perchePorteChiuse(invito({ revocato_il: '2026-08-05T09:00:00Z' }), ora);
  deve(inesistente === revocato, 'un link inesistente e uno revocato rispondono in modo diverso');
  deve(!/revoc/i.test(inesistente), 'il messaggio dice che il link è stato revocato');
});

prova('i messaggi dicono che cosa fare, e sono in italiano', () => {
  const casi = [null, invito({ scade_il: '2026-08-04T10:00:00Z' }), invito({ completato_il: '2026-08-05T09:00:00Z' })];
  for (const c of casi) {
    const m = perchePorteChiuse(c, ora);
    deve(m && m.length > 20, 'messaggio assente o troppo scarno');
    deve(/consulente/i.test(m), 'il messaggio non dice a chi rivolgersi: ' + m);
    deve(!/token|hash|error|null|undefined/i.test(m), 'il messaggio parla di cose interne: ' + m);
  }
  deve(perchePorteChiuse(invito(), ora) === null, 'un invito valido riceve comunque un messaggio di errore');
});

// ── Il recapito nei registri ───────────────────────────────────────────────
prova('il recapito non si scrive mai per intero', () => {
  const m = mascheraRecapito('francesco.oddo199307@gmail.com');
  deve(m === 'f***@gmail.com', 'email mascherata male: ' + m);
  deve(!m.includes('oddo'), 'il nome si legge ancora');
  const t = mascheraRecapito('+39 333 123 4567');
  deve(t === '*** 4567', 'telefono mascherato male: ' + t);
  deve(!t.includes('333'), 'il prefisso si legge ancora');
  deve(mascheraRecapito('') === '', 'un recapito vuoto diventa qualcosa');
  deve(mascheraRecapito(null) === '', 'un recapito assente va in errore');
  deve(mascheraRecapito('12') === '***', 'un recapito corto si legge per intero');
});

// ── I tentativi ────────────────────────────────────────────────────────────
prova('dopo troppi tentativi il link si chiude', () => {
  deve(!troppiTentativi(invito({ tentativi_falliti: TENTATIVI_MASSIMI - 1 })), 'chiude un tentativo troppo presto');
  deve(troppiTentativi(invito({ tentativi_falliti: TENTATIVI_MASSIMI })), 'non chiude mai: si possono provare codici a raffica');
  deve(!troppiTentativi(null), 'va in errore su un invito assente');
  /* Dieci e non tre: chi sbaglia e' quasi sempre il cliente che ricopia male
     un codice, non un attaccante. Chiudere al terzo errore farebbe telefonare
     in agenzia le persone sbagliate. */
  deve(TENTATIVI_MASSIMI >= 5 && TENTATIVI_MASSIMI <= 20, 'la soglia dei tentativi è fuori misura: ' + TENTATIVI_MASSIMI);
});

let ko = 0;
console.log('\nANALISI DEI BISOGNI — inviti');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nINVITI: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
