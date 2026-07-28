// QUOTO · Connettore Mappatura — POPUP
const $ = (id) => document.getElementById(id);

function render(st) {
  $('count').textContent = st.count || 0;
  $('toggle').checked = !!st.enabled;
  $('stateTag').textContent = st.enabled ? 'ATTIVO' : 'in pausa';
  $('stateTag').className = 'tag' + (st.enabled ? '' : ' off');
  const names = { 'assieasy': 'Assieasy', 'rcpolizza': 'RC Polizza', 'plurima': 'Plurima' };
  const h = st.perHost || {};
  const lines = Object.keys(h).map((host) => {
    const label = Object.keys(names).find((k) => host.includes(k));
    return `<div><span>${label ? names[label] : host}</span><b>${h[host]}</b></div>`;
  });
  $('hosts').innerHTML = lines.join('') || '<div style="color:#8b9aa9">Nessuna chiamata ancora. Naviga nei portali.</div>';
}

function refresh() { chrome.runtime.sendMessage({ type: 'getState' }, render); }

$('toggle').addEventListener('change', (e) => chrome.runtime.sendMessage({ type: 'toggle', value: e.target.checked }, () => refresh()));

$('dl').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'download' }, (r) => {
    const blob = new Blob([r.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'quoto-mappatura.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
});

$('send').addEventListener('click', () => {
  $('send').textContent = 'Invio…';
  chrome.runtime.sendMessage({ type: 'flushNow' }, () => { $('send').textContent = 'Inviato ✓'; setTimeout(() => $('send').textContent = 'Invia ora al server', 1500); });
});

$('reset').addEventListener('click', () => { if (confirm('Azzerare la mappa raccolta?')) chrome.runtime.sendMessage({ type: 'reset' }, () => refresh()); });

refresh();
setInterval(refresh, 1500);
