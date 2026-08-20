/* ═══════════════════════════════════════════════════════════════════════════
   NUCLEO — le prove delle fondamenta
   Formattatori, indirizzi e menu: sbagliano una volta sola e sbagliano
   ovunque, perché li usano tutti i moduli.
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { esiti, deve, uguale, RADICE } from './banco.mjs';
import { esc, euro, numero, data, dataOra, giorni, quando, sommaMesi } from '../nucleo/formato.js';
import { scriviIndirizzo } from '../nucleo/router.js';
import { menu, visibile, trova, MODULI } from '../nucleo/registro.js';

const e = esiti('NUCLEO — le fondamenta');

/* ── Formato ────────────────────────────────────────────────────────────── */
e.prova('esc chiude la porta all\'HTML che arriva dal database', () => {
  uguale(esc('<script>x</script>'), '&lt;script&gt;x&lt;/script&gt;');
  uguale(esc("D'Amico & figli"), 'D&#39;Amico &amp; figli');
  uguale(esc(null), '', 'un campo vuoto non deve scrivere «null» a schermo');
});

e.prova('gli importi si scrivono all\'italiana, con i centesimi', () => {
  uguale(euro(1234.5), '€ 1.234,50');
  uguale(euro(0), '€ 0,00', 'zero è un dato, non un dato mancante');
  uguale(euro(null), '—', 'un importo che non c\'è non è zero: sarebbe una bugia contabile');
  uguale(euro('abc'), '—');
});

e.prova('i numeri interi non prendono decimali finti', () => {
  uguale(numero(1200), '1.200');
  uguale(numero(null), '—');
});

e.prova('una data senza orario non si inventa le 00:00', () => {
  uguale(dataOra('2026-07-30'), '30/07/2026');
  deve(/^30\/07\/2026 \d{2}:\d{2}$/.test(dataOra('2026-07-30T11:04:00Z')), 'con l\'orario va mostrato l\'orario');
  uguale(data(null), '—');
});

e.prova('i giorni si contano di calendario, non a ore', () => {
  /* Guardata la mattina o la sera, una scadenza è sempre alla stessa distanza:
     contando le ore, alle 23 «fra 1 giorno» diventerebbe «oggi». */
  uguale(giorni('2026-07-31', '2026-07-30T08:00:00Z'), 1);
  uguale(giorni('2026-07-31', '2026-07-30T23:30:00Z'), 1);
  uguale(giorni('2026-07-30', '2026-07-30T14:00:00Z'), 0, 'oggi è zero, non «meno un po\'»');
  uguale(giorni('2026-07-20', '2026-07-30'), -10, 'passata: negativa');
  uguale(giorni(null), null);
});

e.prova('la frase dei giorni si legge senza interpretarla', () => {
  uguale(quando('2026-07-31', '2026-07-30'), 'fra 1 giorno');
  uguale(quando('2026-08-02', '2026-07-30'), 'fra 3 giorni');
  uguale(quando('2026-07-30', '2026-07-30'), 'oggi');
  uguale(quando('2026-07-29', '2026-07-30'), 'da 1 giorno');
});

e.prova('somma mesi resta dentro il mese: 31 gennaio + 1 = 28 febbraio', () => {
  uguale(sommaMesi('2026-01-31', 1), '2026-02-28');
  uguale(sommaMesi('2024-01-31', 1), '2024-02-29', 'il 2024 è bisestile');
  uguale(sommaMesi('2026-07-30', 12), '2027-07-30', 'una annuale scade lo stesso giorno dell\'anno dopo');
  uguale(sommaMesi('2026-12-15', 1), '2027-01-15', 'deve cambiare anno');
});

/* ── Indirizzi ──────────────────────────────────────────────────────────── */
e.prova('l\'indirizzo dice sempre dove si è', () => {
  uguale(scriviIndirizzo('clienti'), '#/clienti');
  uguale(scriviIndirizzo('clienti', { id: 'abc' }), '#/clienti?id=abc');
  deve(scriviIndirizzo('clienti', { q: 'Mario Rossi' }).includes('Mario+Rossi'),
    'gli spazi vanno codificati, altrimenti l\'indirizzo si spezza');
});

/* ── Menu e permessi ────────────────────────────────────────────────────── */
e.prova('un collaboratore non vede l\'amministrazione', () => {
  const collaboratore = { admin: false, staff: false };
  const aree = menu(collaboratore).map(a => a.nome);
  deve(!aree.includes('Amministrazione'), 'un collaboratore non deve vedere la gestione utenti');
});

e.prova('un amministratore vede tutto', () => {
  const admin = { admin: true, staff: true };
  uguale(menu(admin).flatMap(a => a.voci).length, MODULI.length);
});

e.prova('un\'area senza voci visibili non compare', () => {
  const aree = menu({ admin: false, staff: false });
  deve(aree.every(a => a.voci.length > 0), 'un titolo di menu che non apre niente è una promessa non mantenuta');
});

e.prova('una voce sconosciuta non si apre per sbaglio', () => {
  uguale(trova('inesistente'), null);
  deve(!visibile({ permesso: 'admin' }, null), 'senza utente non si concede niente');
});

/* ── Regole di casa ─────────────────────────────────────────────────────── */
e.prova('i colori stanno solo nei token, non sparsi nei fogli di stile', () => {
  const base = fs.readFileSync(path.join(RADICE, 'stili', 'base.css'), 'utf8');
  const senzaCommenti = base.replace(/\/\*[\s\S]*?\*\//g, '');
  /* I grigi e i colori di stato sono ammessi solo dove servono e sono pochi;
     quello che NON deve esistere è il verde del marchio scritto a mano: se
     domani cambia, deve cambiare in un punto solo. */
  deve(!/#0?2984e/i.test(senzaCommenti), 'il verde del marchio è scritto a mano: si usa var(--w1-verde)');
  deve(/var\(--w1-verde\)/.test(senzaCommenti), 'base.css non usa affatto i token');
});

e.prova('la pagina di partenza non contiene logica', () => {
  const html = fs.readFileSync(path.join(RADICE, 'index.html'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '');   // i commenti nominano <script>: non sono codice
  const dentro = html.match(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi) || [];
  deve(!dentro.length, 'c\'è del codice dentro index.html: è così che ricomincia il file unico');
});

e.prova('la chiave pubblica di Supabase sta in un posto solo', () => {
  const cartella = path.join(RADICE, 'nucleo');
  const conChiave = fs.readdirSync(cartella)
    .filter(f => f.endsWith('.js') && /eyJ[A-Za-z0-9_-]{20,}/.test(fs.readFileSync(path.join(cartella, f), 'utf8')));
  uguale(conChiave, ['dati.js'], 'la chiave va nominata solo in nucleo/dati.js');
});

process.exit(e.stampa() === 0 ? 0 : 1);
