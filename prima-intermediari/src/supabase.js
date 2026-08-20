import { createClient } from '@supabase/supabase-js';
import { SUPABASE, log } from './config.js';

export function client() {
  if (!SUPABASE.url || !SUPABASE.key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY mancanti nel .env');
  }
  return createClient(SUPABASE.url, SUPABASE.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function startRun(sb) {
  const { data, error } = await sb
    .from('prima_scrape_runs')
    .insert({ status: 'running' })
    .select('id')
    .single();
  if (error) throw new Error(`Impossibile aprire la run: ${error.message}`);
  return data.id;
}

export async function finishRun(sb, runId, patch) {
  const { error } = await sb
    .from('prima_scrape_runs')
    .update({ finished_at: new Date().toISOString(), ...patch })
    .eq('id', runId);
  if (error) log('ATTENZIONE: non ho potuto chiudere la run:', error.message);
}

/**
 * Upsert idempotente su uuid.
 * Confrontiamo prima i content_hash gia' presenti: se nulla e' cambiato
 * aggiorniamo solo last_seen_at, cosi' updated_at resta un segnale utile
 * ("questo preventivo e' davvero cambiato") e non rumore.
 */
export async function upsertPreventivi(sb, rows, { chunk = 250 } = {}) {
  const stats = { inserted: 0, updated: 0, unchanged: 0 };
  if (!rows.length) return stats;

  const uuids = rows.map((r) => r.uuid);
  const existing = new Map();
  for (let i = 0; i < uuids.length; i += 500) {
    const { data, error } = await sb
      .from('prima_preventivi')
      .select('uuid, content_hash')
      .in('uuid', uuids.slice(i, i + 500));
    if (error) throw new Error(`Lettura esistenti fallita: ${error.message}`);
    for (const r of data) existing.set(r.uuid, r.content_hash);
  }

  const now = new Date().toISOString();
  const toWrite = [];
  const touchOnly = [];

  for (const r of rows) {
    if (!existing.has(r.uuid)) {
      stats.inserted++;
      toWrite.push({ ...r, first_seen_at: now, last_seen_at: now, updated_at: now });
    } else if (existing.get(r.uuid) !== r.content_hash) {
      stats.updated++;
      toWrite.push({ ...r, last_seen_at: now, updated_at: now });
    } else {
      stats.unchanged++;
      touchOnly.push(r.uuid);
    }
  }

  for (let i = 0; i < toWrite.length; i += chunk) {
    const batch = toWrite.slice(i, i + chunk);
    const { error } = await sb
      .from('prima_preventivi')
      .upsert(batch, { onConflict: 'uuid', ignoreDuplicates: false });
    if (error) throw new Error(`Upsert fallito (batch ${i}): ${error.message}`);
  }

  for (let i = 0; i < touchOnly.length; i += 500) {
    const { error } = await sb
      .from('prima_preventivi')
      .update({ last_seen_at: now })
      .in('uuid', touchOnly.slice(i, i + 500));
    if (error) log('ATTENZIONE: touch last_seen_at fallito:', error.message);
  }

  return stats;
}
