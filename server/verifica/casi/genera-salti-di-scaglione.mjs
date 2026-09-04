/* Genera il caso documentato dei salti di scaglione, che sta accanto a questo
   file. NON si scrive a mano: lo produce il motore, e una prova controlla che
   il documento nel repository sia ancora quello che il motore produce oggi.
   Un materiale di formazione che invecchia in silenzio insegna cose false.

   Per rigenerarlo:  node server/verifica/casi/genera-salti-di-scaglione.mjs   */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const QUI = path.dirname(fileURLToPath(import.meta.url));
const P = require(path.join(QUI, '../../../tariffe/motore/previdenza.js'));

const VERSAMENTO = 2400;          // 200 € al mese
const e = (n) => Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' });
const pct = (n, d = 1) => (n * 100).toFixed(d).replace('.', ',') + '%';

/* Il lordo al quale, per una gestione, il versamento fa scavalcare la soglia
   del primo scaglione. Si cerca sul lordo perche' e' quello che il
   collaboratore ha davanti: l'imponibile lo scopre dopo. */
function fasciaDelSalto(gestione) {
  let da = null, a = null;
  for (let lordo = 10000; lordo <= 150000; lordo += 100) {
    const r = P.risparmioDaDeduzione(lordo, VERSAMENTO, gestione);
    const salta = P.aliquotaMarginale(r.senza.imponibile) > P.aliquotaMarginale(r.con.imponibile);
    if (salta && da === null) da = lordo;
    if (salta) a = lordo;
    if (!salta && da !== null) break;
  }
  if (da === null) return null;
  const centro = Math.round((da + a) / 2 / 100) * 100;
  return { da, a, lordo: centro, r: P.risparmioDaDeduzione(centro, VERSAMENTO, gestione) };
}

export function documento() {
  const g = P.FISCO.gestioni;
  const esposte = Object.keys(g).filter((k) => g[k].esposta);
  const righe = [];

  righe.push('# I salti di scaglione, regime per regime');
  righe.push('');
  righe.push('> Materiale di formazione. **Non si modifica a mano**: lo produce il motore.');
  righe.push('> Per rigenerarlo: `node server/verifica/casi/genera-salti-di-scaglione.mjs`');
  righe.push('> Una prova in `server/verifica/irpef-previdenza.test.mjs` controlla che sia');
  righe.push('> ancora quello che il motore produce oggi.');
  righe.push('');
  righe.push('Regole di calcolo versione **' + P.VERSIONE_REGOLE + '**.');
  righe.push('');
  righe.push('## La cosa da capire');
  righe.push('');
  righe.push('Gli scaglioni IRPEF si applicano all\'**imponibile**, non al lordo. E');
  righe.push('l\'imponibile è il lordo meno i contributi **a carico del lavoratore**, che');
  righe.push('cambiano moltissimo da un regime all\'altro: nove punti per un dipendente,');
  righe.push('ventisei per un professionista con partita IVA.');
  righe.push('');
  righe.push('Conseguenza pratica: **a parità di lordo, due clienti stanno in scaglioni');
  righe.push('diversi**, e lo stesso versamento al fondo rende cifre diverse.');
  righe.push('');
  righe.push('## A che lordo il versamento fa scavalcare la soglia');
  righe.push('');
  righe.push('Con un versamento di **' + e(VERSAMENTO) + ' € l\'anno** (200 € al mese).');
  righe.push('');
  righe.push('| Regime | A carico | Fascia del salto (lordo) | Esempio al centro | Imponibile | Dopo il versamento | Risparmio | Aliquota effettiva |');
  righe.push('|---|---|---|---|---|---|---|---|');
  for (const k of esposte) {
    const s = fasciaDelSalto(k);
    if (!s) { righe.push('| ' + g[k].etichetta + ' | ' + pct(g[k].aCarico, 2) + ' | — | — | — | — | — | — |'); continue; }
    righe.push('| ' + g[k].etichetta + ' | ' + pct(g[k].aCarico, 2) + ' | da **' + e(s.da) + '** a **' + e(s.a) + ' €** | ' +
      e(s.lordo) + ' € | ' + e(s.r.senza.imponibile) + ' € | ' + e(s.r.con.imponibile) + ' € | ' +
      e(s.r.risparmio) + ' € | **' + pct(s.r.aliquotaEffettiva) + '** |');
  }
  righe.push('');
  righe.push('L\'aliquota effettiva in quella riga **non è né 23% né 33%**: il beneficio si');
  righe.push('spezza fra i due scaglioni, e una sola aliquota non può dirlo.');
  righe.push('');
  righe.push('## Lo stesso lordo, sei regimi');
  righe.push('');
  for (const lordo of [30000, 45000]) {
    righe.push('### ' + e(lordo) + ' € lordi, versamento 200 €/mese');
    righe.push('');
    righe.push('| Regime | Imponibile | Detrazioni | IRPEF senza | IRPEF con | Risparmio | Aliquota effettiva |');
    righe.push('|---|---|---|---|---|---|---|');
    for (const k of esposte) {
      const r = P.risparmioDaDeduzione(lordo, VERSAMENTO, k);
      righe.push('| ' + g[k].etichetta + ' | ' + e(r.senza.imponibile) + ' € | ' + e(r.senza.detrazione) +
        ' € | ' + e(r.senza.dovutoNetto) + ' € | ' + e(r.con.dovutoNetto) + ' € | ' + e(r.risparmio) +
        ' € | ' + pct(r.aliquotaEffettiva) + ' |');
    }
    righe.push('');
  }
  righe.push('## Due cose da spiegare al cliente');
  righe.push('');
  righe.push('**Il collaboratore paga meno tasse di un artigiano su un imponibile più alto.**');
  righe.push('Non è un errore: il suo reddito è assimilato a lavoro dipendente, quindi gli');
  righe.push('spetta la detrazione dell\'art. 13 comma 1, molto più alta di quella da lavoro');
  righe.push('autonomo del comma 5.');
  righe.push('');
  righe.push('**Il professionista arriva al salto molto più tardi.** A parità di lordo sta in');
  righe.push('uno scaglione più basso del dipendente, perché ventisei punti di contributi');
  righe.push('escono prima. Lo stesso versamento gli rende meno, e più a lungo.');
  righe.push('');
  return righe.join('\n') + '\n';
}

if (process.argv[1] && process.argv[1].endsWith('genera-salti-di-scaglione.mjs')) {
  const dove = path.join(QUI, 'salti-di-scaglione.md');
  fs.writeFileSync(dove, documento(), 'utf8');
  console.log('scritto: ' + dove);
}
