// ─────────────────────────────────────────────────────────────────────────────
//  WITH US · CONNETTORE — IL POPUP
//  Tre cose: registrare un caso (e fermarlo), vedere se e' collegata a IAM,
//  e — in fondo, chiuso — la prova Prima di sempre.
// ─────────────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, (r) => res(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : r)));
const R = window.__WU_REG;

function msg(el, testo, tipo) { el.className = 'msg ' + (tipo || 'wait'); el.textContent = testo; }

// ── Portali: tendina, pre-scelto quello della scheda attiva ──
async function riempiPortali() {
  const sel = $('portale');
  sel.innerHTML = '<option value="">— scegli —</option>' + R.PORTALI.map(p => '<option value="' + p.id + '">' + esc(p.nome) + '</option>').join('');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const id = tab && R.portaleDi(R.hostDi(tab.url));
    if (id) sel.value = id;
  } catch (e) {}
}

async function aggiorna() {
  const st = await send({ type: 'CONNETTORE_STATO' });
  if (!st || !st.ok) return;
  $('versione').textContent = 'v' + st.versione;
  // IAM
  const iam = $('st-iam');
  if (st.collegato) { iam.className = 'pill ok'; iam.textContent = 'Collegata a IAM'; $('iam-testo').innerHTML = 'Le catture partono verso <b>' + esc(st.api) + '</b>. Collegata il ' + new Date(st.collegato_il).toLocaleString('it-IT') + '.'; }
  else { iam.className = 'pill no'; iam.textContent = 'Non collegata'; $('iam-testo').innerHTML = 'Apri <b>IAM → Strumenti → Fonti compagnie</b> e premi <b>«Collega l\'estensione»</b>: da li\' riceve la chiave con cui consegna le catture. Fino ad allora le catture restano qui, in attesa.'; }
  // registrazione
  const rec = st.rec || {};
  $('rec-ferma').style.display = rec.on ? '' : 'none';
  $('rec-avvia').style.display = rec.on ? 'none' : '';
  if (rec.on) { $('rec-n').textContent = rec.n || 0; $('rec-portale').textContent = R.nomePortale(rec.portale); $('rec-caso').textContent = rec.caso || ''; }
  if (!rec.on && rec.fermata) msg($('rec-msg'), 'La registrazione si e\' fermata da sola: ' + rec.fermata + '. Premi «Ferma e manda» per consegnare quello che c\'e\'.', 'wait');
  if (!rec.on && rec.fermata) { $('rec-ferma').style.display = ''; $('rec-avvia').style.display = 'none'; }
  // in attesa
  const att = st.in_attesa || [];
  $('c-attesa').style.display = att.length ? '' : 'none';
  $('attesa-lista').innerHTML = att.map(c => '<div style="padding:6px 0;border-bottom:1px solid var(--bordo)"><b>' + esc(R.nomePortale(c.portale)) + '</b> · ' + c.n + ' chiamate<div class="muted" style="margin:0">' + esc(c.caso) + ' — ' + esc(c.motivo || '') + '</div></div>').join('');
}

$('avvia').addEventListener('click', async () => {
  const r = await send({ type: 'REC_START', data: { portale: $('portale').value, caso: $('caso').value } });
  if (!r || !r.ok) return msg($('rec-msg'), (r && r.error) || 'Non sono riuscita ad avviare.', 'no');
  const nome = R.nomePortale($('portale').value);
  if (!r.schede) msg($('rec-msg'), 'Registro, ma non vedo nessuna scheda di ' + nome + ' aperta: aprila (o e\' su un altro indirizzo?) e fai il preventivo.', 'wait');
  else if (r.agganciate < r.schede) msg($('rec-msg'), 'Registro. Agganciate ' + r.agganciate + ' schede su ' + r.schede + ' di ' + nome + ': su quella rimasta fuori premi F5.', 'wait');
  else msg($('rec-msg'), 'Registro: ' + r.schede + ' sched' + (r.schede === 1 ? 'a' : 'e') + ' di ' + nome + ' agganciat' + (r.schede === 1 ? 'a' : 'e') + '. Fai il preventivo e poi premi «Ferma e manda».', 'ok');
  aggiorna();
});
$('ferma').addEventListener('click', async () => {
  $('ferma').disabled = true;
  const r = await send({ type: 'REC_STOP' });
  $('ferma').disabled = false;
  if (!r) return msg($('rec-msg'), 'Nessuna risposta dall\'estensione.', 'no');
  if (r.vuota) msg($('rec-msg'), r.msg, 'wait');
  else if (r.mandata) msg($('rec-msg'), r.msg, 'ok');
  else msg($('rec-msg'), r.errore || 'Non consegnata.', 'no');
  aggiorna();
});
$('rimanda').addEventListener('click', async () => {
  $('rimanda').disabled = true;
  const r = await send({ type: 'RIMANDA' });
  $('rimanda').disabled = false;
  const ok = ((r && r.esiti) || []).filter(e => e.mandata).length, tot = ((r && r.esiti) || []).length;
  msg($('rec-msg'), ok === tot ? 'Consegnate tutte (' + tot + ').' : 'Consegnate ' + ok + ' su ' + tot + ': ' + (((r && r.esiti) || []).find(e => !e.mandata) || {}).errore, ok === tot ? 'ok' : 'no');
  aggiorna();
});

// ── PRIMA (invariato nella sostanza) ──
const FIELDS = ['targa', 'nascita', 'professione', 'statoCivile', 'indirizzo', 'civico', 'cap', 'cittaIstat', 'telefono', 'annoPatente'];
async function refreshStatus() {
  const st = await send({ type: 'POPUP_STATUS' });
  const tabEl = $('st-tab'), tokEl = $('st-tok'), hint = $('hint');
  const loggato = st && st.tab && st.loggato !== false && !/login|signin|auth/i.test(st.tabUrl || st.url || '');
  if (st && st.tab) { tabEl.className = 'pill ok'; tabEl.textContent = loggato ? 'Prima aperta ✓' : 'Prima aperta (login?)'; }
  else { tabEl.className = 'pill no'; tabEl.textContent = 'Prima non aperta'; }
  if (loggato) { tokEl.className = 'pill ok'; tokEl.textContent = 'Pronto ✓'; hint.textContent = ''; }
  else if (st && st.tab) { tokEl.className = 'pill wait'; tokEl.textContent = 'Fai login su Prima'; hint.innerHTML = 'Accedi al portale Prima nella scheda aperta.'; }
  else { tokEl.className = 'pill wait'; tokEl.textContent = '—'; hint.innerHTML = 'Apri una scheda su <b>intermediari.prima.it</b> e fai login.'; }
}
async function loadDefaults() {
  const saved = await chrome.storage.local.get('form');
  const f = (saved && saved.form) || {};
  for (const k of FIELDS) { if (f[k] && $(k)) $(k).value = f[k]; }
}
function saveDefaults() { const f = {}; for (const k of FIELDS) f[k] = $(k).value.trim(); chrome.storage.local.set({ form: f }); }
$('go').addEventListener('click', async () => {
  const btn = $('go'), out = $('out');
  const d = {}; for (const k of FIELDS) d[k] = $(k).value.trim();
  saveDefaults();
  btn.disabled = true; out.innerHTML = '<span class="pill wait">calcolo… (fino a ~30s)</span>';
  const r = await send({ type: 'POPUP_RUN', data: d });
  if (r && r.ok) out.innerHTML = '<div class="pill ok" style="font-size:14px">Premio annuale: ' + esc(r.premio_annuale) + '</div><pre>' + esc(JSON.stringify(r, null, 2)) + '</pre>';
  else out.innerHTML = '<div class="pill no">Errore</div><pre>' + esc(JSON.stringify(r, null, 2)) + '</pre>';
  btn.disabled = false;
  refreshStatus();
});

riempiPortali();
loadDefaults();
aggiorna();
refreshStatus();
setInterval(aggiorna, 2000);
setInterval(refreshStatus, 5000);
