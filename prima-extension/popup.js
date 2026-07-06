const $ = (id) => document.getElementById(id);
const FIELDS = ['targa', 'nascita', 'professione', 'statoCivile', 'indirizzo', 'civico', 'cap', 'cittaIstat', 'telefono', 'annoPatente'];

function send(msg) { return new Promise((res) => chrome.runtime.sendMessage(msg, res)); }

async function refreshStatus() {
  const st = await send({ type: 'POPUP_STATUS' });
  const tabEl = $('st-tab'), tokEl = $('st-tok'), hint = $('hint');
  if (st && st.tab) {
    const loggato = st.loggato !== false && !/login|signin|auth/i.test(st.tabUrl || st.url || '');
    tabEl.className = 'pill ok'; tabEl.textContent = loggato ? 'Prima aperta ✓' : 'Prima aperta (login?)';
  } else { tabEl.className = 'pill no'; tabEl.textContent = 'Prima non aperta'; }
  if (st && st.hasToken) { tokEl.className = 'pill ok'; tokEl.textContent = 'Token pronto ✓'; hint.textContent = ''; }
  else { tokEl.className = 'pill wait'; tokEl.textContent = 'Token non ancora preso'; hint.innerHTML = 'Per prendere il token: nel portale Prima apri o <b>ricalcola</b> un preventivo una volta.'; }
}

async function loadDefaults() {
  const saved = await chrome.storage.local.get('form');
  const f = (saved && saved.form) || {};
  // sovrascrivo il valore d'esempio solo se in memoria c'è un valore NON vuoto
  for (const k of FIELDS) { if (f[k] && $(k)) $(k).value = f[k]; }
}
function saveDefaults() {
  const f = {}; for (const k of FIELDS) f[k] = $(k).value.trim();
  chrome.storage.local.set({ form: f });
}

$('go').addEventListener('click', async () => {
  const btn = $('go'), out = $('out');
  const d = {}; for (const k of FIELDS) d[k] = $(k).value.trim();
  saveDefaults();
  btn.disabled = true; out.innerHTML = '<span class="pill wait">calcolo… (fino a ~30s)</span>';
  const r = await send({ type: 'POPUP_RUN', data: d });
  if (r && r.ok) out.innerHTML = '<div class="pill ok" style="font-size:14px">Premio annuale: ' + r.premio_annuale + '</div><pre>' + JSON.stringify(r, null, 2) + '</pre>';
  else out.innerHTML = '<div class="pill no">Errore</div><pre>' + JSON.stringify(r, null, 2) + '</pre>';
  btn.disabled = false;
  refreshStatus();
});

loadDefaults();
refreshStatus();
setInterval(refreshStatus, 3000);
