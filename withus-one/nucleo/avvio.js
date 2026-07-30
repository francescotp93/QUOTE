/* ═══════════════════════════════════════════════════════════════════════════
   AVVIO — accende il sistema
   ───────────────────────────────────────────────────────────────────────────
   Ordine: client → sessione (anche quella passata da un'altra applicazione)
   → profilo → scocca → modulo. Se manca la sessione si mostra l'accesso e
   basta: non si disegna un menu che poi non porta a niente.
   ═══════════════════════════════════════════════════════════════════════════ */
import { avviaDb, caricaUtente, raccogliSessioneDaIndirizzo, api } from './dati.js';
import { menu } from './registro.js';
import { creaRouter, leggiIndirizzo, scriviIndirizzo } from './router.js';
import ui, { esc } from './ui.js';
import { esc as _esc } from './formato.js';
import fmt from './formato.js';

const radice = document.getElementById('w1-radice');

/* ── Accesso ────────────────────────────────────────────────────────────────
   Stesse credenziali del resto dell'ecosistema: è lo stesso database e lo
   stesso elenco utenti, non un secondo account da ricordare. */
function mostraAccesso(messaggio) {
  radice.innerHTML = `
  <div style="min-height:100vh;display:grid;place-items:center;padding:20px">
    <form class="w1-card" style="width:340px;margin:0" id="f-acc">
      <div style="padding:22px 20px 6px;text-align:center">
        <div class="w1-marchio" style="justify-content:center;color:var(--w1-testo);font-size:16px">
          <span class="pallino"><i class="ti ti-shield-check" style="color:#fff"></i></span>With Us <small>ONE</small>
        </div>
        <p style="margin:6px 0 0;color:var(--w1-testo2);font-size:12px">Gestionale di agenzia</p>
      </div>
      <div class="dentro">
        <label class="w1-f" style="margin-bottom:9px"><span>Email</span>
          <input id="acc-mail" type="email" autocomplete="username" required style="min-width:0"></label>
        <label class="w1-f" style="margin-bottom:12px"><span>Password</span>
          <input id="acc-pw" type="password" autocomplete="current-password" required style="min-width:0"></label>
        <button class="w1-btn p" type="submit" style="width:100%;justify-content:center;height:32px">Entra</button>
        <div id="acc-msg" style="margin-top:9px;font-size:12px;color:#a32b23;min-height:16px">${messaggio ? _esc(messaggio) : ''}</div>
      </div>
    </form>
  </div>`;

  const f = document.getElementById('f-acc');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('acc-msg');
    const bottone = f.querySelector('button');
    bottone.disabled = true; msg.style.color = 'var(--w1-testo2)'; msg.textContent = 'Verifico…';
    try {
      const { error } = await avviaDb().auth.signInWithPassword({
        email: document.getElementById('acc-mail').value.trim(),
        password: document.getElementById('acc-pw').value
      });
      if (error) throw error;
      await avvia();
    } catch (err) {
      bottone.disabled = false;
      msg.style.color = '#a32b23';
      /* Il messaggio di Supabase è in inglese e dice più del necessario a chi
         prova a indovinare: si dice solo che non tornano, senza specificare se
         è sbagliata l'email o la password. */
      msg.textContent = /invalid/i.test(err.message || '')
        ? 'Email o password non corrette.'
        : ('Accesso non riuscito: ' + (err.message || err));
    }
  });
}

/* ── Scocca ─────────────────────────────────────────────────────────────── */
function disegnaScocca(utente) {
  const iniziali = (utente.nome || utente.email).trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  radice.innerHTML = `
  <div class="w1-app">
    <header class="w1-alta">
      <div class="w1-marchio"><span class="pallino"><i class="ti ti-shield-check"></i></span>With Us <small>ONE</small></div>
      <div class="w1-cerca">
        <i class="ti ti-search"></i>
        <input id="w1-q" type="search" placeholder="Cerca un cliente…" autocomplete="off">
      </div>
      <div class="sep"></div>
      <div class="w1-io">
        <span class="cerchio">${_esc(iniziali)}</span>
        <span class="chi"><b>${_esc(utente.nome)}</b><span>${_esc(etichettaRuolo(utente))}</span></span>
        <button class="w1-esci" id="w1-esci" type="button">Esci</button>
      </div>
    </header>
    <div class="w1-corpo">
      <nav class="w1-menu" id="w1-menu"></nav>
      <div class="w1-lavoro">
        <div class="w1-titolo">
          <div><h1 id="w1-h1">…</h1><p id="w1-h2"></p></div>
          <div class="az" id="w1-az"></div>
        </div>
        <main class="w1-cont" id="w1-cont"></main>
      </div>
    </div>
  </div>`;

  document.getElementById('w1-menu').innerHTML = menu(utente).map(a =>
    `<div class="area">${_esc(a.nome)}</div>` + a.voci.map(v =>
      `<a href="${scriviIndirizzo(v.chiave)}" data-k="${_esc(v.chiave)}">
         <i class="ti ${_esc(v.icona)}"></i><span>${_esc(v.titolo)}</span></a>`).join('')
  ).join('');

  document.getElementById('w1-esci').addEventListener('click', async () => {
    if (!await ui.conferma({ titolo: 'Uscire?', testo: 'Chiudo la sessione su questo computer.' })) return;
    try { await avviaDb().auth.signOut(); } catch (e) {}
    location.hash = '';
    mostraAccesso();
  });

  /* La ricerca in alto porta ai clienti con il testo già filtrato: è quello
     che si cerca nove volte su dieci, e il resto si raggiunge dalla scheda. */
  const q = document.getElementById('w1-q');
  q.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const testo = q.value.trim();
    if (testo) location.hash = scriviIndirizzo('clienti', { q: testo });
  });
}

function etichettaRuolo(u) {
  if (u.admin) return 'Amministratore';
  if (u.staff) return 'Ufficio';
  return 'Collaboratore';
}

/* Evidenzia la voce aperta e aggiorna il titolo. Il titolo della finestra
   cambia con la pagina: con dieci schede aperte è l'unico modo per ritrovarla. */
function segnaVoce(voce) {
  document.querySelectorAll('#w1-menu a').forEach(a =>
    a.classList.toggle('att', a.dataset.k === voce.chiave));
  document.getElementById('w1-h1').textContent = voce.titolo;
  document.getElementById('w1-h2').textContent = voce.sottotitolo || '';
  document.getElementById('w1-az').innerHTML = '';
  document.title = voce.titolo + ' · With Us One';
}

/* ── Il giro completo ───────────────────────────────────────────────────── */
async function avvia() {
  let db;
  try { db = avviaDb(); }
  catch (e) { radice.innerHTML = `<div class="w1-errore" style="margin:40px">${_esc(e.message)}</div>`; return; }

  await raccogliSessioneDaIndirizzo();

  const { data } = await db.auth.getSession();
  if (!data || !data.session) { mostraAccesso(); return; }

  const utente = await caricaUtente(data.session);

  /* Un collaboratore disattivato non deve entrare: la riservatezza del database
     glielo impedirebbe comunque, ma vedrebbe pagine vuote senza capire perché. */
  if (!utente.attivo) {
    try { await db.auth.signOut(); } catch (e) {}
    mostraAccesso('Il tuo accesso è sospeso. Scrivi all\'ufficio.');
    return;
  }

  disegnaScocca(utente);

  const contenitore = document.getElementById('w1-cont');
  const router = creaRouter({
    contenitore,
    ctx: { db, utente, ui, fmt, api, vaiA: (k, p) => router.vaiA(k, p), intestazione },
    suCambio: segnaVoce
  });

  if (!leggiIndirizzo().chiave || !location.hash) location.hash = scriviIndirizzo('scrivania');
  router.apri();

  /* Se la sessione cade (token scaduto, uscita da un'altra scheda) si torna
     all'accesso invece di lasciare a schermo un gestionale che non risponde. */
  db.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') { location.hash = ''; mostraAccesso(); }
  });
}

/* Un modulo può mettere i suoi bottoni nella fascia del titolo (Nuovo,
   Esporta…): stanno lì e non dentro il contenuto, così non scorrono via. */
function intestazione(nodi) {
  const az = document.getElementById('w1-az');
  if (!az) return;
  az.innerHTML = '';
  (Array.isArray(nodi) ? nodi : [nodi]).filter(Boolean).forEach(n => az.appendChild(n));
}

avvia();

export { avvia };
