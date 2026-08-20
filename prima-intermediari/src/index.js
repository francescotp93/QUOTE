// ---------------------------------------------------------------------
// Orchestratore: sessione -> fetch segmentato -> normalizzazione -> Supabase
// ---------------------------------------------------------------------
import fs from 'node:fs';
import { PRIMA, STATUSES, PRODUCT_TYPES, sleep, log } from './config.js';
import { cookieHeaderFromState, graphqlWithRetry, AuthRequiredError } from './client.js';
import { searchSavesQuery, HEALTHCHECK_QUERY } from './queries.js';
import { normalize } from './normalize.js';
import { login } from './auth.js';
import { client, startRun, finishRun, upsertPreventivi } from './supabase.js';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const PROBE = argv.includes('--probe');

/** Garantisce un cookie valido, ritentando un re-login automatico se serve. */
async function ensureSession() {
  const tryCookie = async () => {
    const cookie = cookieHeaderFromState();
    await graphqlWithRetry(HEALTHCHECK_QUERY, { cookie, timeoutMs: 60000, label: 'healthcheck' }, 2);
    return cookie;
  };

  try {
    const cookie = await tryCookie();
    log('Sessione valida.');
    return cookie;
  } catch (e) {
    if (!(e instanceof AuthRequiredError)) throw e;
    log(`Sessione non valida (${e.message}). Provo il re-login automatico…`);
    await login({ interactive: false }); // fallisce se serve l'OTP
    const cookie = await tryCookie();
    log('Re-login automatico riuscito.');
    return cookie;
  }
}

/**
 * Scarica un segmento (status x productType).
 * `limit` va inteso come "almeno": il server restituisce min(2L, L+10).
 * Se il segmento risulta saturo rilanciamo con limite doppio, cosi' non
 * perdiamo silenziosamente la coda del dataset.
 */
async function fetchSegment(cookie, status, productType, limit) {
  const label = `${status}/${productType}`;
  let current = limit;

  for (let round = 0; round < 3; round++) {
    const q = searchSavesQuery({ status, productType, limit: current });
    const { data, ms } = await graphqlWithRetry(q, { cookie, label });
    const items = data?.searchSavesNew ?? [];
    const saturo = items.length >= Math.min(current * 2, current + 10);

    log(`  ${label.padEnd(28)} ${String(items.length).padStart(5)} record  (${(ms / 1000).toFixed(1)}s, limit ${current})`);

    if (!saturo) return { items, label, limit: current, saturated: false };

    log(`  ${label}: segmento saturo, rilancio con limit ${current * 2}`);
    current *= 2;
    await sleep(PRIMA.delayMs);
  }

  const q = searchSavesQuery({ status, productType, limit: current });
  const { data } = await graphqlWithRetry(q, { cookie, label });
  return { items: data?.searchSavesNew ?? [], label, limit: current, saturated: true };
}

async function main() {
  const t0 = Date.now();
  log('=== Prima Intermediari -> Supabase :: estrazione preventivi ===');

  const cookie = await ensureSession();

  if (PROBE) {
    const { data } = await graphqlWithRetry(HEALTHCHECK_QUERY, { cookie });
    log('Probe OK:', JSON.stringify(data));
    return;
  }

  const sb = DRY ? null : client();
  const runId = DRY ? null : await startRun(sb);

  const byUuid = new Map();
  const segments = [];
  let hadFailure = false;

  try {
    for (const status of STATUSES) {
      for (const productType of PRODUCT_TYPES) {
        try {
          const seg = await fetchSegment(cookie, status, productType, PRIMA.limit);
          for (const it of seg.items) byUuid.set(it.uuid, it); // dedup cross-segmento
          segments.push({ segment: seg.label, count: seg.items.length, saturated: seg.saturated, ok: true });
        } catch (e) {
          if (e instanceof AuthRequiredError) throw e;
          hadFailure = true;
          log(`  ! ${status}/${productType} FALLITO: ${e.message}`);
          segments.push({ segment: `${status}/${productType}`, ok: false, error: e.message });
        }
        await sleep(PRIMA.delayMs);
      }
    }

    const rows = [...byUuid.values()].map(normalize);
    log(`Totale preventivi unici: ${rows.length}`);

    if (DRY) {
      const out = 'preventivi-dry-run.json';
      fs.writeFileSync(out, JSON.stringify(rows, null, 2));
      log(`DRY RUN: nessuna scrittura su Supabase. Dump in ${out}`);
      summary(rows);
      return;
    }

    const stats = await upsertPreventivi(sb, rows);
    log(`Supabase -> nuovi: ${stats.inserted} | aggiornati: ${stats.updated} | invariati: ${stats.unchanged}`);
    summary(rows);

    await finishRun(sb, runId, {
      status: hadFailure ? 'partial' : 'success',
      rows_fetched: rows.length,
      rows_inserted: stats.inserted,
      rows_updated: stats.updated,
      rows_unchanged: stats.unchanged,
      segments,
      duration_ms: Date.now() - t0,
    });
  } catch (e) {
    if (!DRY && runId) {
      await finishRun(sb, runId, {
        status: e instanceof AuthRequiredError ? 'auth_required' : 'failed',
        error: e.message,
        segments,
        duration_ms: Date.now() - t0,
      });
    }
    throw e;
  }

  log(`Completato in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function summary(rows) {
  const by = (k) => rows.reduce((a, r) => ((a[r[k] ?? 'n/d'] = (a[r[k] ?? 'n/d'] || 0) + 1), a), {});
  log('  per status :', JSON.stringify(by('status')));
  log('  per ramo   :', JSON.stringify(by('product_type')));
  log('  per tipo   :', JSON.stringify(by('quote_type')));
  const conPremio = rows.filter((r) => r.premium_legal != null);
  if (conPremio.length) {
    const tot = conPremio.reduce((a, r) => a + r.premium_legal, 0);
    log(`  premio medio: € ${(tot / conPremio.length).toFixed(2)} su ${conPremio.length} preventivi valorizzati`);
  }
}

main().catch((e) => {
  console.error('\nERRORE:', e.message);
  if (e instanceof AuthRequiredError) {
    console.error('\n>>> Serve un login interattivo con OTP: esegui `npm run login`\n');
    process.exit(2);
  }
  process.exit(1);
});
