// ═══════════════════════════════════════════════════════════════════════════════
//  IL RINNOVO SI PAGA SOLO DOPO IL NOSTRO OK
//
//  PERCHE' ESISTE
//    «Il pagamento per i rinnovi dei prodotti che già ha con noi in scadenza,
//     link attivo solo dopo nostro ok, perché ad esempio la polizza quell'anno è
//     200 e l'anno prossimo diventa 201€ o 199€» — Francesco, 02/09/2026.
//
//    E' una frase su un pulsante, ma e' una regola sui soldi: un link acceso
//    prima che l'abbiamo guardato e' un cliente che paga la cifra dell'anno
//    scorso. Quindi il rinnovo spento non arriva nemmeno alla pagina — non
//    «arriva spento», proprio non arriva: quello che non parte non si puo'
//    mostrare per sbaglio, nemmeno con un errore di programmazione la' dentro.
//
//    E le coordinate del bonifico sono un dato dell'agenzia: si allegano solo a
//    chi quel bonifico lo deve fare davvero.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const mod = await import('./convenzionati.js').catch(() => ({}));
const cosaVedeDelRinnovo = mod.cosaVedeDelRinnovo || (() => { throw new Error('cosaVedeDelRinnovo non esiste ancora'); });

const QUI = path.dirname(fileURLToPath(import.meta.url));
// Si guarda il codice, non i commenti: il commento qui sopra racconta la regola.
const senzaCommenti = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
const src = senzaCommenti(fs.readFileSync(path.join(QUI, 'convenzionati.js'), 'utf8'));
const rotta = src.slice(src.indexOf("convenzionatiRouter_pubblicoAssociati.post('/mie-polizze'"));

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

const IBAN = { intestatario: 'With Us Soc. Coop.', iban: 'IT00X0000000000000000000000', banca: 'Banca di prova' };
const ACCESO = { attivo: true, premio: 201, scadenza: '2026-12-31', link_pagamento: 'https://pagamenti.esempio/abc', bonifico: false };

prova('un rinnovo spento non arriva proprio', () => {
  for (const r of [{ ...ACCESO, attivo: false }, { ...ACCESO, attivo: null }, { ...ACCESO, attivo: undefined }, null, undefined]) {
    deve(cosaVedeDelRinnovo(r, IBAN) === null, 'consegna qualcosa per un rinnovo che non abbiamo acceso: ' + JSON.stringify(r));
  }
  return 'niente da nascondere, perche\' non c\'e\' niente';
});

prova('«attivo» deve essere vero, non solo somigliargli', () => {
  /* In JavaScript la stringa «false» e' vera. Se un giorno quel campo arrivasse
     come testo — da un modulo, da un CSV, da un'importazione — un controllo
     distratto accenderebbe il pagamento. */
  for (const v of ['false', 'true', 1, 'si', {}]) {
    deve(cosaVedeDelRinnovo({ ...ACCESO, attivo: v }, IBAN) === null, 'accende il pagamento con attivo=' + JSON.stringify(v));
  }
  return 'solo il vero vero accende il pagamento';
});

prova('acceso, si consegna il link e l\'importo', () => {
  const v = cosaVedeDelRinnovo(ACCESO, IBAN);
  deve(v && v.link === 'https://pagamenti.esempio/abc', 'non consegna il link');
  deve(v.premio === 201, 'non consegna l\'importo: e\' quello che cambia ogni anno');
  return 'l\'importo di quest\'anno, con la sua strada per pagarlo';
});

prova('le coordinate solo a chi deve fare il bonifico', () => {
  const conLink = cosaVedeDelRinnovo(ACCESO, IBAN);
  deve(conLink.bonifico === null, 'allega l\'IBAN anche a chi paga col link');
  const conBonifico = cosaVedeDelRinnovo({ ...ACCESO, bonifico: true }, IBAN);
  deve(conBonifico.bonifico && conBonifico.bonifico.iban === IBAN.iban, 'chi deve fare il bonifico non riceve le coordinate');
  const senzaCoord = cosaVedeDelRinnovo({ ...ACCESO, bonifico: true }, null);
  deve(senzaCoord.bonifico === null, 'promette un bonifico senza dire dove');
  return 'un dato dell\'agenzia non gira piu\' del necessario';
});

prova('non si consegna la riga cosi\' com\'e\'', () => {
  /* Dentro ci sono chi l'ha acceso e quando, e le note nostre: cose che non
     riguardano chi paga. Si consegna un elenco deciso, non tutto il resto. */
  const v = cosaVedeDelRinnovo({ ...ACCESO, acceso_da: 'x', acceso_il: 'y', creato_da: 'z', id: 'w', polizza_id: 'q' }, IBAN);
  for (const k of ['acceso_da', 'acceso_il', 'creato_da', 'id', 'polizza_id', 'attivo', 'link_pagamento']) {
    deve(!(k in v), 'lascia passare «' + k + '»');
  }
  return 'cinque campi decisi, e basta';
});

prova('l\'associato non legge la tabella dei rinnovi: gliela consegna il server', () => {
  deve(/cosaVedeDelRinnovo\(/.test(rotta), 'la rotta non passa dalla funzione che decide cosa si vede');
  deve(!/return res\.json\(\{\s*polizze:\s*polizze\s*\}\)/.test(rotta), 'rimanda le polizze cosi\' come stanno nel database');
  return 'una funzione sola decide, e la rotta ci passa';
});

prova('senza anagrafica non e\' un errore, e' + ' non ci sono polizze', () => {
  // Chi non ha ancora completato i dati non e' ancora un cliente dell'agenzia.
  deve(/!assoc\.anagrafica_id/.test(rotta), 'cerca le polizze di un cliente che non esiste ancora');
  deve(/polizze: \[\]/.test(rotta), 'risponde con un errore invece che con un elenco vuoto');
  return 'un elenco vuoto, non una schermata rossa';
});

prova('le coordinate si chiedono solo se servono a qualcuno', () => {
  deve(/serveIban/.test(rotta), 'legge le coordinate dell\'agenzia a ogni apertura dell\'area');
  deve(/r\.attivo && r\.bonifico/.test(rotta), 'le chiede anche quando nessun rinnovo le usa');
  return 'un dato dell\'agenzia si tira fuori quando serve';
});

prova('l\'IBAN dell\'agenzia sta in un posto solo', () => {
  /* Le coordinate ci sono gia': stanno nelle impostazioni (chiave «bonifico»),
     si cambiano dal pannello alla voce «Metodi di pagamento», e le legge gia'
     il negozio. Copiarle qui vorrebbe dire che il giorno in cui cambiano
     restano sbagliate in uno dei due posti — e quel giorno il bonifico va a un
     conto che non e' piu' nostro. */
  deve(/getBonificoCfg/.test(src), 'non riusa le coordinate gia\' esistenti');
  deve(!/IT[0-9]{2}[A-Z0-9]{10,}/.test(src), 'c\'e\' un IBAN scritto dentro questo file');
  const shop = senzaCommenti(fs.readFileSync(path.join(QUI, 'shop.js'), 'utf8'));
  deve(/export async function getBonificoCfg/.test(shop), 'la funzione che le legge non e\' condivisa');
  return 'una sola fonte, quella che il pannello sa gia\' cambiare';
});

const ko = esiti.filter(e => !e[0]);
console.log('\n── Il rinnovo si paga dopo il nostro ok ─────────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
