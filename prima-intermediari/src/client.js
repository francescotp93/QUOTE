import fs from 'node:fs';
import { PRIMA, STATE_FILE, log } from './config.js';

export class AuthRequiredError extends Error {
  constructor(msg) { super(msg); this.name = 'AuthRequiredError'; }
}

/** Legge lo storageState di Playwright e ne ricava l'header Cookie. */
export function cookieHeaderFromState(stateFile = STATE_FILE) {
  if (!fs.existsSync(stateFile)) {
    throw new AuthRequiredError(
      `Sessione assente (${stateFile}). Esegui prima: npm run login`
    );
  }
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const cookies = (state.cookies || []).filter((c) =>
    c.domain.endsWith('intermediari.prima.it') || c.domain.endsWith('prima.it')
  );
  if (!cookies.length) throw new AuthRequiredError('Nessun cookie Prima nello state file.');
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * Esegue una query GraphQL contro il portale.
 * Il backend e' lento (45-60s su dataset grandi) e in overload risponde
 * con una pagina HTML di errore invece che con JSON: gestiamo entrambi.
 */
export async function graphql(query, { cookie, timeoutMs = PRIMA.timeoutMs, label = '' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();

  try {
    const res = await fetch(PRIMA.graphql, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: '*/*',
        'accept-language': 'it-IT,it;q=0.9',
        origin: PRIMA.base,
        referer: `${PRIMA.base}/preventivi`,
        'user-agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
        cookie,
      },
      body: JSON.stringify({ query }),
      signal: ctrl.signal,
    });

    const text = await res.text();
    const ms = Date.now() - t0;

    if (res.status === 401 || res.status === 403) {
      throw new AuthRequiredError(`HTTP ${res.status} sul GraphQL: sessione scaduta.`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      // Il portale rimanda l'HTML del login quando il cookie non e' piu' valido,
      // e una pagina di errore quando la query e' troppo pesante.
      if (/login|accedi/i.test(text.slice(0, 2000))) {
        throw new AuthRequiredError('Il GraphQL ha risposto con la pagina di login.');
      }
      const err = new Error(`Risposta non-JSON (HTTP ${res.status}, ${ms}ms) — probabile timeout backend.`);
      err.retryable = true;
      throw err;
    }

    if (json.errors?.length) {
      const msg = json.errors.map((e) => e.message).join(' | ');
      if (/unauthor|not authenticated|forbidden/i.test(msg)) throw new AuthRequiredError(msg);
      throw new Error(`GraphQL error${label ? ` [${label}]` : ''}: ${msg}`);
    }

    return { data: json.data, ms };
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error(`Timeout dopo ${timeoutMs}ms${label ? ` [${label}]` : ''}`);
      err.retryable = true;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Retry con backoff, ma mai su errori di autenticazione. */
export async function graphqlWithRetry(query, opts = {}, attempts = 3) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await graphql(query, opts);
    } catch (e) {
      if (e instanceof AuthRequiredError) throw e;
      last = e;
      if (i < attempts) {
        const wait = 5000 * i;
        log(`  tentativo ${i}/${attempts} fallito (${e.message}). Riprovo tra ${wait / 1000}s`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw last;
}
