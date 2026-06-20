// ── Firma documenti del COLLABORATORE (IAM) con OTP + controfirma dell'agente ─────
//  Flusso:
//   1) L'agente invia un documento al collaboratore   POST /firma-collab/request
//      → OTP via email al collaboratore + link alla pagina di firma.
//   2) Il collaboratore firma:  GET /firma-collab/info  +  POST /firma-collab/verify
//   3) L'agente CONTROFIRMA:    POST /firma-collab/countersign/request  (OTP all'agente)
//                               POST /firma-collab/countersign/verify
//   4) Il documento firmato è archiviato nella tabella iam_firme (anagrafica TEAM).
//  Documenti: privacy_intermediario (generata qui) · mandato/tabella/appendici/…
//             (PDF caricato, referenziato via doc_url).
import { Router } from 'express';
import crypto from 'node:crypto';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
const SELF_URL = (process.env.SELF_URL || 'https://withus-backend-o0ux.onrender.com').replace(/\/$/, '');
const IAM_URL = (process.env.IAM_URL || 'https://iam.withusassicurazioni.it').replace(/\/$/, '');
const STAFF_INBOX = process.env.STAFF_EMAIL || 'intermediari@withusassicurazioni.it';
const NOTIFY_FROM = process.env.NOTIFY_FROM || 'noreply@withusassicurazioni.it';
const NOTIFY_NAME = process.env.NOTIFY_NAME || 'With Us Assicurazioni';
const OTP_TTL_MIN = Number(process.env.OTP_TTL_MIN || 5);

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function genOtp() { return String(crypto.randomInt(0, 1000000)).padStart(6, '0'); }
function genToken() { return crypto.randomBytes(18).toString('base64url'); }
function srvKey() { const k = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata'); return k; }

async function sbGet(path) {
  const key = srvKey();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  return r.json().catch(() => []);
}
async function sbInsert(table, row) {
  const key = srvKey();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  const d = await r.json().catch(() => ([]));
  if (!r.ok) throw new Error('Supabase: ' + (d.message || ('HTTP ' + r.status)));
  return Array.isArray(d) ? d[0] : d;
}
async function sbPatch(table, idCol, idVal, body) {
  const key = srvKey();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${idCol}=eq.${encodeURIComponent(idVal)}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ([]));
  if (!r.ok) throw new Error('Supabase: ' + (d.message || ('HTTP ' + r.status)));
  return Array.isArray(d) ? d[0] : d;
}
async function getFirma(id) { const r = await sbGet(`iam_firme?id=eq.${encodeURIComponent(id)}&select=*`); return Array.isArray(r) ? r[0] : null; }
async function getCollab(teamId) { const r = await sbGet(`iam_team?id=eq.${encodeURIComponent(teamId)}&select=*`); return Array.isArray(r) ? r[0] : null; }

async function sendEmail(to, subject, html) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY non configurata');
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).filter(Boolean))].map((e) => ({ email: e }));
  if (!recipients.length) return { skipped: true };
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: NOTIFY_FROM, name: NOTIFY_NAME }, to: recipients, subject, htmlContent: html }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Brevo: ' + (d.message || ('HTTP ' + r.status)));
  return d;
}
function shell(title, body) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;border:1px solid #e6e8f0;border-radius:14px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#0b1437,#1b2a6b);padding:20px 22px;text-align:center"><img src="https://quoto.withusassicurazioni.it/withus-logo-white.png" alt="With Us" style="height:44px"></div>
    <div style="padding:24px;color:#2b3346;font-size:15px;line-height:1.6"><h2 style="margin:0 0 14px;font-size:19px;color:#1d2740">${title}</h2>${body}</div>
    <div style="padding:14px 24px;background:#f8f9fc;color:#8b93a7;font-size:12px">With Us Soc. Coop. · Email automatica, non rispondere a questo messaggio.</div>
  </div>`;
}

// Tipi di documento gestiti (etichette)
const TIPI = {
  privacy_intermediario: 'Informativa Privacy Intermediario',
  mandato: 'Mandato di collaborazione',
  tabella_provvigionale: 'Tabella provvigionale',
  appendice_mandato: 'Appendice al mandato',
  provvigioni_supplementari: 'Provvigioni supplementari',
  autocertificazione: 'Autocertificazione',
};
function tipoLabel(t, titolo) { return titolo || TIPI[t] || 'Documento'; }

// ── Documento "Privacy Intermediario" (generato) ─────────────────────────────────
function genPrivacyIntermHtml(c, firma) {
  const nome = (((c.cogn || '') + ' ' + (c.nome || '')).trim()) || '—';
  const oggiC = firma.firmato_collab_il ? new Date(firma.firmato_collab_il).toLocaleString('it-IT') : '';
  const oggiA = firma.firmato_agente_il ? new Date(firma.firmato_agente_il).toLocaleString('it-IT') : '';
  const txn = firma.transazione || ('WU-' + sha((firma.token || '') + (firma.creato_il || '')).slice(0, 12).toUpperCase());
  const sig = (label, nm, quando, ip) => `<div class="sbox"><div class="sn">${esc(nm || '—')}</div><div class="sl">${esc(label)}</div>${quando ? `<div class="sa"><b>✓ Firma Elettronica Avanzata (OTP)</b> il <b>${esc(quando)}</b>${ip ? ' · IP ' + esc(ip) : ''}<br>Codice transazione: <b>${esc(txn)}</b></div>` : '<div class="sa" style="color:#999;background:#f5f5f7;border-color:#eee">In attesa di firma</div>'}</div>`;
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Intermediario — ${esc(nome)}</title>
  <style>*{box-sizing:border-box}html,body{margin:0;background:#eceff4;color:#1d2433;font-family:Arial,Helvetica,sans-serif}
  .sheet{max-width:820px;margin:22px auto;background:#fff;border-radius:6px;box-shadow:0 6px 30px rgba(0,0,0,.12);padding:40px 46px}
  .toolbar{max-width:820px;margin:14px auto 0;text-align:right}.toolbar button{background:#1b2a6b;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
  .hd{display:flex;align-items:center;gap:16px;border-bottom:3px solid #1b2a6b;padding-bottom:14px;margin-bottom:20px}.hd img{height:50px}.t{font-size:12px;color:#566}
  h1{font-size:19px;margin:4px 0 2px}.mod{font-size:11px;color:#889}h2{font-size:14px;margin:20px 0 8px;color:#1b2a6b}.small{font-size:12px;color:#445;line-height:1.6}
  table.s{width:100%;border-collapse:collapse;margin:8px 0}table.s td{padding:8px 10px;border:1px solid #dde;font-size:13px}table.s td.lbl{color:#667;font-size:12px;width:38%;background:#f8f9fc}
  .signs{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:30px}.sbox{text-align:center}
  .sn{font-family:'Brush Script MT','Segoe Script',cursive;font-size:30px;color:#11224d;border-bottom:1.5px solid #333;padding-bottom:5px}
  .sl{font-size:11px;color:#778;text-transform:uppercase;letter-spacing:.5px;margin-top:5px}
  .sa{margin-top:10px;font-size:10.5px;color:#1e7d46;background:#e8f7ee;border:1px solid #b6e6c8;border-radius:8px;padding:8px 10px;text-align:left;line-height:1.5}
  .ft{margin-top:22px;font-size:10.5px;color:#99a;text-align:center;border-top:1px solid #eef;padding-top:10px}
  @media print{html,body{background:#fff}.toolbar{display:none}.sheet{box-shadow:none;margin:0;max-width:none;padding:18px}}</style></head><body>
  <div class="toolbar"><button onclick="window.print()">⤓ Scarica / Stampa PDF</button></div>
  <div class="sheet">
    <div class="hd"><img src="https://quoto.withusassicurazioni.it/withus-logo.png" alt="With Us">
      <div><div class="t"><b>WITH US SOCIETA' COOPERATIVA</b> — Intermediario assicurativo</div>
      <div class="t">Vico Giunone 3, 91027 Paceco (TP) · RUI A000747484 · amministrazione@withusassicurazioni.it</div></div></div>
    <h1>Informativa Privacy per il Collaboratore / Intermediario</h1>
    <div class="mod">Reg. UE 2016/679 (GDPR) — artt. 13-14</div>
    <h2>Dati del collaboratore</h2>
    <table class="s">
     <tr><td class="lbl">Cognome e Nome</td><td><b>${esc(nome)}</b></td></tr>
     <tr><td class="lbl">Codice fiscale</td><td>${esc(c.cf || '—')}</td></tr>
     <tr><td class="lbl">N. iscrizione RUI</td><td>${esc(c.rui || '—')}</td></tr>
     <tr><td class="lbl">Email</td><td>${esc(c.email || '—')}</td></tr>
    </table>
    <h2>Informativa</h2>
    <p class="small">Titolare del trattamento: <b>WITH US SOCIETA' COOPERATIVA</b>, Vico Giunone 3, Paceco (TP), email amministrazione@withusassicurazioni.it, PEC withus.coop@pec.it, RUI A000747484, soggetta a controllo IVASS. I dati personali del collaboratore sono trattati per la gestione del rapporto di collaborazione/intermediazione, gli adempimenti contrattuali, fiscali, contributivi e regolamentari (anche IVASS), la corresponsione delle provvigioni e la tenuta della documentazione obbligatoria. Basi giuridiche: artt. 6.1.b) e 6.1.c) GDPR. I dati possono essere comunicati a imprese di assicurazione, intermediari, consulenti, autorità di vigilanza e soggetti che svolgono servizi connessi. Conservazione per la durata del rapporto e per i termini di legge. Il collaboratore può esercitare i diritti di accesso, rettifica, cancellazione, limitazione, opposizione e portabilità (artt. 15-22 GDPR) scrivendo al Titolare, e proporre reclamo al Garante (www.garanteprivacy.it).</p>
    <p class="small">Il sottoscritto dichiara di aver ricevuto e letto la presente informativa e di acconsentire al trattamento dei propri dati per le finalità sopra indicate.</p>
    <div class="signs">
      ${sig('Il Collaboratore', nome, oggiC, firma.ip_collab)}
      ${sig("L'Intermediario (With Us)", 'With Us Soc. Coop.', oggiA, firma.ip_agente)}
    </div>
    <div class="ft">Documento generato elettronicamente da With Us · ${esc(txn)}</div>
  </div></body></html>`;
}

// Documento generico per PDF caricati (mandato, tabella, ecc.): attestazione di firma
function genGenericHtml(c, firma) {
  const nome = (((c.cogn || '') + ' ' + (c.nome || '')).trim()) || '—';
  const titolo = tipoLabel(firma.tipo, firma.titolo);
  const oggiC = firma.firmato_collab_il ? new Date(firma.firmato_collab_il).toLocaleString('it-IT') : '';
  const oggiA = firma.firmato_agente_il ? new Date(firma.firmato_agente_il).toLocaleString('it-IT') : '';
  const txn = firma.transazione || ('WU-' + sha((firma.token || '') + (firma.creato_il || '')).slice(0, 12).toUpperCase());
  const sig = (label, nm, quando, ip) => `<div class="sbox"><div class="sn">${esc(nm || '—')}</div><div class="sl">${esc(label)}</div>${quando ? `<div class="sa"><b>✓ Firma Elettronica Avanzata (OTP)</b> il <b>${esc(quando)}</b>${ip ? ' · IP ' + esc(ip) : ''}<br>Codice transazione: <b>${esc(txn)}</b></div>` : '<div class="sa" style="color:#999;background:#f5f5f7;border-color:#eee">In attesa di firma</div>'}</div>`;
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titolo)} — ${esc(nome)}</title>
  <style>*{box-sizing:border-box}html,body{margin:0;background:#eceff4;color:#1d2433;font-family:Arial,Helvetica,sans-serif}
  .sheet{max-width:820px;margin:22px auto;background:#fff;border-radius:6px;box-shadow:0 6px 30px rgba(0,0,0,.12);padding:40px 46px}
  .toolbar{max-width:820px;margin:14px auto 0;text-align:right}.toolbar button{background:#1b2a6b;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
  .hd{display:flex;align-items:center;gap:16px;border-bottom:3px solid #1b2a6b;padding-bottom:14px;margin-bottom:20px}.hd img{height:50px}.t{font-size:12px;color:#566}
  h1{font-size:19px;margin:4px 0}.small{font-size:12.5px;color:#445;line-height:1.6}
  .src{margin:14px 0;padding:12px 14px;background:#f5f7ff;border:1px solid #e0e6ff;border-radius:10px;font-size:13.5px}
  .signs{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:30px}.sbox{text-align:center}
  .sn{font-family:'Brush Script MT','Segoe Script',cursive;font-size:30px;color:#11224d;border-bottom:1.5px solid #333;padding-bottom:5px}
  .sl{font-size:11px;color:#778;text-transform:uppercase;letter-spacing:.5px;margin-top:5px}
  .sa{margin-top:10px;font-size:10.5px;color:#1e7d46;background:#e8f7ee;border:1px solid #b6e6c8;border-radius:8px;padding:8px 10px;text-align:left;line-height:1.5}
  .ft{margin-top:22px;font-size:10.5px;color:#99a;text-align:center;border-top:1px solid #eef;padding-top:10px}
  @media print{html,body{background:#fff}.toolbar{display:none}.sheet{box-shadow:none;margin:0;max-width:none;padding:18px}}</style></head><body>
  <div class="toolbar"><button onclick="window.print()">⤓ Scarica / Stampa PDF</button></div>
  <div class="sheet">
    <div class="hd"><img src="https://quoto.withusassicurazioni.it/withus-logo.png" alt="With Us">
      <div><div class="t"><b>WITH US SOCIETA' COOPERATIVA</b> — RUI A000747484</div><div class="t">Attestazione di firma elettronica del documento</div></div></div>
    <h1>${esc(titolo)}</h1>
    <p class="small">Documento sottoscritto tra <b>With Us Soc. Coop.</b> e il collaboratore <b>${esc(nome)}</b>${c.rui ? ' (RUI ' + esc(c.rui) + ')' : ''}.</p>
    ${firma.doc_url ? `<div class="src">📄 Documento di riferimento: <a href="${esc(firma.doc_url)}" target="_blank">apri il file</a></div>` : ''}
    <p class="small">Le parti dichiarano di aver letto e accettato il contenuto del documento sopra indicato, che si sottoscrive mediante firma elettronica con codice OTP.</p>
    <div class="signs">
      ${sig('Il Collaboratore', nome, oggiC, firma.ip_collab)}
      ${sig("L'Intermediario (With Us)", 'With Us Soc. Coop.', oggiA, firma.ip_agente)}
    </div>
    <div class="ft">Documento generato elettronicamente da With Us · ${esc(txn)}</div>
  </div></body></html>`;
}
function genDocHtml(c, firma) {
  return firma.tipo === 'privacy_intermediario' ? genPrivacyIntermHtml(c, firma) : genGenericHtml(c, firma);
}

export const firmaCollabRouter = Router(); // protetto (agente)
export const publicFirmaCollab = Router(); // pubblico (collaboratore)

// 1) L'agente invia un documento al collaboratore
firmaCollabRouter.post('/request', async (req, res) => {
  try {
    const { teamId, tipo, titolo, email, docUrl } = req.body || {};
    if (!teamId || !tipo) return res.status(400).json({ error: 'teamId e tipo obbligatori' });
    const c = await getCollab(teamId);
    if (!c) return res.status(404).json({ error: 'collaboratore non trovato' });
    const dest = email || c.email || '';
    if (!dest) return res.status(400).json({ error: "Manca l'email del collaboratore." });
    const otp = genOtp(); const token = genToken();
    const row = await sbInsert('iam_firme', {
      team_id: String(teamId), tipo, titolo: titolo || TIPI[tipo] || 'Documento', email: dest,
      doc_url: docUrl || null, stato: 'inviata', token, otp_hash: sha(otp + ':' + token),
      scadenza: new Date(Date.now() + OTP_TTL_MIN * 60000).toISOString(),
    });
    const link = `${SELF_URL}/firma-collab/page?id=${encodeURIComponent(row.id)}&t=${encodeURIComponent(token)}`;
    await sendEmail(dest, 'Firma documento — With Us', shell('Documento da firmare: ' + tipoLabel(tipo, titolo),
      `<p>Gentile ${esc(((c.cogn || '') + ' ' + (c.nome || '')).trim() || 'Collaboratore')},<br>With Us ti chiede di firmare il documento <b>${esc(tipoLabel(tipo, titolo))}</b>.</p>
       <p style="margin:16px 0 6px">Codice di firma (OTP):</p>
       <div style="font-size:30px;font-weight:900;letter-spacing:8px;color:#1b2a6b;background:#eef2ff;border-radius:12px;padding:14px;text-align:center">${otp}</div>
       <p style="color:#6b7488;font-size:13px">Valido ${OTP_TTL_MIN} minuti.</p>
       <div style="margin-top:16px"><a href="${link}" style="display:inline-block;background:#3b5bfd;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700">Apri e firma il documento</a></div>`));
    res.json({ ok: true, id: row.id, email: dest });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2) Collaboratore: pagina di firma (HTML autonomo)
publicFirmaCollab.get('/page', async (req, res) => {
  const id = String(req.query.id || ''), t = String(req.query.t || '');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Firma documento — With Us</title>
  <style>body{margin:0;font-family:Arial,sans-serif;background:linear-gradient(160deg,#0b1437,#1b2a6b 60%,#3b5bfd);min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:24px 14px}
  .card{background:#fff;border-radius:20px;max-width:460px;width:100%;box-shadow:0 24px 70px rgba(0,0,0,.35);overflow:hidden}
  .hd{background:linear-gradient(135deg,#0b1437,#1b2a6b);text-align:center;padding:20px}.hd img{height:40px}
  .bd{padding:22px 24px}.sum{background:#f5f7fc;border:1px solid #e6e9f2;border-radius:12px;padding:14px;margin-bottom:14px;font-size:14px}
  a.doc{display:block;color:#3b5bfd;text-decoration:none;margin:8px 0;font-weight:600}
  label.cz{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:#3a4254;margin:12px 0;cursor:pointer;line-height:1.5}
  input.otp{width:100%;padding:14px;border:1.5px solid #e6e9f2;border-radius:12px;font-size:24px;letter-spacing:8px;text-align:center;font-weight:800;margin:8px 0}
  .btn{width:100%;padding:15px;border:none;border-radius:13px;background:linear-gradient(135deg,#3b5bfd,#2a45e0);color:#fff;font-weight:800;font-size:16px;cursor:pointer}
  .msg{border-radius:11px;padding:11px 13px;font-size:13.5px;margin:10px 0;display:none}.err{background:#fdecec;color:#c0392b;display:block}.ok{background:#e8f7ee;color:#1e7d46;display:block}
  .center{text-align:center}.muted{color:#6b7488;font-size:13px}</style></head><body>
  <div class="card"><div class="hd"><img src="https://quoto.withusassicurazioni.it/withus-logo-white.png" alt="With Us"></div>
  <div class="bd" id="bd"><div class="center muted">Caricamento…</div></div></div>
  <script>
  var API='${SELF_URL}',ID=${JSON.stringify(id)},T=${JSON.stringify(t)},bd=document.getElementById('bd');
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function msg(t,ok){bd.querySelector('#m').className='msg '+(ok?'ok':'err');bd.querySelector('#m').textContent=t}
  function done(q){bd.innerHTML='<div class="center"><h2>Firma completata ✓</h2><p class="muted">Grazie. La tua firma è stata registrata'+(q?(' il '+new Date(q).toLocaleString('it-IT')):'')+'. With Us procederà alla controfirma.</p></div>'}
  fetch(API+'/firma-collab/info?id='+encodeURIComponent(ID)+'&t='+encodeURIComponent(T)).then(function(r){return r.json()}).then(function(d){
    if(!d.ok){bd.innerHTML='<div class="msg err" style="display:block">'+esc(d.error||'Link non valido')+'</div>';return}
    if(d.stato&&d.stato!=='inviata'){done(d.firmato_collab_il);return}
    bd.innerHTML='<div class="sum"><b>'+esc(d.titolo)+'</b><div class="muted">'+esc(d.nome||'')+'</div>'+(d.docUrl?'<a class="doc" href="'+d.docUrl+'" target="_blank">📄 Apri il documento</a>':'')+'<a class="doc" href="'+API+'/firma-collab/doc?id='+encodeURIComponent(ID)+'&t='+encodeURIComponent(T)+'" target="_blank">📄 Anteprima documento firmabile</a></div>'
      +'<label class="cz"><input type="checkbox" id="ck"> Dichiaro di aver letto e accetto il documento.</label>'
      +'<input class="otp" id="otp" inputmode="numeric" maxlength="6" placeholder="______">'
      +'<div class="msg" id="m"></div><button class="btn" id="go">Firma il documento</button>';
    bd.querySelector('#go').onclick=function(){
      if(!bd.querySelector('#ck').checked){msg('Devi accettare il documento.',false);return}
      var otp=(bd.querySelector('#otp').value||'').trim();if(otp.length<6){msg('Inserisci il codice OTP.',false);return}
      var b=bd.querySelector('#go');b.disabled=true;b.textContent='Firma…';
      fetch(API+'/firma-collab/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:ID,t:T,otp:otp})}).then(function(r){return r.json()}).then(function(x){
        if(!x.ok){b.disabled=false;b.textContent='Firma il documento';msg(x.error||'Errore',false);return}done(x.firmato_collab_il)})}
  }).catch(function(e){bd.innerHTML='<div class="msg err" style="display:block">Errore di rete</div>'});
  </script></body></html>`);
});

// Info documento (per la pagina di firma)
publicFirmaCollab.get('/info', async (req, res) => {
  try {
    const f = await getFirma(req.query.id);
    if (!f) return res.status(404).json({ error: 'non trovato' });
    if (!req.query.t || f.token !== req.query.t) return res.status(403).json({ error: 'link non valido' });
    const c = await getCollab(f.team_id) || {};
    res.json({ ok: true, stato: f.stato, titolo: tipoLabel(f.tipo, f.titolo), nome: ((c.cogn || '') + ' ' + (c.nome || '')).trim(), docUrl: f.doc_url || '', firmato_collab_il: f.firmato_collab_il });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Anteprima/documento firmabile (HTML)
publicFirmaCollab.get('/doc', async (req, res) => {
  try {
    const f = await getFirma(req.query.id);
    if (!f) return res.status(404).send('non trovato');
    if (!req.query.t || f.token !== req.query.t) return res.status(403).send('link non valido');
    const c = await getCollab(f.team_id) || {};
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(genDocHtml(c, f));
  } catch (e) { res.status(500).send('Errore: ' + e.message); }
});

// Collaboratore firma (OTP)
publicFirmaCollab.post('/verify', async (req, res) => {
  try {
    const { id, t, otp } = req.body || {};
    const f = await getFirma(id);
    if (!f) return res.status(404).json({ error: 'non trovato' });
    if (!t || f.token !== t) return res.status(403).json({ error: 'link non valido' });
    if (f.stato !== 'inviata') return res.json({ ok: true, gia_firmato: true, firmato_collab_il: f.firmato_collab_il });
    if (new Date(f.scadenza).getTime() < Date.now()) return res.status(410).json({ error: 'Codice scaduto.' });
    if (sha(String(otp) + ':' + t) !== f.otp_hash) return res.status(401).json({ error: 'Codice OTP errato.' });
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    const transazione = 'WU-' + sha(f.token + new Date().toISOString()).slice(0, 12).toUpperCase();
    const upd = await sbPatch('iam_firme', 'id', id, { stato: 'firmata_collab', firmato_collab_il: new Date().toISOString(), ip_collab: ip, transazione });
    // avvisa lo staff per la controfirma
    try {
      const c = await getCollab(f.team_id) || {};
      await sendEmail(STAFF_INBOX, 'Documento firmato dal collaboratore — controfirma', shell('Da controfirmare: ' + tipoLabel(f.tipo, f.titolo),
        `<p>Il collaboratore <b>${esc(((c.cogn || '') + ' ' + (c.nome || '')).trim())}</b> ha firmato <b>${esc(tipoLabel(f.tipo, f.titolo))}</b>.</p>
         <p>Accedi a IAM per <b>controfirmare</b> il documento.</p>
         <div style="margin-top:12px"><a href="${IAM_URL}" style="color:#3b5bfd">Apri IAM</a></div>`));
    } catch (_) {}
    res.json({ ok: true, firmato_collab_il: upd.firmato_collab_il });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Controfirma dell'agente: invia OTP allo staff
firmaCollabRouter.post('/countersign/request', async (req, res) => {
  try {
    const { id } = req.body || {};
    const f = await getFirma(id);
    if (!f) return res.status(404).json({ error: 'non trovato' });
    if (f.stato !== 'firmata_collab') return res.status(400).json({ error: 'Il documento non è pronto per la controfirma.' });
    const otp = genOtp();
    await sbPatch('iam_firme', 'id', id, { cs_otp_hash: sha(otp + ':' + f.token), cs_scadenza: new Date(Date.now() + OTP_TTL_MIN * 60000).toISOString() });
    await sendEmail(STAFF_INBOX, 'Codice controfirma — With Us', shell('Controfirma documento',
      `<p>Codice per controfirmare <b>${esc(tipoLabel(f.tipo, f.titolo))}</b>:</p>
       <div style="font-size:30px;font-weight:900;letter-spacing:8px;color:#1b2a6b;background:#eef2ff;border-radius:12px;padding:14px;text-align:center">${otp}</div>
       <p style="color:#6b7488;font-size:13px">Valido ${OTP_TTL_MIN} minuti. Inseriscilo in IAM.</p>`));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Controfirma dell'agente: verifica OTP → documento completato
firmaCollabRouter.post('/countersign/verify', async (req, res) => {
  try {
    const { id, otp } = req.body || {};
    const f = await getFirma(id);
    if (!f) return res.status(404).json({ error: 'non trovato' });
    if (f.stato !== 'firmata_collab') return res.status(400).json({ error: 'stato non valido' });
    if (!f.cs_otp_hash || new Date(f.cs_scadenza).getTime() < Date.now()) return res.status(410).json({ error: 'Codice scaduto. Richiedine uno nuovo.' });
    if (sha(String(otp) + ':' + f.token) !== f.cs_otp_hash) return res.status(401).json({ error: 'Codice OTP errato.' });
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    const upd = await sbPatch('iam_firme', 'id', id, { stato: 'completata', firmato_agente_il: new Date().toISOString(), ip_agente: ip, cs_otp_hash: null });
    // copia firmata al collaboratore
    try {
      const docUrl = `${SELF_URL}/firma-collab/doc?id=${encodeURIComponent(id)}&t=${encodeURIComponent(f.token)}`;
      await sendEmail(f.email, 'Documento controfirmato — With Us', shell('Documento completato: ' + tipoLabel(f.tipo, f.titolo),
        `<p>Il documento è stato firmato da entrambe le parti.</p>
         <div style="margin-top:12px"><a href="${docUrl}" style="display:inline-block;background:#3b5bfd;color:#fff;text-decoration:none;padding:11px 22px;border-radius:10px;font-weight:700">Apri il documento firmato</a></div>`));
    } catch (_) {}
    res.json({ ok: true, firmato_agente_il: upd.firmato_agente_il });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Elenco firme di un collaboratore (per IAM)
firmaCollabRouter.get('/list', async (req, res) => {
  try {
    const rows = await sbGet(`iam_firme?team_id=eq.${encodeURIComponent(req.query.teamId)}&select=id,tipo,titolo,stato,token,firmato_collab_il,firmato_agente_il,creato_il&order=creato_il.desc`);
    res.json({ ok: true, firme: Array.isArray(rows) ? rows : [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
