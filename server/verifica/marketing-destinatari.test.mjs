// ═══════════════════════════════════════════════════════════════════════════════
//  DESTINATARI DI UNA CAMPAGNA — le prove che contano
//
//  Perché questa prova esiste. Da quando una campagna può partire su un GRUPPO
//  o su un SEGMENTO, il numero dei destinatari non arriva più da Brevo: lo
//  calcola questo codice. Un errore qui non si vede — si vede dopo, quando la
//  mail è partita a chi non doveva riceverla, e allora è tardi.
//
//  Le tre cose sorvegliate sono le tre che fanno danno:
//    1. il CONSENSO: chi non ce l'ha non deve entrare in nessun elenco, mai;
//    2. l'ETÀ: è una data di nascita al contrario, e invertire i due estremi è
//       l'errore classico — «over 60» che diventa «under 60»;
//    3. il «NON ce l'ha» del cross-selling: dev'essere calcolato su TUTTE le
//       polizze del cliente, non su quelle già filtrate per compagnia o
//       scadenza, altrimenti si offre la casa a chi la casa ce l'ha già.
//
//  Supabase qui non c'è: `fetch` viene sostituito con un finto che risponde
//  con dati costruiti a mano. Il codice provato è quello vero, non una copia.
// ═══════════════════════════════════════════════════════════════════════════════
process.env.SUPABASE_ANON_KEY = 'per-la-prova';

const FINTO = {
  quote_anagrafiche: [
    { id: 'a1', nominativo: 'Rossi Mario', email: 'mario@x.it', consenso_marketing: true },
    { id: 'a2', nominativo: 'Rossi Anna', email: 'anna@x.it', consenso_marketing: false },
    { id: 'a3', nominativo: 'Verdi Luca', email: '', consenso_marketing: true },
    { id: 'a4', nominativo: 'Bianchi Spa', email: 'non-e-un-indirizzo', consenso_marketing: true },
    { id: 'a5', nominativo: 'Neri Sara', email: 'SARA@X.IT', consenso_marketing: true },
  ],
  quote_polizze: [
    { cliente_id: 'a1', prodotto: 'RC Auto', compagnia: 'HDI', data_scadenza: '2026-09-10' },
    { cliente_id: 'a5', prodotto: 'RC Auto', compagnia: 'HDI', data_scadenza: '2026-09-20' },
    { cliente_id: 'a5', prodotto: 'Casa sicura', compagnia: 'Allianz', data_scadenza: '2026-11-01' },
  ],
  quote_gruppi: [{ id: 'g1', nome: 'Famiglia Rossi', tipo: 'famiglia' }],
  quote_gruppi_membri: [{ gruppo_id: 'g1', anagrafica_id: 'a1' }, { gruppo_id: 'g1', anagrafica_id: 'a2' }],
};

const chiamate = [];
globalThis.fetch = async (url) => {
  const percorso = String(url).split('/rest/v1/')[1];
  chiamate.push(decodeURIComponent(percorso));
  const tabella = percorso.split('?')[0];
  let righe = FINTO[tabella] || [];
  /* Il finto rispetta solo il filtro `id=in.(...)`, che è quello da cui dipende
     la logica dei gruppi. Gli altri li fa il database vero. */
  const dentro = /[?&]id=in\.\(([^)]*)\)/.exec(percorso);
  if (dentro) { const ok = dentro[1].split(','); righe = righe.filter(r => ok.includes(r.id)); }
  return { ok: true, text: async () => JSON.stringify(righe) };
};

const { membriGruppo, membriSegmento } = await import('../marketingDestinatari.js');

const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, msg) => { if (!c) throw new Error(msg); };

prova('nel gruppo entra solo chi ha indirizzo E consenso', async () => {
  const g = await membriGruppo('tok', 'g1');
  const mail = g.contattabili.map(x => x.email);
  deve(mail.length === 1 && mail[0] === 'mario@x.it', 'contattabili sbagliati: ' + JSON.stringify(mail));
  deve(g.senzaConsenso.length === 1, 'Anna ha il consenso a false e deve risultare esclusa per consenso');
});

prova('un indirizzo scritto male non è un indirizzo', async () => {
  const s = await membriSegmento('tok', {});
  deve(!s.contattabili.some(x => x.nominativo === 'Bianchi Spa'), 'un testo senza @ è passato per email');
  deve(s.senzaEmail.some(x => x.nominativo === 'Bianchi Spa'), 'l\'indirizzo storto deve finire fra i «senza email»');
});

prova('le maiuscole non creano un contatto diverso su Brevo', async () => {
  const s = await membriSegmento('tok', {});
  deve(s.contattabili.some(x => x.email === 'sara@x.it'), 'SARA@X.IT doveva diventare minuscolo');
});

prova('«ha una polizza auto» prende chi ce l\'ha e nessun altro', async () => {
  const s = await membriSegmento('tok', { prodotto: 'auto' });
  const nomi = s.contattabili.map(x => x.nominativo).sort();
  deve(JSON.stringify(nomi) === JSON.stringify(['Neri Sara', 'Rossi Mario']), 'trovati: ' + nomi.join(', '));
});

prova('il cross-selling esclude chi il prodotto ce l\'ha già', async () => {
  const s = await membriSegmento('tok', { senza_prodotto: 'Casa' });
  const nomi = s.contattabili.map(x => x.nominativo);
  deve(!nomi.includes('Neri Sara'), 'Sara ha «Casa sicura»: non deve ricevere l\'offerta casa');
  deve(nomi.includes('Rossi Mario'), 'Mario la casa non ce l\'ha e deve restarci');
});

prova('il «non ce l\'ha» guarda tutte le polizze, non solo quelle filtrate', async () => {
  /* Sara ha l'auto con HDI e la casa con Allianz. Chiedendo «clienti HDI senza
     casa», se il controllo guardasse solo le polizze HDI, Sara passerebbe — e
     si ritroverebbe l'offerta di una polizza che ha già. */
  const s = await membriSegmento('tok', { compagnia: 'HDI', senza_prodotto: 'Casa' });
  deve(!s.contattabili.some(x => x.nominativo === 'Neri Sara'), 'Sara è passata: il filtro guarda solo le polizze filtrate');
});

prova('l\'età non è invertita', async () => {
  chiamate.length = 0;
  await membriSegmento('tok', { eta_min: 40, eta_max: 60 });
  const url = chiamate[0];
  const oggi = new Date();
  const meno = (n) => new Date(oggi.getFullYear() - n, oggi.getMonth(), oggi.getDate()).toISOString().slice(0, 10);
  deve(url.includes('data_nascita=lte.' + meno(40)), 'chi ha almeno 40 anni è nato PRIMA di ' + meno(40) + ' — url: ' + url);
  deve(url.includes('data_nascita=gte.' + meno(61)), 'chi ha al più 60 anni è nato DOPO ' + meno(61) + ' — url: ' + url);
});

prova('i valori scritti a mano non possono rompere il filtro', async () => {
  chiamate.length = 0;
  await membriSegmento('tok', { provincia: 'RG),tutto=eq.1' });
  deve(!/\(|\)/.test(chiamate[0].split('provincia=')[1] || ''), 'parentesi passate dentro il filtro: ' + chiamate[0]);
});

// ── esecuzione ───────────────────────────────────────────────────────────────
let ko = 0;
console.log('\nDESTINATARI — gruppi, segmenti e consenso');
for (const { nome, fn } of esiti) {
  try { await fn(); console.log('  ok  ' + nome); }
  catch (e) { ko++; console.log('  X   ' + nome + '\n      ' + e.message); }
}
console.log(`\nDESTINATARI: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
