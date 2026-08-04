// ═══════════════════════════════════════════════════════════════════════════════
//  VIGILANZA FONTI — il guardiano che tiene vive le sessioni delle compagnie
//
//  IL PROBLEMA CHE RISOLVE
//    Le sessioni sui portali scadono da sole (inattività, riavvii, scadenza lato
//    compagnia). Finora ce ne accorgevamo solo quando un collaboratore provava a
//    quotare e la compagnia rispondeva "non loggato": il preventivo saltava e il
//    cliente aspettava. Nessuno veniva avvisato.
//
//  COSA FA
//    Ogni pochi minuti chiede a tutti i servizi come stanno (tutti insieme, sonda
//    parallela). Poi:
//      • se un servizio è acceso, ha le credenziali e NON è loggato → prova a
//        rientrare da solo (solo se l'auto-accesso è abilitato);
//      • se una fonte passa da funzionante a non funzionante → manda una email;
//      • quando torna a posto → manda l'email di rientro.
//
//  PRUDENZA (importante: qui si tocca l'accesso a portali veri)
//    - L'auto-accesso è SPENTO di default: si accende con FONTI_AUTOLOGIN=1.
//      Un ciclo di tentativi ripetuti può far bloccare l'utenza in agenzia.
//    - Fra due tentativi sulla stessa fonte passano almeno 15 minuti.
//    - Dopo 4 fallimenti consecutivi la fonte viene "messa in quarantena": niente
//      più tentativi automatici finché non si interviene a mano (o passano 6 ore).
//    - Se il servizio dichiara di non riuscire a leggere le credenziali
//      (chiave di cifratura disallineata) NON si tenta nemmeno: sarebbe un
//      tentativo a vuoto ripetuto all'infinito. Si avvisa e basta.
// ═══════════════════════════════════════════════════════════════════════════════
import { Router } from 'express';
import { elencoFontiTecnico } from './fonti.js';
import fs from 'fs';
import { sondaTutte, invalidaSonda, statoInterruttori } from './fontiSonda.js';

// Lettura numerica delle variabili d'ambiente: "0" è un valore valido (es. nessuna
// pausa fra i tentativi), quindi non si può usare `Number(x) || default`.
const num = (v, def) => { const n = Number(v); return Number.isFinite(n) && v !== '' && v != null ? n : def; };

const ATTIVA = process.env.FONTI_VIGILANZA !== '0';                 // monitoraggio: acceso di default
const AUTOLOGIN = process.env.FONTI_AUTOLOGIN === '1';              // rientro automatico: spento di default
const OGNI_MS = num(process.env.FONTI_VIGILANZA_MS, 5 * 60 * 1000);
const PAUSA_TENTATIVI_MS = num(process.env.FONTI_AUTOLOGIN_PAUSA_MS, 15 * 60 * 1000);
const MAX_TENTATIVI = num(process.env.FONTI_AUTOLOGIN_MAX, 4);
const QUARANTENA_MS = num(process.env.FONTI_AUTOLOGIN_QUARANTENA_MS, 6 * 60 * 60 * 1000);
const LOGIN_TIMEOUT_MS = num(process.env.FONTI_AUTOLOGIN_TIMEOUT_MS, 120000);
const DESTINATARI = (process.env.FONTI_ALERT_EMAIL || process.env.SUPER_ADMIN_EMAIL || 'francesco.oddo199307@gmail.com')
  .split(',').map(s => s.trim()).filter(Boolean);

const log = (...a) => console.log('[vigilanza-fonti]', ...a);

/* Quante osservazioni di fila servono prima di ANNUNCIARE un cambiamento.
   Con 1 (com'era) una fonte che oscilla — cade, rientra, ricade — manda due
   mail a ogni giro: e' esattamente quello che riempiva la casella. Con 2, un
   singolo controllo storto non fa partire niente: deve confermarsi. */
const CONFERME = num(process.env.FONTI_VIGILANZA_CONFERME, 2);

/* Memoria per fonte. Dal 04/08/2026 finisce SU DISCO.
   Prima viveva solo in RAM, e ogni riavvio del backend la cancellava. Il
   backend si riavvia a ogni rilascio che tocca server/ — cioe' spesso. Dopo un
   riavvio una fonte gia' caduta risultava «mai vista»: la caduta non veniva
   piu' segnalata, ma il RIENTRO si', e arrivava un «tornata operativa» per
   qualcosa che non era mai stato annunciato come caduto. Una mail dal nulla,
   ogni volta.
   { salute:'ok'|'ko'|null, dettoSalute: lo stato GIA' comunicato per posta,
     conferme:number, tentativi, ultimoTentativo, quarantenaFinoA, dettaQuarantena:bool,
     ultimoEsito, ultimoControllo, dal } */
const STORE = process.env.FONTI_VIGILANZA_STORE
  || new URL('./fontiWatchdog.store.json', import.meta.url).pathname;

const nuovo = () => ({ salute: null, dettoSalute: null, conferme: 0, tentativi: 0, ultimoTentativo: 0,
                       quarantenaFinoA: 0, dettaQuarantena: false, ultimoEsito: '', ultimoControllo: 0, dal: 0 });
const MEM = new Map();
try {
  const grezzo = fs.readFileSync(STORE, 'utf8');
  for (const [id, m] of Object.entries(JSON.parse(grezzo) || {})) MEM.set(id, Object.assign(nuovo(), m));
  log('memoria ripresa da disco:', MEM.size, 'fonti');
} catch { /* prima accensione, o file illeggibile: si riparte da zero */ }

const mem = id => { let m = MEM.get(id); if (!m) { m = nuovo(); MEM.set(id, m); } return m; };

/* Salvare non deve mai far cadere un giro di controllo: se il disco e' pieno o
   il file non e' scrivibile, si perde la memoria — non la vigilanza. */
function salvaMemoria() {
  try { fs.writeFileSync(STORE, JSON.stringify(Object.fromEntries(MEM), null, 1)); }
  catch (e) { log('memoria non salvata:', e.message); }
}

let girata = 0;
let ultimaGirata = null;
let timer = null;

async function avvisa(oggetto, righe) {
  try {
    const { sendBrevo } = await import('./notify.js');
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#2b3346;line-height:1.6">
      <h2 style="margin:0 0 10px;font-size:18px">${oggetto}</h2>
      <ul style="padding-left:18px">${righe.map(r => '<li>' + r + '</li>').join('')}</ul>
      <p style="color:#8b93a7;font-size:12px;margin-top:18px">Vigilanza automatica del Pannello Fonti · QUOTO</p>
    </div>`;
    await sendBrevo(DESTINATARI, '[QUOTO] ' + oggetto, html);
    log('email inviata a', DESTINATARI.join(', '));
  } catch (e) { log('email non inviata:', e.message); }
}

// Chiede allo scraper di rientrare. Ritorna true se dice di essere dentro.
//
// ATTENZIONE — due generazioni di scraper convivono:
//   • i vecchi (24H, Italiana, …) tengono aperta la chiamata a /login finché non
//     hanno finito, e rispondono {ok:true|false};
//   • i nuovi "guidati" (AXA, HDI, …) rispondono SUBITO {running:true, step:'avvio'}
//     e proseguono in background. Leggere solo il loro ok immediato li avrebbe
//     contati sempre come falliti → 4 fallimenti finti → quarantena a torto.
// Quindi: se la risposta parla di uno "step", seguiamo /loginstate fino alla fine.
const PASSI_FINITI = /^(loggato|non_loggato|senza_credenziali|attesa_codice|attesa_otp|timeout_otp|errore|error|pronto)$/i;
async function chiediScraper(surl, path, ms) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(surl + path, { signal: ctrl.signal }); return await r.json().catch(() => ({})); }
  finally { clearTimeout(to); }
}
async function tentaRientro(surl) {
  try {
    let d = await chiediScraper(surl, '/login', LOGIN_TIMEOUT_MS);
    if (d && d.ok) return true;
    if (!d || !d.step) return false;                    // scraper vecchio: ok:false è definitivo
    const scadenza = Date.now() + LOGIN_TIMEOUT_MS;
    while (Date.now() < scadenza) {
      await new Promise(r => setTimeout(r, 3000));
      let s = null;
      try { s = await chiediScraper(surl, '/loginstate', 8000); } catch { s = null; }
      if (!s || !s.step) continue;
      d = s;
      if (!s.running && PASSI_FINITI.test(s.step)) break;
    }
    return /^loggato$/i.test(String(d.step || ''));
  } catch { return false; }
  finally { invalidaSonda(surl); }
}

export async function giroDiControllo({ conRientro = AUTOLOGIN } = {}) {
  const fonti = elencoFontiTecnico().filter(f => f.attiva && f.surl);
  const sonde = await sondaTutte(fonti.map(f => ({ id: f.id, surl: f.surl })), { forza: true });
  const ora = Date.now();
  const caduti = [], rientrati = [], azioni = [];

  for (const f of fonti) {
    const r = sonde.get(f.id);
    const d = r && r.ok ? r.dati : null;
    const m = mem(f.id);
    m.ultimoControllo = ora;

    // "in salute" = servizio raggiungibile E sessione viva sul portale.
    // Per il 24H lo stato loggato si deduce dalla pagina corrente.
    let loggato = d ? (d.loggato != null ? !!d.loggato : !/login\.24hassistance/i.test(d.url || '')) : false;
    const sano = !!(r && r.ok) && loggato;

    // Credenziali illeggibili dallo scraper: tentare sarebbe inutile e infinito.
    const credenzialiIllegibili = !!(d && d.ha_credenziali === false && f.ha_credenziali);

    if (sano) {
      m.conferme = (m.salute === 'ok') ? m.conferme : 1 + (m.salute === 'ok-forse' ? m.conferme : 0);
      if (m.salute !== 'ok') m.dal = m.dal || ora;
      m.salute = 'ok'; m.tentativi = 0; m.quarantenaFinoA = 0; m.dettaQuarantena = false; m.ultimoEsito = 'ok';
      /* Si annuncia il rientro solo se avevamo DETTO che era caduta, e solo dopo
         che si e' confermata: altrimenti una fonte che lampeggia manda un
         «tornata operativa» a ogni giro. */
      if (m.dettoSalute === 'ko' && m.conferme >= CONFERME) {
        rientrati.push(f.nome); m.dettoSalute = 'ok'; m.dal = ora;
      }
      continue;
    }

    // Non sano. La caduta si annuncia UNA volta sola, e solo dopo conferma.
    if (m.salute !== 'ko') { m.dal = ora; m.conferme = 1; } else { m.conferme++; }
    m.salute = 'ko';
    /* `dettoSalute` e' lo stato che abbiamo GIA' comunicato per posta: e' quello
       che impedisce di ripetere lo stesso allarme all'infinito. Vive su disco,
       quindi un riavvio del backend non lo dimentica. */
    if (m.dettoSalute !== 'ko' && m.conferme >= CONFERME) {
      caduti.push(f.nome + (r && r.ok ? ' (sessione scaduta)' : ' (servizio non risponde)'));
      m.dettoSalute = 'ko';
    }

    if (credenzialiIllegibili) {
      m.ultimoEsito = 'credenziali_non_leggibili';
      azioni.push({ fonte: f.nome, azione: 'nessuna', motivo: 'lo scraper non riesce a decifrare le credenziali (chiave disallineata)' });
      continue;
    }
    if (!conRientro) { m.ultimoEsito = 'rientro_disabilitato'; continue; }
    if (!(r && r.ok)) { m.ultimoEsito = 'servizio_spento'; continue; }        // spento: il rientro non c'entra
    if (!f.ha_credenziali) { m.ultimoEsito = 'senza_credenziali'; continue; }
    if (m.quarantenaFinoA > ora) { m.ultimoEsito = 'in_quarantena'; continue; }
    if (ora - m.ultimoTentativo < PAUSA_TENTATIVI_MS) { m.ultimoEsito = 'attesa_fra_tentativi'; continue; }

    m.ultimoTentativo = ora; m.tentativi++;
    const dentro = await tentaRientro(f.surl);
    if (dentro) {
      m.salute = 'ok'; m.tentativi = 0; m.ultimoEsito = 'rientrato_da_solo'; m.dal = ora;
      rientrati.push(f.nome + ' (rientro automatico)');
      azioni.push({ fonte: f.nome, azione: 'rientro', esito: 'riuscito' });
    } else {
      m.ultimoEsito = 'rientro_fallito';
      azioni.push({ fonte: f.nome, azione: 'rientro', esito: 'fallito', tentativo: m.tentativi });
      if (m.tentativi >= MAX_TENTATIVI) {
        m.quarantenaFinoA = ora + QUARANTENA_MS;
        /* Una volta sola per quarantena. Prima: finita la quarantena il contatore
           restava sopra la soglia, quindi il primo fallimento successivo faceva
           ripartire l'avviso, e cosi' a ogni ciclo. */
        if (!m.dettaQuarantena) {
          caduti.push(f.nome + ' — ' + MAX_TENTATIVI + ' tentativi falliti, serve un accesso manuale');
          m.dettaQuarantena = true;
        }
      }
    }
  }

  girata++;
  ultimaGirata = { il: new Date(ora).toISOString(), controllate: fonti.length, caduti, rientrati, azioni };
  salvaMemoria();
  /* UNA mail per giro, non due. Se nello stesso momento una fonte cade e
     un'altra rientra, sono due fatti dello stesso momento: leggerli in due
     messaggi separati costringe a ricostruire da soli che cos'e' successo. */
  if (caduti.length || rientrati.length) {
    const righe = [
      ...caduti.map(c => '&#9888; <b>' + c + '</b>'),
      ...rientrati.map(r => '&#10003; ' + r + ' — tornata operativa'),
    ];
    const oggetto = caduti.length
      ? (caduti.length === 1 ? 'Una fonte non è disponibile' : caduti.length + ' fonti non disponibili')
      : (rientrati.length === 1 ? 'Fonte tornata operativa' : 'Fonti tornate operative');
    await avvisa(oggetto, righe);
  }
  log('giro', girata, '· controllate', fonti.length, '· cadute', caduti.length, '· rientrate', rientrati.length);
  return ultimaGirata;
}

export function startFontiWatchdog() {
  if (!ATTIVA) { log('disattivata (FONTI_VIGILANZA=0)'); return; }
  log('attiva · controllo ogni', Math.round(OGNI_MS / 60000), 'min · rientro automatico:', AUTOLOGIN ? 'SÌ' : 'no (FONTI_AUTOLOGIN=1 per abilitarlo)');
  const giro = async () => { try { await giroDiControllo(); } catch (e) { log('errore:', e.message); } };
  setTimeout(giro, 30000);                    // primo giro poco dopo l'avvio
  timer = setInterval(giro, OGNI_MS);
  if (timer.unref) timer.unref();
}

// ── Endpoint di controllo (montato su /fonti/vigilanza, solo Super Admin) ───────
export const vigilanzaRouter = Router();
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'francesco.oddo199307@gmail.com').toLowerCase();
vigilanzaRouter.use((req, res, next) => {
  if ((req.user && req.user.email) !== SUPER_ADMIN_EMAIL) return res.status(403).json({ error: 'Riservato al Super Admin.' });
  next();
});
vigilanzaRouter.get('/', (req, res) => {
  const fonti = {};
  for (const [id, m] of MEM.entries()) {
    fonti[id] = {
      salute: m.salute, dallo: m.dal ? new Date(m.dal).toISOString() : null,
      ultimo_controllo: m.ultimoControllo ? new Date(m.ultimoControllo).toISOString() : null,
      ultimo_esito: m.ultimoEsito || null, tentativi_consecutivi: m.tentativi,
      in_quarantena: m.quarantenaFinoA > Date.now(),
    };
  }
  res.json({
    ok: true, attiva: ATTIVA, rientro_automatico: AUTOLOGIN,
    ogni_minuti: Math.round(OGNI_MS / 60000), giri_fatti: girata,
    ultimo_giro: ultimaGirata, fonti, interruttori: statoInterruttori(),
    avvisi_a: DESTINATARI,
  });
});
// Giro immediato a richiesta (utile dal pannello, senza aspettare il timer).
vigilanzaRouter.post('/giro', async (req, res) => {
  try { res.json({ ok: true, ...(await giroDiControllo({ conRientro: req.query.rientro === '1' ? true : AUTOLOGIN })) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

export default { startFontiWatchdog, vigilanzaRouter, giroDiControllo };
