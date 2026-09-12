// ═══════════════════════════════════════════════════════════════════════════════
//  IL PROGETTO CHE COMPILA IL CLIENTE — le prove della porta pubblica
//  (12/09/2026)
//
//  È l'unica porta di QUOTO che si apre senza che nessuno sia collegato, e
//  dietro ci sono il nome di una persona, quanto guadagna e quando è nata. Un
//  errore qui non si vede da nessuna parte: il link funziona lo stesso, il
//  cliente compila lo stesso, e intanto lo può aprire chiunque.
//
//  Le cose che devono restare vere:
//
//    1. DUE CHIAVI. Il link da solo non apre niente: serve anche la data di
//       nascita. Se un giorno questa prova cade, il link è diventato una
//       chiave sola — e i link si inoltrano.
//    2. LA SECONDA CHIAVE SI DIFENDE. Una data di nascita si indovina in
//       poche decine di migliaia di tentativi. Dopo cinque, il link si
//       blocca. Senza il blocco, la seconda chiave non è una chiave.
//    3. CHI SCRIVE LA DATA GIUSTA ENTRA. Nei formati che usa la gente:
//       5/3/1980 e 1980-03-05 sono la stessa data. Rifiutarne uno vuol dire
//       bruciare un tentativo a un cliente che ha ragione.
//    4. IL TOKEN NON SI SALVA E NON SI RIPETE.
//    5. QUELLO CHE ARRIVA DA FUORI SI CONTROLLA. Il cliente non sceglie a
//       chi attaccare il progetto, e non scrive numeri impossibili.
// ═══════════════════════════════════════════════════════════════════════════════
import {
  genToken, impronta, linkDi, normalizzaData, dateCombaciano,
  statoInvito, dopoTentativoSbagliato, preparaCompilazione,
  COLONNE_ELENCO, TENTATIVI_MAX, GIORNI_VALIDITA, LIMITE_BYTE,
} from '../progettoPrevidenziale.js';

const esiti = [];
const prova = (nome, fn) => {
  try { const m = fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, m) => { if (!c) throw new Error(m); };

const ORA = '2026-09-12T12:00:00.000Z';
const vivo = (extra) => ({
  id: 'x', anagrafica_id: 'a', creato_da: 'u', tentativi: 0, bloccato: false,
  scade_il: '2026-10-12T12:00:00.000Z', revocato_il: null, completato_il: null, ...(extra || {}),
});

/* ── 3. la data di nascita, come la scrive la gente ────────────────────── */
prova('la stessa data scritta in modi diversi è la stessa data', () => {
  const forme = ['1980-03-05', '05/03/1980', '5/3/1980', '05-03-1980', '5.3.1980', ' 05/03/1980 '];
  for (const f of forme) {
    deve(normalizzaData(f) === '1980-03-05', 'non riconosce «' + f + '»: ' + normalizzaData(f));
    deve(dateCombaciano(f, '1980-03-05'), '«' + f + '» non combacia con la data del database');
  }
  return forme.length + ' forme, tutte riconosciute';
});

prova('una data diversa non combacia, e nemmeno una vuota', () => {
  deve(!dateCombaciano('1980-03-06', '1980-03-05'), 'un giorno di differenza passa');
  deve(!dateCombaciano('1980-04-05', '1980-03-05'), 'un mese di differenza passa');
  deve(!dateCombaciano('1981-03-05', '1980-03-05'), 'un anno di differenza passa');
  /* Il caso che conta: chi NON manda niente non deve entrare. Se una data
     vuota combaciasse con una vuota, basterebbe il link. */
  /* Le date impossibili sono il caso cattivo: se «00/00/0000» combaciasse
     con se stesso, basterebbe che in anagrafica ci fosse finita una data
     farlocca perche' il link si aprisse scrivendo la stessa farlocca. */
  for (const v of ['', null, undefined, '   ', 'pippo', '00/00/0000', '1980',
                   '31/02/1980', '32/01/1980', '05/13/1980', '1980-02-30', '05/03/1080']) {
    deve(!dateCombaciano(v, '1980-03-05'), 'una data non valida passa: ' + JSON.stringify(v));
    deve(!dateCombaciano(v, v), 'due dati non validi uguali combaciano: ' + JSON.stringify(v));
  }
  /* E nemmeno se il database non ce l'ha. */
  deve(!dateCombaciano('1980-03-05', null), 'combacia con un\'anagrafica senza data di nascita');
  return 'differenze e vuoti: nessuno entra';
});

prova('il 5 marzo non diventa il 3 maggio', () => {
  /* Giorno e mese scambiati sono l'errore che rende la prova verde e la
     porta aperta a chi ha indovinato l'altra combinazione. */
  deve(normalizzaData('05/03/1980') === '1980-03-05', 'giorno e mese invertiti nel formato italiano');
  deve(normalizzaData('1980-05-03') === '1980-05-03', 'il formato ISO viene reinterpretato');
  deve(!dateCombaciano('05/03/1980', '1980-05-03'), 'il 5 marzo combacia col 3 maggio');
  return '5/3/1980 ≠ 1980-05-03';
});

/* ── 1-2. lo stato dell'invito e la difesa della seconda chiave ─────────── */
prova('un invito vivo si apre, uno scaduto no', () => {
  deve(statoInvito(vivo(), ORA).ok, 'un invito valido viene rifiutato');
  const scaduto = statoInvito(vivo({ scade_il: '2026-09-11T12:00:00.000Z' }), ORA);
  deve(!scaduto.ok && scaduto.codice === 410, 'un invito scaduto viene accettato');
  deve(/scadut/i.test(scaduto.motivo), 'non dice che è scaduto: ' + scaduto.motivo);
  return 'vivo sì, scaduto no';
});

prova('un invito revocato o bloccato non si apre, e si capisce perché', () => {
  const rev = statoInvito(vivo({ revocato_il: ORA }), ORA);
  deve(!rev.ok && /annullat/i.test(rev.motivo), 'un invito revocato si apre ancora');
  const blo = statoInvito(vivo({ bloccato: true }), ORA);
  deve(!blo.ok && /bloccat/i.test(blo.motivo), 'un invito bloccato si apre ancora');
  /* Il messaggio deve dire cosa fare: un cliente davanti a «non autorizzato»
     chiama il consulente arrabbiato, non gli chiede un link nuovo. */
  for (const s of [rev, blo]) deve(/consulente/i.test(s.motivo), 'non dice a chi rivolgersi: ' + s.motivo);
  return 'revocato e bloccato: chiusi, e spiegati';
});

prova('un token che non esiste non rivela che non esiste', () => {
  const s = statoInvito(null, ORA);
  deve(!s.ok && s.codice === 404, 'un invito inesistente risulta valido');
  deve(!/cliente|nome|anagrafica/i.test(s.motivo), 'il messaggio parla del cliente: ' + s.motivo);
  return s.motivo;
});

prova('dopo cinque tentativi sbagliati il link si chiude', () => {
  let riga = vivo();
  const storia = [];
  for (let i = 1; i <= TENTATIVI_MAX; i++) {
    const d = dopoTentativoSbagliato(riga);
    storia.push(d.restano);
    riga = vivo({ tentativi: d.tentativi, bloccato: d.bloccato });
    if (i < TENTATIVI_MAX) {
      deve(!d.bloccato, 'bloccato troppo presto, al tentativo ' + i);
      deve(statoInvito(riga, ORA).ok, 'il link risulta chiuso al tentativo ' + i);
    }
  }
  deve(riga.bloccato, 'dopo ' + TENTATIVI_MAX + ' tentativi il link è ancora aperto');
  const s = statoInvito(riga, ORA);
  deve(!s.ok && s.codice === 423, 'il link bloccato risponde ancora come valido');
  return 'tentativi rimasti: ' + storia.join(', ') + ' → chiuso';
});

prova('il contatore dei tentativi non si può far ripartire da un valore falso', () => {
  /* Se `tentativi` arrivasse sporco (negativo, nullo, una stringa) il conto
     ripartirebbe e i cinque tentativi diventerebbero infiniti. */
  for (const v of [null, undefined, -10, 'tanti', NaN, {}]) {
    const d = dopoTentativoSbagliato(vivo({ tentativi: v }));
    deve(d.tentativi === 1, 'con tentativi=' + JSON.stringify(v) + ' il conto riparte da ' + d.tentativi);
  }
  const alto = dopoTentativoSbagliato(vivo({ tentativi: 99 }));
  deve(alto.bloccato, 'un contatore già oltre il massimo non blocca');
  return 'il contatore non si azzera da solo';
});

/* ── 4. il token ───────────────────────────────────────────────────────── */
prova('due token non sono mai uguali, e sono abbastanza lunghi', () => {
  const visti = new Set();
  for (let i = 0; i < 5000; i++) visti.add(genToken());
  deve(visti.size === 5000, 'token ripetuti: ' + (5000 - visti.size));
  const t = genToken();
  /* 24 byte casuali: indovinarlo non è una strada. */
  deve(t.length >= 30, 'token troppo corto: ' + t.length + ' caratteri');
  deve(/^[A-Za-z0-9_-]+$/.test(t), 'il token ha caratteri che un URL deve codificare: ' + t);
  return '5.000 token distinti, ' + t.length + ' caratteri';
});

prova('dall\'impronta non si torna al token, e la stessa impronta è stabile', () => {
  const t = genToken();
  const h = impronta(t);
  deve(h.length === 64 && /^[0-9a-f]+$/.test(h), 'non è uno SHA-256: ' + h);
  deve(h !== t && h.indexOf(t) < 0, 'l\'impronta contiene il token');
  deve(impronta(t) === h, 'la stessa impronta cambia da una chiamata all\'altra');
  deve(impronta(t + 'x') !== h, 'due token diversi hanno la stessa impronta');
  return 'SHA-256, stabile, non invertibile';
});

prova('il link contiene il token e non l\'impronta', () => {
  const t = genToken();
  const l = linkDi(t);
  deve(l.indexOf(encodeURIComponent(t)) > 0, 'il link non porta il token');
  deve(l.indexOf(impronta(t)) < 0, 'il link porta l\'impronta invece del token');
  deve(/^https:\/\//.test(l), 'il link non è https: ' + l);
  return l.slice(0, 48) + '…';
});

prova('l\'elenco non manda mai al browser l\'impronta dei link vivi', () => {
  /* Una `select=*` qui esporterebbe `token_hash` di tutti gli inviti aperti.
     Non basta a ricostruire un link, ma è la chiave di casa fotocopiata. */
  deve(COLONNE_ELENCO.indexOf('token_hash') < 0, 'COLONNE_ELENCO contiene token_hash');
  deve(COLONNE_ELENCO.indexOf('*') < 0, 'COLONNE_ELENCO è una select *');
  deve(COLONNE_ELENCO.indexOf('anagrafica_id') >= 0, 'l\'elenco non dice a quale cliente appartiene');
  return COLONNE_ELENCO.split(',').length + ' colonne, nessun segreto';
});

/* ── 5. quello che manda il cliente ────────────────────────────────────── */
prova('il modulo compilato bene passa, e torna pulito', () => {
  const p = preparaCompilazione({ dati: {
    eta: '38', lavoro: 'dipendente', redditoMensile: '1800', versamentoMensile: '100',
    etaInizioLavoro: '25', mensilita: '13', baseReddito: 'netto',
  } });
  deve(p.ok, 'un modulo valido viene rifiutato: ' + p.errore);
  deve(p.dati.eta === 38 && p.dati.redditoMensile === 1800, 'i numeri restano stringhe');
  deve(p.dati.compilatoDalCliente === true, 'non resta scritto che l\'ha compilato il cliente');
  deve(typeof p.dati.compilatoIl === 'string', 'non resta scritto quando');
  return 'numeri veri, e la provenienza marcata';
});

prova('i numeri impossibili non entrano', () => {
  const base = { eta: 38, lavoro: 'dipendente', redditoMensile: 1800, versamentoMensile: 100 };
  const casi = [
    [{ eta: 8 }, 'età'], [{ eta: 120 }, 'età'], [{ eta: '' }, 'età'],
    [{ redditoMensile: 0 }, 'reddito'], [{ redditoMensile: -500 }, 'reddito'], [{ redditoMensile: 9e9 }, 'reddito'],
    [{ versamentoMensile: -1 }, 'versamento'],
    [{ lavoro: 'astronauta' }, 'lavoro'], [{ lavoro: '' }, 'lavoro'],
  ];
  for (const [tocco, che] of casi) {
    const p = preparaCompilazione({ dati: { ...base, ...tocco } });
    deve(!p.ok, 'passa ' + che + ' = ' + JSON.stringify(Object.values(tocco)[0]));
    deve(p.errore && p.errore.length > 5, 'rifiuta senza dire perché');
  }
  return casi.length + ' valori impossibili, tutti fermati';
});

prova('un\'età di inizio incoerente diventa «non lo so», non un dato falso', () => {
  /* Chi dice di aver cominciato a lavorare DOPO l'età che ha oggi ha
     sbagliato a scrivere. Tenere quel numero vorrebbe dire calcolargli una
     carriera che non esiste; buttarlo via in silenzio è giusto SOLO perché
     il motore, senza, applica lo scenario prudenziale e lo dichiara. */
  const p = preparaCompilazione({ dati: { eta: 30, lavoro: 'dipendente', redditoMensile: 1800, versamentoMensile: 0, etaInizioLavoro: 45 } });
  deve(p.ok, 'rifiuta tutto il modulo per un campo facoltativo sbagliato');
  deve(p.dati.etaInizioLavoro === null, 'tiene un\'età di inizio impossibile: ' + p.dati.etaInizioLavoro);
  return 'inizio incoerente → scenario prudenziale';
});

prova('il cliente non sceglie a chi attaccare il progetto', () => {
  /* Se `anagrafica_id` o `creato_da` passassero da qui, chiunque abbia un
     link potrebbe scrivere sulla scheda di un altro cliente. */
  const p = preparaCompilazione({ dati: {
    eta: 38, lavoro: 'dipendente', redditoMensile: 1800, versamentoMensile: 100,
    anagrafica_id: '00000000-0000-4000-8000-000000000009',
    creato_da: '00000000-0000-4000-8000-000000000009',
    completato_il: '2001-01-01', bloccato: false, id: 'altro',
  } });
  deve(p.ok, 'il modulo viene rifiutato');
  for (const k of ['anagrafica_id', 'creato_da', 'completato_il', 'bloccato', 'id']) {
    deve(!(k in p.dati), 'il campo «' + k + '» arriva dal cliente fino alla riga salvata');
  }
  return 'nessun campo di sistema passa da fuori';
});

prova('un modulo enorme non entra nel database', () => {
  const p = preparaCompilazione({ dati: {
    eta: 38, lavoro: 'dipendente', redditoMensile: 1800, versamentoMensile: 100,
    zavorra: 'x'.repeat(LIMITE_BYTE + 10),
  } });
  deve(!p.ok && /grande/i.test(p.errore), 'un modulo oltre il limite viene accettato');
  return 'limite a ' + Math.round(LIMITE_BYTE / 1024) + ' KB';
});

prova('senza dati non si salva niente', () => {
  for (const c of [{}, { dati: null }, { dati: 'ciao' }, null, undefined]) {
    const p = preparaCompilazione(c);
    deve(!p.ok, 'accetta un corpo vuoto: ' + JSON.stringify(c));
  }
  return 'corpo vuoto: rifiutato';
});

prova('la validità del link è dichiarata e non eterna', () => {
  deve(GIORNI_VALIDITA > 0 && GIORNI_VALIDITA <= 90,
    'la validità è ' + GIORNI_VALIDITA + ' giorni: un link che apre i dati di una persona non resta aperto così a lungo');
  return GIORNI_VALIDITA + ' giorni';
});

/* ── esecuzione ──────────────────────────────────────────────────────────── */
let ok = 0;
for (const [passata, nome, msg] of esiti) {
  if (passata) { ok++; console.log('  ✅ ' + nome + (msg ? '  — ' + msg : '')); }
  else console.log('  ❌ ' + nome + '  — ' + msg);
}
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' Progetto previdenziale: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
