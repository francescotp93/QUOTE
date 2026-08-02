// ═══════════════════════════════════════════════════════════════════════════════
//  RISERVATEZZA — la fotografia della pagina non deve portare fuori niente
//
//  Il buco (verificato il 01/08/2026 riga per riga): richDump() fotografa ogni
//  controllo della pagina leggendo `innerText || value` su un selettore che
//  comprende `input`. GET /fonti/:id/auto gira quella fotografia al browser
//  verbatim (server/fonti.js: `return res.json(d)`). Quindi il valore di un
//  campo password del portale della compagnia — le nostre credenziali — poteva
//  arrivare fino al browser, e i dati del cliente a schermo con lui.
//
//  Queste prove usano dati inventati apposta. Nessun dato reale di clienti
//  entra mai in un file di prova.
// ═══════════════════════════════════════════════════════════════════════════════
import {
  COPERTO, eSegreto, mascheraTarga, mascheraNascita, mascheraCodiceFiscale,
  ripulisciTesto, ripulisciControlli, ripulisciDump, perLog,
} from '../comune/riservatezza.mjs';

const esiti = [];
const prova = (nome, fn) => {
  try { const m = fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

// ── 1. Riconoscere un campo segreto ──────────────────────────────────────────
prova('un campo password è un segreto', () => {
  deve(eSegreto({ type: 'password', name: 'Ecom_Password' }), 'non riconosce il tipo password');
});

prova('lo è anche un campo che il portale dichiara «testo»', () => {
  /* Molti portali usano type="text" per il codice OTP: fidarsi del tipo non basta. */
  deve(eSegreto({ type: 'text', name: 'passcode' }), 'passcode non riconosciuto');
  deve(eSegreto({ type: 'tel', id: 'codice-duo' }), 'codice Duo non riconosciuto');
  deve(eSegreto({ type: 'text', name: 'user_token' }), 'token non riconosciuto');
  deve(eSegreto({ type: 'text', name: 'iban_beneficiario' }), 'IBAN non riconosciuto');
});

prova('un campo normale non è un segreto', () => {
  deve(!eSegreto({ type: 'text', name: 'targa' }), 'la targa viene scambiata per un segreto');
  deve(!eSegreto({ type: 'text', name: 'cognome' }), 'il cognome viene scambiato per un segreto');
});

// ── 2. Le maschere ───────────────────────────────────────────────────────────
prova('la targa resta riconoscibile come targa, ma non è più quella targa', () => {
  deve(mascheraTarga('FL208KP') === 'FL***KP', 'ottenuto: ' + mascheraTarga('FL208KP'));
});

prova('della data di nascita resta solo l\'anno', () => {
  deve(mascheraNascita('14/03/1978') === '**/**/1978', 'ottenuto: ' + mascheraNascita('14/03/1978'));
  deve(mascheraNascita('7-11-1990') === '**-**-1990', 'il trattino non viene gestito');
});

prova('del codice fiscale resta la forma, non la persona', () => {
  const m = mascheraCodiceFiscale('RSSMRA80A01H501U');
  deve(m !== 'RSSMRA80A01H501U', 'non è stato mascherato');
  deve(m.length === 16, 'la lunghezza è cambiata: ottenuto ' + m);
  deve(!/MRA80A01H501/.test(m), 'la parte che identifica è ancora leggibile: ' + m);
});

prova('la lunghezza di una password non si rivela', () => {
  /* Sapere che è lunga 14 caratteri è già un aiuto per chi ci prova. */
  const corta = ripulisciControlli([{ type: 'password', name: 'p', text: 'ab' }])[0].text;
  const lunga = ripulisciControlli([{ type: 'password', name: 'p', text: 'a'.repeat(40) }])[0].text;
  deve(corta === lunga, 'dalla maschera si capisce quanto era lunga');
});

// ── 3. I controlli ───────────────────────────────────────────────────────────
prova('il valore di un campo password sparisce del tutto', () => {
  const dentro = [{ tag: 'input', id: 'Ecom_Password', name: 'Ecom_Password', type: 'password', text: 'unaPasswordVera123' }];
  const fuori = ripulisciControlli(dentro);
  deve(!JSON.stringify(fuori).includes('unaPasswordVera123'), 'la password è ancora nella fotografia');
  deve(fuori[0].text === COPERTO, 'il campo non è coperto');
  deve(fuori[0].riservato === true, 'non è segnato come riservato');
});

prova('quello che serve a ritarare i selettori resta intatto', () => {
  /* Se si mascherasse anche questo, la fotografia non servirebbe più a niente
     e qualcuno tornerebbe a leggere quella cruda. */
  const fuori = ripulisciControlli([{ tag: 'input', id: 'Ecom_Password', name: 'Ecom_Password', type: 'password', text: 'x' }])[0];
  deve(fuori.tag === 'input' && fuori.id === 'Ecom_Password' && fuori.name === 'Ecom_Password' && fuori.type === 'password',
    'tag, id, name o type sono stati toccati: la fotografia non serve più');
});

prova('i dati del cliente nei campi normali vengono coperti', () => {
  const fuori = ripulisciControlli([
    { tag: 'input', name: 'targa', type: 'text', text: 'FL208KP' },
    { tag: 'input', name: 'cf', type: 'text', text: 'RSSMRA80A01H501U' },
    { tag: 'input', name: 'nascita', type: 'text', text: '14/03/1978' },
  ]);
  const s = JSON.stringify(fuori);
  deve(!s.includes('FL208KP'), 'la targa esce ancora');
  deve(!s.includes('RSSMRA80A01H501U'), 'il codice fiscale esce ancora');
  deve(!s.includes('14/03/1978'), 'la data di nascita esce ancora');
});

// ── 4. Il testo libero ───────────────────────────────────────────────────────
prova('le etichette restano leggibili, i dati no', () => {
  const dentro = 'Targa: FL208KP\nCodice fiscale: RSSMRA80A01H501U\nNato il 14/03/1978\nIBAN IT60X0542811101000000123456\nEmail mario.rossi@esempio.it';
  const fuori = ripulisciTesto(dentro);
  for (const etichetta of ['Targa', 'Codice fiscale', 'Nato il', 'IBAN', 'Email']) {
    deve(fuori.includes(etichetta), 'è sparita anche l\'etichetta «' + etichetta + '»: la fotografia non serve più');
  }
  for (const dato of ['FL208KP', 'RSSMRA80A01H501U', '14/03/1978', '0542811101000000123456', 'mario.rossi@']) {
    deve(!fuori.includes(dato), 'esce ancora: ' + dato);
  }
});

prova('un testo senza dati personali non viene rovinato', () => {
  const t = 'Interrogazione banca dati ANIA — inserire la targa e premere Cerca';
  deve(ripulisciTesto(t) === t, 'ha modificato un testo che non conteneva dati');
});

// ── 5. La fotografia intera ──────────────────────────────────────────────────
prova('la fotografia ripulita si dichiara tale', () => {
  /* Serve a distinguere una fotografia passata di qui da una cruda: senza il
     segno, chi la riceve non può sapere se fidarsi. */
  const d = ripulisciDump({ url: 'https://x', title: 'T', text: 'Targa FL208KP', ctrls: [] });
  deve(d.ripulito === true, 'non si dichiara ripulita');
  deve(!JSON.stringify(d).includes('FL208KP'), 'la targa è passata lo stesso');
});

prova('la fotografia intera non lascia passare la password', () => {
  const d = ripulisciDump({
    url: 'https://amlogin.allianz.it/nidp',
    title: 'Accesso',
    text: 'Utente: mario.rossi@esempio.it',
    ctrls: [{ tag: 'input', name: 'Ecom_Password', type: 'password', text: 'segretissima' }],
  });
  deve(!JSON.stringify(d).includes('segretissima'), 'la password attraversa tutta la ripulitura');
});

prova('quello che non è una fotografia torna com\'era', () => {
  deve(ripulisciDump(null) === null, 'rompe su niente');
  deve(ripulisciDump('ciao') === 'ciao', 'rompe su una stringa');
});

// ── 6. I log ─────────────────────────────────────────────────────────────────
prova('nei log una chiave che si chiama password non ha mai un valore', () => {
  /* I log si spediscono per posta quando si chiede assistenza. */
  const l = perLog({ utente: 'mario', password: 'segretissima', totp: '123456', nota: 'targa FL208KP' });
  const s = JSON.stringify(l);
  deve(!s.includes('segretissima'), 'la password finisce nei log');
  deve(!s.includes('123456'), 'il codice finisce nei log');
  deve(!s.includes('FL208KP'), 'la targa finisce nei log');
  deve(s.includes('mario'), 'ha coperto anche il nome utente: il log non serve più a capire chi ha provato');
});

prova('i log ripuliscono anche in fondo agli annidamenti', () => {
  const l = perLog({ a: { b: [{ secret: 'x', targa: 'FL208KP' }] } });
  deve(!JSON.stringify(l).includes('FL208KP'), 'due livelli sotto non ripulisce più');
});

// ── 7. È innestato davvero nei tre scraper ───────────────────────────────────
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const qui = path.dirname(fileURLToPath(import.meta.url));

for (const c of ['allianz', 'italiana', 'moto']) {
  prova(c + ': la fotografia esce solo dopo essere passata di qui', () => {
    /* La prova che conta: un modulo di riservatezza collegato a niente non
       protegge niente. Se domani qualcuno rimette un `return page.evaluate`
       crudo dentro richDump, qui diventa rosso. */
    const src = fs.readFileSync(path.join(qui, '..', c, 'quote-service.mjs'), 'utf8');
    deve(/import \{[^}]*\bripulisciDump\b[^}]*\} from '\.\.\/comune\/riservatezza\.mjs'/.test(src), 'manca l\'import');
    const i = src.indexOf('async function richDump()');
    deve(i > 0, 'richDump non c\'è più: la fotografia si fa da un\'altra parte, da controllare');
    const corpo = src.slice(i, src.indexOf('\n}', i));
    deve(/return ripulisciDump\(await page\.evaluate\(/.test(corpo),
      'richDump restituisce la fotografia cruda: password e dati dei clienti escono di nuovo');
  });
}

let ko = 0;
console.log('\nRISERVATEZZA — la fotografia non porta fuori niente');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nRISERVATEZZA: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
