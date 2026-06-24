// ── Aggancio Lead → IAM ─────────────────────────────────────────────────────────
// Ogni contatto che entra dagli strumenti dell'Hub (landing, pagine WhatsApp, shop
// con invio privacy) viene scritto anche nella tabella iam_lead, così lo si ritrova
// nella sezione Lead di IAM. Usa la service role (bypassa la RLS) per l'inserimento.
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');

// Mappa la "fonte" libera del web sulle voci della tendina Fonte di IAM.
function mappaFonte(raw) {
  const f = String(raw || '').toLowerCase();
  if (f.includes('whats')) return 'WhatsApp';
  if (f.includes('insta')) return 'Instagram';
  if (f.includes('face') || f.includes('meta') || f.includes('fb ') || f === 'fb') return 'Campagna Facebook';
  return 'Sito web';
}

function splitNome(nominativo) {
  const parts = String(nominativo || '').trim().split(/\s+/);
  if (parts.length <= 1) return { nome: parts[0] || '', cognome: '' };
  return { nome: parts.slice(0, -1).join(' '), cognome: parts[parts.length - 1] };
}

// Crea (o aggiorna, se già presente per email/telefono) un lead in IAM.
// Non lancia mai: i fallimenti vengono solo loggati, per non bloccare il flusso principale.
export async function creaLeadIAM({ nome, cognome, nominativo, telefono, email, fonte, campagna, prodotto, note, consenso } = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return;
  const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const tel = String(telefono || '').trim() || null;
  const mail = String(email || '').trim() || null;
  if (!nome && !cognome && nominativo) { const s = splitNome(nominativo); nome = s.nome; cognome = s.cognome; }
  if ((!nome && !cognome) || (!tel && !mail)) return; // dati insufficienti
  try {
    // Dedup: se esiste già un lead con la stessa email o telefono, non duplicare.
    const ors = [];
    if (mail) ors.push(`email.eq.${encodeURIComponent(mail)}`);
    if (tel) ors.push(`telefono.eq.${encodeURIComponent(tel)}`);
    if (ors.length) {
      const q = `${SUPABASE_URL}/rest/v1/iam_lead?select=id&limit=1&or=(${ors.join(',')})`;
      const ex = await fetch(q, { headers: H }).then(r => r.json()).catch(() => []);
      if (Array.isArray(ex) && ex[0]) {
        // Aggiorna solo l'ultimo contatto/nota, lasciando intatto stato e assegnazione.
        await fetch(`${SUPABASE_URL}/rest/v1/iam_lead?id=eq.${encodeURIComponent(ex[0].id)}`, {
          method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({ note: (note || null), aggiornato_il: new Date().toISOString() }),
        });
        return ex[0].id;
      }
    }
    const row = {
      nome: nome || null,
      cognome: cognome || null,
      telefono: tel,
      email: mail,
      fonte: mappaFonte(fonte),
      campagna: campagna || (fonte ? String(fonte).slice(0, 120) : null),
      prodotto: prodotto || null,
      stato: 'nuovo',
      note: note || null,
      consenso: consenso != null ? !!consenso : true,
      utente_id: null, // contatto inbound: non appartiene a un utente finché non viene assegnato
      aggiornato_il: new Date().toISOString(),
    };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/iam_lead`, {
      method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify([row]),
    });
    const ins = await r.json().catch(() => null);
    if (!r.ok) { console.warn('[iamLead] insert →', JSON.stringify(ins).slice(0, 200)); return; }
    return Array.isArray(ins) && ins[0] ? ins[0].id : null;
  } catch (e) { console.warn('[iamLead] errore:', e.message); }
}
