/* ═══════════════════════════════════════════════════════════════════════════
   CONTRATTO — le regole che valgono per OGNI modulo
   ───────────────────────────────────────────────────────────────────────────
   Questa prova non guarda un modulo in particolare: li guarda tutti, uno per
   uno, e verifica che rispettino CONTRATTO.md. Un modulo nuovo entra qui
   automaticamente, senza che nessuno debba ricordarsi di aggiungerlo — ed è
   il punto: le regole che dipendono dalla memoria non reggono.
   ═══════════════════════════════════════════════════════════════════════════ */
import { esiti, deve, elencoModuli, sorgente, soloCodice, EMOJI } from './banco.mjs';
import { MODULI as REGISTRO, AREE } from '../nucleo/registro.js';

const e = esiti('CONTRATTO — le regole comuni a tutti i moduli');
const chiavi = elencoModuli();

e.prova('esiste almeno un modulo', () => deve(chiavi.length > 0, 'la cartella moduli/ è vuota'));

/* ── Registro e file devono coincidere ────────────────────────────────────
   Il menu è un elenco a parte (per non caricare tutti i moduli all'avvio):
   il prezzo è che può divergere. Questa prova è quel prezzo che si paga. */
e.prova('ogni voce del menu ha il suo file', () => {
  const senza = REGISTRO.filter(v => !chiavi.includes(v.chiave)).map(v => v.chiave);
  deve(!senza.length, 'nel menu ma senza file: ' + senza.join(', '));
});
e.prova('ogni file è nel menu', () => {
  const fuori = chiavi.filter(k => !REGISTRO.some(v => v.chiave === k));
  deve(!fuori.length, 'file senza voce di menu (irraggiungibili): ' + fuori.join(', '));
});
e.prova('ogni voce sta in un\'area dichiarata', () => {
  const brutte = REGISTRO.filter(v => !AREE.some(a => a.nome === v.area)).map(v => v.chiave + '→' + v.area);
  deve(!brutte.length, 'aree inesistenti: ' + brutte.join(', '));
});
e.prova('nessuna chiave doppia', () => {
  const viste = new Set(), doppie = [];
  REGISTRO.forEach(v => { if (viste.has(v.chiave)) doppie.push(v.chiave); viste.add(v.chiave); });
  deve(!doppie.length, 'chiavi ripetute: ' + doppie.join(', '));
});

for (const chiave of chiavi) {
  const src = sorgente(chiave);
  const codice = soloCodice(src);
  const voce = REGISTRO.find(v => v.chiave === chiave);

  await e.provaAsync(`${chiave}: esporta meta e monta`, async () => {
    const m = await import('../moduli/' + chiave + '.js');
    deve(m.meta && typeof m.meta === 'object', 'manca export const meta');
    deve(typeof m.monta === 'function', 'manca export function monta');
    for (const campo of ['chiave', 'titolo', 'sottotitolo', 'icona', 'area']) {
      deve(m.meta[campo], 'meta.' + campo + ' mancante');
    }
    deve(m.meta.chiave === chiave, `meta.chiave è «${m.meta.chiave}» ma il file si chiama «${chiave}.js»`);
    deve('permesso' in m.meta, 'meta.permesso va dichiarato, anche se è null');
    deve(m.smonta === undefined || typeof m.smonta === 'function', 'smonta, se c\'è, dev\'essere una funzione');
  });

  await e.provaAsync(`${chiave}: meta e menu dicono la stessa cosa`, async () => {
    const m = await import('../moduli/' + chiave + '.js');
    for (const campo of ['titolo', 'sottotitolo', 'icona', 'area', 'permesso']) {
      deve(m.meta[campo] === voce[campo],
        `${campo}: il modulo dice «${m.meta[campo]}», il menu dice «${voce[campo]}»`);
    }
  });

  e.prova(`${chiave}: nessuna emoji nell'interfaccia`, () =>
    deve(!EMOJI.test(src), 'trovata un\'emoji: si usano le icone Tabler (CONTRATTO §2.5)'));

  e.prova(`${chiave}: non parla da solo con l'esterno`, () =>
    deve(!/\bfetch\s*\(/.test(codice), 'chiama fetch() direttamente: si passa da ctx.api (CONTRATTO §5)'));

  e.prova(`${chiave}: non apre un secondo collegamento al database`, () =>
    deve(!/createClient\s*\(/.test(codice),
      'crea un altro client Supabase: due client = due sessioni che si rubano il token'));

  e.prova(`${chiave}: nessuna chiave o segreto scritto dentro`, () => {
    deve(!/eyJ[A-Za-z0-9_-]{20,}/.test(src), 'sembra esserci un token JWT scritto nel codice');
    deve(!/(api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]{8,}/i.test(codice), 'sembra esserci una credenziale in chiaro');
  });

  e.prova(`${chiave}: i nomi sono in italiano`, () => {
    const inglese = codice.match(
      /\b(?:function|const|let|var)\s+(get|set|load|render|update|create|handle|fetch|build|show|hide|delete|save)[A-Z][A-Za-z]*/g);
    deve(!inglese, 'nomi in inglese: ' + (inglese || []).join(', ') + ' (CONTRATTO §2.1)');
  });

  e.prova(`${chiave}: il testo che arriva dal database viene ripulito`, () => {
    if (!/innerHTML|insertAdjacentHTML/.test(codice)) return;         // non costruisce HTML: niente da ripulire
    deve(/\besc\s*\(|fmt\.esc\s*\(/.test(codice),
      'costruisce HTML senza usare esc(): un nominativo con un < romperebbe la pagina');
  });

  e.prova(`${chiave}: se mostra un elenco, si può esportare`, () => {
    if (!/ui\.tabella\s*\(/.test(codice)) return;
    deve(/ui\.esporta\s*\(/.test(codice),
      'ha un elenco ma non l\'esportazione: qualcuno lo ricopierebbe a mano (CONTRATTO §6)');
  });

  e.prova(`${chiave}: è spiegato`, () =>
    deve(/\/\*[\s\S]{120,}?\*\//.test(src), 'manca il commento in testa che dice che cosa fa e perché'));
}

process.exit(e.stampa() === 0 ? 0 : 1);
