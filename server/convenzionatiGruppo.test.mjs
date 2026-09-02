// ═══════════════════════════════════════════════════════════════════════════════
//  L'AGGANCIO AL GRUPPO DELLA CONVENZIONE
//
//  PERCHE' ESISTE
//    Il 2 settembre 2026, alle 15:22, Francesco ha completato i dati come
//    associato. Sullo schermo e' andato tutto bene. Nel log della macchina:
//
//      [convenzionati] dati confermati ma aggancio al gruppo non riuscito:
//      new row for relation "quote_gruppi" violates check constraint
//      "quote_gruppi_tipo_chk"
//
//    Scrivevamo `tipo: 'convenzione'` — un valore che il pannello mostrava gia'
//    come un tipo suo, ma che il database non accettava. Risultato: consenso
//    registrato, e la persona rimasta fuori dal gruppo e senza anagrafica.
//    Senza anagrafica non e' un cliente: niente polizze, niente campagne.
//
//    Le due lezioni, e sono queste che le prove tengono ferme:
//      · un valore che il database deve conoscere non si scrive in mezzo al
//        codice, dove nessuno lo cerca;
//      · un passo che puo' fallire e che non blocca l'utente DEVE potersi
//        rifare da solo, altrimenti «si potra' rifare» resta un commento.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
// Si guarda il codice, non i commenti: qui sopra c'e' scritto il difetto.
const senzaCommenti = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
const src = senzaCommenti(fs.readFileSync(path.join(QUI, 'convenzionati.js'), 'utf8'));
const polizze = src.slice(src.indexOf("convenzionatiRouter_pubblicoAssociati.post('/mie-polizze'"));
const dati = src.slice(src.indexOf("convenzionatiRouter_pubblicoAssociati.post('/miei-dati'"),
                       src.indexOf("convenzionatiRouter_pubblicoAssociati.post('/richiesta'"));

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

prova('il tipo del gruppo sta in un posto solo', () => {
  deve(/const GRUPPO_CONVENZIONE = 'convenzione'/.test(src), 'non c\'e\' una costante per il tipo del gruppo');
  deve(/tipo: GRUPPO_CONVENZIONE/.test(src), 'il tipo e\' ancora scritto in mezzo al codice');
  /* Si cerca il valore NEL PUNTO IN CUI FA DANNO — scritto a mano come tipo di
     gruppo — non ovunque nel file: la parola compare anche nell'elenco delle
     password troppo facili, e contarla li' dentro renderebbe questa prova rossa
     su codice giusto. E' lo stesso inciampo dei commenti, in un'altra forma. */
  deve(!/tipo:\s*'convenzione'/.test(src), 'il tipo e\' ancora scritto a mano da qualche parte');
  return 'una volta sola, dove si vede';
});

prova('il consenso al marketing non si perde per strada', () => {
  /* Finiva solo sull'anagrafica creata subito dopo. Se quella creazione
     falliva, il consenso era stato dato e non restava scritto da nessuna
     parte da cui riprenderlo — e su un consenso non si tira a indovinare. */
  deve(/marketing_accettato: !!b\.marketing/.test(dati), 'il consenso resta solo sull\'anagrafica, che potrebbe non nascere');
  const i = dati.indexOf('marketing_accettato');
  const j = dati.indexOf('nelGruppoDellaConvenzione');
  deve(i > -1 && j > i, 'lo scrive dopo il passo che puo\' fallire: se fallisce, e\' come non averlo scritto');
  return 'scritto prima del passo che puo\' rompersi';
});

prova('chi e\' rimasto a meta\' si riaggancia da solo', () => {
  /* «L'aggancio si potra' rifare» era un commento. Qui e' il posto in cui si
     rifa': alla prima visita all'area, senza chiedere niente di nuovo. */
  deve(/!assoc\.anagrafica_id && assoc\.privacy_accettata_il/.test(polizze),
    'chi ha dato il consenso ma non ha un\'anagrafica resta fuori per sempre');
  deve(/nelGruppoDellaConvenzione\(/.test(polizze), 'si accorge del problema ma non lo ripara');
  deve(/assoc\.marketing_accettato/.test(polizze), 'rifa\' l\'aggancio tirando a indovinare il consenso');
  return 'si ripara alla prima visita, in silenzio';
});

prova('il recupero non fa saltare la pagina se non riesce', () => {
  // Le polizze devono comparire lo stesso: il recupero e' un di piu'.
  const pezzo = polizze.slice(polizze.indexOf('privacy_accettata_il'), polizze.indexOf('const pol ='));
  deve(/catch \(e\)/.test(pezzo), 'un recupero fallito porta giu\' tutta l\'area');
  deve(/console\.warn\('\[convenzionati\] recupero aggancio non riuscito/.test(pezzo), 'se non riesce, non lo scrive da nessuna parte');
  return 'se non riesce si riprova domani, e intanto si legge nel log';
});

prova('quando riesce, si vede nel log', () => {
  /* Il difetto di quel giorno l'ha trovato il log. Un recupero che avviene in
     silenzio assoluto non si distingue da un recupero che non e' mai avvenuto. */
  deve(/console\.log\('\[convenzionati\] aggancio al gruppo recuperato/.test(polizze), 'ripara senza dirlo');
  return 'la prossima volta si legge, non si indovina';
});

const ko = esiti.filter(e => !e[0]);
console.log('\n── L\'aggancio al gruppo della convenzione ──────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
