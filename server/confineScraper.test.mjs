// ═══════════════════════════════════════════════════════════════════════════════
//  IL CONFINE BACKEND ↔ SCRAPER — le dieci cose che non devono piu' succedere
//
//  Nessuna di queste prove avvia un browser, tocca la rete o parla con il
//  portale di una compagnia: si costruiscono a mano le risposte che gli scraper
//  danno davvero (copiate dal loro codice, con file e riga) e si controlla che
//  il backend le legga per quello che sono.
//
//      node server/confineScraper.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import {
  ESITO, STATO, leggiRisposta, messaggioScraper, motivoScraper, eElencoRotte,
  statoHttp, statoFonte, eOperativo, corpoErrore, frasePerDiagnosi,
} from './confineScraper.js';

const esiti = [];
const prova = (nome, fn) => {
  try { const m = fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

const json = (o, http = 200) => ({ http, contentType: 'application/json; charset=utf-8', testo: JSON.stringify(o) });

// ── 1. ok:false non diventa mai ok:true ──────────────────────────────────────
prova('uno scraper che dice ok:false non diventa un risultato', () => {
  const c = leggiRisposta(json({ ok: false, error: 'Non loggato ad Allianz.' }));
  deve(c.ok === false, 'ok:false e\' passato come risultato buono');
  deve(c.esito === ESITO.ERRORE_SCRAPER, 'esito atteso errore-scraper, trovato ' + c.esito);
  deve(c.http === 502, 'un guasto dello scraper deve uscire 502, trovato ' + c.http);
});

prova('ok:false vince anche se accanto ci sono dei dati', () => {
  /* moto:488-492 risponde ok:false MA con veicolo, targa e nascita valorizzati:
     chi guarda solo i dati crede che sia andata bene. */
  const c = leggiRisposta(json({ ok: false, motivo: 'PORTALE_CAMBIATO', targa: 'ZZ000ZZ', veicolo: { descrizione: null } }));
  deve(c.ok === false, 'la presenza di dati ha coperto un ok:false');
});

// ── 2. «errore» e' un errore quanto «error» ──────────────────────────────────
prova('il campo «errore» viene letto come errore, non ignorato', () => {
  /* E' il caso reale: allianz:981 scrive `errore`, server/moto.js:391
     controllava `d.error` → la guardia non scattava. */
  const risposta = {
    ok: false, motivo: 'PORTALE_CAMBIATO', targa: 'ZZ000ZZ',
    errore: "Campo targa non trovato sul portale Allianz: la ricerca ANIA non e' partita.",
  };
  deve(risposta.error === undefined, 'la risposta di allianz non ha un campo `error`: e\' il punto della prova');
  const c = leggiRisposta(json(risposta));
  deve(c.ok === false, 'un errore scritto «errore» e\' stato ignorato');
  deve(/non e' partita/.test(c.messaggio), 'il messaggio dello scraper e\' andato perso: ' + c.messaggio);
});

prova('il campo «error» viene letto come errore', () => {
  const c = leggiRisposta(json({ ok: false, error: 'Sessione AXA scaduta.' }));
  deve(c.ok === false && /AXA/.test(c.messaggio), 'messaggio perso: ' + c.messaggio);
});

prova('anche «avviso» e «msg» sono messaggi', () => {
  deve(messaggioScraper({ avviso: 'Veicolo gia\' assicurato' }) === 'Veicolo gia\' assicurato', 'avviso non letto');
  deve(messaggioScraper({ msg: 'Il portale chiede il codice' }) === 'Il portale chiede il codice', 'msg non letto');
  deve(messaggioScraper({ errore: 'a', error: 'b' }) === 'a', 'con entrambi vince «errore» (e\' il piu\' specifico)');
  deve(messaggioScraper(null) === '' && messaggioScraper({}) === '', 'niente in ingresso non e\' un messaggio');
});

prova('un errore senza ok viene comunque riconosciuto', () => {
  /* allianz:970 e :973 rispondono {error:'Uso: /lookup?targa=…'} senza `ok`. */
  const c = leggiRisposta(json({ error: 'Uso: /lookup?targa=AB12345' }));
  deve(c.ok === false, 'una risposta di solo errore e\' passata come risultato');
});

// ── 3. HTTP 500 dello scraper non diventa 200 ────────────────────────────────
prova('un 500 dello scraper non diventa 200 verso il frontend', () => {
  const c = leggiRisposta({ http: 500, contentType: 'application/json', testo: JSON.stringify({ error: 'boom' }) });
  deve(c.ok === false, 'un 500 e\' passato come risultato');
  deve(c.esito === ESITO.HTTP_ERRORE, 'esito atteso http-errore, trovato ' + c.esito);
  deve(c.http === 502, 'atteso 502 verso il frontend, trovato ' + c.http);
  deve(c.httpScraper === 500, 'lo stato originale dello scraper va conservato per la diagnosi');
});

prova('anche un 404 dello scraper e\' un guasto', () => {
  /* axa:1020, groupama:713, kube:258, prima:532, assieasy:271 rispondono 404
     sulle rotte che non conoscono: e' la cosa giusta, e va vista. */
  const c = leggiRisposta({ http: 404, contentType: 'application/json', testo: JSON.stringify({ error: 'endpoint sconosciuto' }) });
  deve(c.ok === false && c.http === 502, 'un 404 dello scraper non e\' stato trattato come guasto');
  deve(/endpoint sconosciuto/.test(c.messaggio), 'il messaggio dello scraper e\' andato perso');
});

// ── 4. Risposta non JSON ─────────────────────────────────────────────────────
prova('una risposta non JSON non diventa 200 con {}', () => {
  const c = leggiRisposta({ http: 200, contentType: 'text/html', testo: '<html><body>502 Bad Gateway</body></html>' });
  deve(c.ok === false, 'una pagina HTML e\' passata come risultato');
  deve(c.esito === ESITO.NON_JSON, 'esito atteso non-json, trovato ' + c.esito);
  deve(c.http === 502, 'atteso 502');
});

prova('una risposta vuota non e\' un risultato', () => {
  const c = leggiRisposta({ http: 200, contentType: 'application/json', testo: '' });
  deve(c.ok === false && c.esito === ESITO.NON_JSON, 'il corpo vuoto e\' passato come risultato');
});

prova('un JSON che non e\' un oggetto non e\' un risultato', () => {
  deve(leggiRisposta({ http: 200, contentType: 'application/json', testo: 'null' }).ok === false, 'null passato');
  deve(leggiRisposta({ http: 200, contentType: 'application/json', testo: '"testo"' }).ok === false, 'stringa passata');
});

// ── 5. Rotta sconosciuta ─────────────────────────────────────────────────────
prova('l\'elenco degli endpoint non e\' un risultato', () => {
  /* allianz:1241, italiana:1697, hdi:2715, moto:694, quotiamo:153 rispondono
     COSI', con HTTP 200, a qualunque percorso non conoscano. E' un 404
     travestito: e' il motivo per cui uno sfasamento di deploy non si vedeva. */
  const c = leggiRisposta(json({ endpoints: ['/status', '/login', '/logindump', '/lookup?targa=..', '/shot'] }));
  deve(c.ok === false, 'l\'elenco degli endpoint e\' passato come risultato');
  deve(c.esito === ESITO.ROTTA_SCONOSCIUTA, 'esito atteso rotta-sconosciuta, trovato ' + c.esito);
  deve(/versione diversa/.test(c.messaggio), 'il messaggio deve far pensare al deploy: ' + c.messaggio);
});

prova('una risposta che contiene endpoints ma dichiara ok resta un risultato', () => {
  /* hdi:678 ritorna un elenco di endpoint COME DATO da /apigrep: quello e' un
     risultato vero, e non va scambiato per una rotta sconosciuta. */
  deve(eElencoRotte({ endpoints: ['/a'], ok: true }) === false, 'un risultato con ok:true e\' stato scambiato per rotta sconosciuta');
  deve(leggiRisposta(json({ ok: true, endpoints: ['/a', '/b'] })).ok === true, 'risultato legittimo rifiutato');
});

// ── 6. Rete e timeout ────────────────────────────────────────────────────────
prova('lo scraper spento e il timeout sono due cose diverse', () => {
  const spento = leggiRisposta({ erroreRete: 'fetch failed: ECONNREFUSED' });
  const scaduto = leggiRisposta({ erroreRete: 'The operation was aborted' });
  deve(spento.esito === ESITO.IRRAGGIUNGIBILE, 'ECONNREFUSED non riconosciuto: ' + spento.esito);
  deve(scaduto.esito === ESITO.TIMEOUT, 'abort non riconosciuto come timeout: ' + scaduto.esito);
  deve(spento.http === 502 && scaduto.http === 504, 'i due casi devono avere stati HTTP diversi');
});

// ── 7. PORTALE_CAMBIATO arriva fino in fondo ─────────────────────────────────
prova('PORTALE_CAMBIATO resta visibile nel corpo che va al frontend', () => {
  const c = leggiRisposta(json({
    ok: false, motivo: 'PORTALE_CAMBIATO', targa: 'ZZ000ZZ',
    errore: "Campo targa non trovato: la ricerca ANIA non e' partita.",
  }));
  deve(c.motivo === 'PORTALE_CAMBIATO', 'il motivo e\' andato perso nella lettura');
  const corpo = corpoErrore(c);
  deve(corpo.motivo === 'PORTALE_CAMBIATO', 'il motivo non arriva al frontend');
  deve(corpo.ok === false, 'il corpo d\'errore deve dire ok:false');
  deve(typeof corpo.error === 'string' && corpo.error.length > 0, 'il frontend legge `error`: deve esserci');
  deve(!/trovato/i.test(corpo.error) || /non e' partita/.test(corpo.error),
    'il messaggio non deve suonare come «cercato e non trovato»');
});

prova('«non trovato» e «non eseguito» restano due risposte diverse', () => {
  /* allianz:985 — ha cercato, non ha trovato: e' un risultato, si accetta. */
  const trovatoNo = leggiRisposta(json({ ok: true, targa: 'ZZ000ZZ', trovato: false, ania: null, campo_targa_compilato: true }));
  /* allianz:981 — non ha nemmeno cercato: e' un guasto, si va a guardare. */
  const nonEseguito = leggiRisposta(json({ ok: false, motivo: 'PORTALE_CAMBIATO', errore: 'non e\' partita' }));
  deve(trovatoNo.ok === true, '«cercato e non trovato» deve restare un risultato buono');
  deve(nonEseguito.ok === false, '«non ho cercato» deve restare un guasto');
  return 'le due risposte non si confondono piu\'';
});

// ── 8-9. Lo stato della fonte ────────────────────────────────────────────────
prova('uno scraper spento non e\' «pronta»', () => {
  /* Era `fonti.js:80`: bastava un username salvato perche' ECONNREFUSED
     diventasse 'pronta', che nel pannello e' lo STESSO VERDE di 'attiva'. */
  const s = statoFonte({ risposta: { ok: false, dati: null, da: 'rete' }, configurato: true });
  deve(s.stato === STATO.SPENTO, 'atteso spento, trovato ' + s.stato);
  deve(s.stato !== 'pronta', 'uno scraper spento e\' tornato «pronta»');
  deve(eOperativo(s.stato) === false, 'uno scraper spento non puo\' risultare operativo');
});

prova('l\'interruttore aperto e\' spento, e lo dice', () => {
  const s = statoFonte({ risposta: { ok: false, dati: null, da: 'interruttore' }, configurato: true });
  deve(s.stato === STATO.SPENTO, 'atteso spento, trovato ' + s.stato);
  deve(s.diagnosi === 'gia-dato-per-spento', 'la diagnosi deve distinguere l\'interruttore');
});

prova('uno stato incerto diventa da_verificare, non verde', () => {
  /* moto:386 risponde SOLO { url }: non dichiara `loggato`. Prima diventava
     'scaduta' o 'pronta' a seconda del ramo; nessuna delle due e' vera. */
  const s = statoFonte({ risposta: { ok: true, dati: { url: 'https://x' }, da: 'rete' }, configurato: true });
  deve(s.stato === STATO.DA_VERIFICARE, 'atteso da_verificare, trovato ' + s.stato);
  deve(eOperativo(s.stato) === false, 'uno stato incerto non puo\' essere operativo');
});

prova('gli stati buoni restano quelli di prima', () => {
  const attiva = statoFonte({ risposta: { ok: true, dati: { url: 'https://x', loggato: true }, da: 'rete' }, configurato: true });
  const scaduta = statoFonte({ risposta: { ok: true, dati: { url: 'https://x', loggato: false }, da: 'rete' }, configurato: true });
  const nuova = statoFonte({ risposta: { ok: false, dati: null, da: 'rete' }, configurato: false });
  deve(attiva.stato === STATO.ATTIVA && eOperativo(attiva.stato), 'la fonte viva deve restare attiva');
  deve(scaduta.stato === STATO.SCADUTA, 'atteso scaduta, trovato ' + scaduta.stato);
  deve(nuova.stato === STATO.NON_CONFIGURATA, 'atteso non_configurata, trovato ' + nuova.stato);
});

prova('solo «attiva» accende il verde', () => {
  const verdi = Object.values(STATO).filter(eOperativo);
  deve(verdi.length === 1 && verdi[0] === STATO.ATTIVA, 'stati operativi inattesi: ' + verdi.join(', '));
});

// ── 10. La diagnosi delle credenziali, senza mai mostrarne una ───────────────
prova('credenziali assenti e credenziali illeggibili sono due cose diverse', () => {
  /* Il caso vero: il pannello mostra l'utente salvato (il backend lo decifra) e
     lo scraper dice ha_credenziali:false. Non e' una password sbagliata: e'
     FONTI_SECRET diversa fra i due processi. */
  const chiaveDiversa = statoFonte({
    risposta: { ok: true, dati: { url: 'https://x', loggato: false, ha_credenziali: false }, da: 'rete' },
    configurato: true, credenzialiNelloStore: true,
  });
  const davveroAssenti = statoFonte({
    risposta: { ok: true, dati: { url: 'https://x', loggato: false, ha_credenziali: false }, da: 'rete' },
    configurato: true, credenzialiNelloStore: false,
  });
  deve(chiaveDiversa.diagnosi === 'credenziali-non-leggibili-dallo-scraper', 'chiave diversa non riconosciuta: ' + chiaveDiversa.diagnosi);
  deve(davveroAssenti.diagnosi === 'credenziali-assenti', 'credenziali assenti non riconosciute: ' + davveroAssenti.diagnosi);
  deve(chiaveDiversa.diagnosi !== davveroAssenti.diagnosi, 'i due casi danno la stessa diagnosi');
});

prova('la frase sulla chiave diversa non dice di cambiare la password', () => {
  /* E' il difetto che produceva la diagnosi peggiore: mandava a cambiare una
     password che era giusta. */
  const f = frasePerDiagnosi('credenziali-non-leggibili-dallo-scraper');
  deve(f.length > 0, 'nessuna frase per la chiave diversa');
  deve(/FONTI_SECRET/.test(f), 'la frase deve nominare la chiave, e\' l\'unica cosa che porta alla soluzione');
  deve(/NON serve/i.test(f), 'la frase deve dire esplicitamente che reinserire la password non serve');
});

prova('nessuna frase di diagnosi contiene un valore segreto', () => {
  const chiavi = ['credenziali-non-leggibili-dallo-scraper', 'credenziali-assenti', 'nessuna-risposta',
    'gia-dato-per-spento', 'stato-incompleto', 'risposta-non-interpretabile'];
  for (const k of chiavi) {
    const f = frasePerDiagnosi(k);
    deve(!/[A-Za-z0-9+/]{24,}={0,2}/.test(f), 'la frase «' + k + '» contiene qualcosa che sembra un segreto');
    deve(!/v1:/.test(f), 'la frase «' + k + '» contiene un blob cifrato');
  }
  return chiavi.length + ' frasi controllate';
});

// ── Contorno: la mappa degli stati HTTP ──────────────────────────────────────
prova('ogni esito ha uno stato HTTP, e nessun guasto e\' 200', () => {
  for (const e of Object.values(ESITO)) {
    const h = statoHttp(e);
    deve(Number.isFinite(h), 'esito senza stato HTTP: ' + e);
    if (e !== ESITO.OK) deve(h !== 200, 'il guasto «' + e + '» esce come 200');
  }
  return Object.values(ESITO).length + ' esiti';
});

prova('il motivo si legge da tutti i nomi usati dagli scraper', () => {
  deve(motivoScraper({ motivo: 'PORTALE_CAMBIATO' }) === 'PORTALE_CAMBIATO', 'motivo non letto');
  deve(motivoScraper({ codice: 'freno_tirato' }) === 'freno_tirato', 'codice non letto');
  deve(motivoScraper({}) === null, 'senza motivo deve tornare null');
});

let ko = 0;
console.log('\nCONFINE BACKEND ↔ SCRAPER — un guasto non e\' un risultato');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome + (msg ? ' — ' + msg : '') : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nCONFINE: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
