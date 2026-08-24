// ---------------------------------------------------------------------
// Controllo salute della sessione Prima.
//
// Il device trust di Auth0 dura 30 giorni. Il modo peggiore di scoprirlo
// e' a scraper gia' fermo, con tre settimane di dati mancanti.
// Questo script va in cron ogni giorno e avvisa PRIMA.
//
// Exit code:
//   0 = sessione valida e con margine
//   3 = sessione valida ma in scadenza (entro PREAVVISO_GIORNI)
//   2 = sessione non valida: serve `./scripts/login-vnc.sh`
// ---------------------------------------------------------------------
import fs from 'node:fs';
import { STATE_FILE, log } from './config.js';
import { cookieHeaderFromState, graphqlWithRetry, AuthRequiredError } from './client.js';
import { HEALTHCHECK_QUERY } from './queries.js';

const DURATA_TRUST_GIORNI = 30;
const PREAVVISO_GIORNI = Number(process.env.PRIMA_PREAVVISO_GIORNI || 5);

function etaSessione() {
  if (!fs.existsSync(STATE_FILE)) return null;
  const ms = Date.now() - fs.statSync(STATE_FILE).mtimeMs;
  return ms / 86400000;
}

export async function controlla() {
  const eta = etaSessione();
  if (eta === null) {
    return { ok: false, codice: 2, messaggio: 'Nessuna sessione salvata. Esegui ./scripts/login-vnc.sh' };
  }

  const giorniResidui = Math.max(0, DURATA_TRUST_GIORNI - eta);

  // L'eta' del file e' solo una stima: la verita' la dice il portale.
  try {
    const cookie = cookieHeaderFromState();
    await graphqlWithRetry(HEALTHCHECK_QUERY, { cookie, timeoutMs: 60000, label: 'session-check' }, 2);
  } catch (e) {
    if (e instanceof AuthRequiredError) {
      return {
        ok: false, codice: 2,
        messaggio: `Sessione RIFIUTATA dal portale (${e.message}). Serve un nuovo login con OTP.`,
        giorniResidui: 0,
      };
    }
    // Errore di rete o backend lento: non e' un problema di sessione.
    return {
      ok: true, codice: 0,
      messaggio: `Portale non raggiungibile (${e.message}). Sessione non verificata, riprovo domani.`,
      giorniResidui,
    };
  }

  if (giorniResidui <= PREAVVISO_GIORNI) {
    return {
      ok: true, codice: 3,
      messaggio: `Sessione valida ma scade fra ~${giorniResidui.toFixed(1)} giorni. Pianifica il rinnovo.`,
      giorniResidui,
    };
  }

  return {
    ok: true, codice: 0,
    messaggio: `Sessione valida. Rinnovo stimato fra ~${giorniResidui.toFixed(1)} giorni.`,
    giorniResidui,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  controlla()
    .then((r) => {
      log(r.messaggio);
      if (r.codice === 3) {
        console.error('\n>>> PREAVVISO: rinnova la sessione con ./scripts/login-vnc.sh\n');
      } else if (r.codice === 2) {
        console.error('\n>>> AZIONE RICHIESTA: ./scripts/login-vnc.sh\n');
      }
      process.exit(r.codice);
    })
    .catch((e) => { console.error('Controllo fallito:', e.message); process.exit(1); });
}
