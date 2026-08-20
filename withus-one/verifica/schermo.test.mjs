/* ═══════════════════════════════════════════════════════════════════════════
   SCHERMO — la prova che il sistema si apre davvero
   ───────────────────────────────────────────────────────────────────────────
   Le altre prove esaminano la logica senza browser: sono veloci e precise, ma
   non accorgerebbero mai di un errore di battitura nel disegno di una pagina.
   Questa apre il sistema in un browser vero, con un finto archivio al posto di
   quello di produzione, ed entra in OGNI modulo del menu.

   Non tocca né il database né la rete: le richieste verso l'esterno sono
   bloccate, e il finto archivio risponde con dati inventati per finta — che è
   l'unico posto in cui è lecito inventarli.
   ═══════════════════════════════════════════════════════════════════════════ */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { esiti, deve, uguale, RADICE } from './banco.mjs';
import { MODULI } from '../nucleo/registro.js';

const REPO = path.dirname(RADICE);
const PORTA = 8078;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
               '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8' };

const server = http.createServer((req, res) => {
  const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

/* Il finto archivio: risponde a qualunque catena di filtri con le righe della
   tabella richiesta. Non simula la riservatezza — quella è del database vero e
   non si riproduce qui: si sta provando il DISEGNO, non i permessi. */
function finzione() {
  const DATI = {
    quote_anagrafiche: [{ id: 'c1', tipo: 'privato', nominativo: 'Mario Rossi', codice_fiscale: 'RSSMRA80A01H501U',
      email: 'mario@example.it', cellulare: '3331234567', indirizzo: 'Via Roma', civico: '1', comune: 'Milano', provincia: 'MI' }],
    quote_polizze: [{ id: 'p1', numero: 1, numero_polizza: 'AB/2026/1', cliente: 'Mario Rossi', cliente_id: 'c1',
      modulo: 'auto', prodotto: 'RC Auto', compagnia: 'Compagnia Prova', data_effetto: '2026-01-01',
      data_scadenza: '2026-08-10', frazionamento: 'Annuale', tacito_rinnovo: false, premio_annuo: 480, premio_rata: 480,
      stato_pagamento: 'non_pagato', perfezionata: false, rendicontata: false, creato_nome: 'Prova', creato_il: '2026-01-01' }],
    quote_titoli: [{ id: 't1', polizza_id: 'p1', tipo: 'prima_rata', data_decorrenza: '2026-01-01',
      data_scadenza: '2026-07-01', importo_lordo: 480, stato: 'insoluto',
      polizza: { id: 'p1', cliente: 'Mario Rossi', cliente_id: 'c1', numero_polizza: 'AB/2026/1', prodotto: 'RC Auto', compagnia: 'Compagnia Prova' } }],
    quote_pratica_documenti: [{ id: 'd1', entita: 'polizza', entita_id: 'p1', categoria: 'identita',
      nome: 'Documento di identità', url: null, obbligatorio: true }],
    quote_preventivi: [{ id: 'v1', numero: 10, modulo: 'auto', prodotto: 'RC Auto', compagnia: 'Compagnia Prova',
      premio: 500, cliente: 'Mario Rossi', cliente_id: 'c1', stato: 'bozza', polizza_emessa: false,
      creato_nome: 'Prova', creato_il: '2026-07-20' }],
    quote_prodotti_catalogo: [{ id: 'x1', ramo: 'Auto', codice: 'rca', nome: 'RC Auto', tipo_quotazione: 'calcola',
      compagnie: ['Compagnia Prova'], attivo: true, ordine: 1, durata_mesi: 12 }],
    quote_sinistri: [{ id: 's1', contraente: 'Mario Rossi', cliente_id: 'c1', ramo: 'Auto', compagnia: 'Compagnia Prova',
      n_polizza: 'AB/2026/1', numero_sx: 'SX/2026/1', luogo: 'Milano', data_accadimento: '2026-05-01',
      data_denuncia: '2026-05-02', stato: 'aperto', descrizione: 'Tamponamento' }],
    quote_sinistro_controparti: [{ id: 'k1', sinistro_id: 's1', tipo: 'veicolo', nominativo: 'Anna Bianchi', targa: 'AA000AA' }],
    quote_sinistro_partite: [{ id: 'q1', sinistro_id: 's1', tipo: 'danni a cose', descrizione: 'Paraurti',
      importo_richiesto: 1200, importo_riservato: 900, importo_liquidato: 0, franchigia: 0, stato: 'aperta' }],
    quote_scadenzario: [{ id: 'p1', numero: 1, numero_polizza: 'AB/2026/1', cliente_id: 'c1', modulo: 'auto',
      prodotto: 'RC Auto', compagnia: 'Compagnia Prova', data_effetto: '2026-01-01', data_scadenza: '2026-08-10',
      premio_annuo: 480, stato_pagamento: 'non_pagato', perfezionata: false, rendicontata: false, sostituzioni: 0 }],
    iam_ticket: [{ id: 'r1', titolo: 'Voltura da fare', descrizione: 'Cliente in attesa', priorita: 'alta',
      stato: 'aperto', sezione: 'Generale', origine: 'iam', segnalato_nome: 'Prova', cliente_id: 'c1', creato_il: '2026-07-10' }],
    iam_utenti: [{ id: 'u1', email: 'prova@withus.it', nome: 'Prova', cognome: 'Utente', ruolo: 'top_master',
      attivo: true, rete: 'Sede', accesso_iam: true, accesso_quoto: true }]
  };
  const SESSIONE = { user: { id: 'u1', email: 'prova@withus.it', user_metadata: { full_name: 'Prova Utente' } },
                     access_token: 'finto', refresh_token: 'finto' };

  window.supabase = {
    createClient() {
      const query = (tabella) => {
        const righe = () => (DATI[tabella] || []).map(r => ({ ...r }));
        const q = {};
        /* Tutti i filtri restituiscono sé stessi: qui non si sta provando la
           selezione, si sta provando che la pagina si disegni. */
        ['select', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'order', 'limit', 'or', 'filter']
          .forEach(m => { q[m] = () => q; });
        q.single = () => Promise.resolve({ data: righe()[0] || null, error: null });
        q.maybeSingle = () => Promise.resolve({ data: righe()[0] || null, error: null });
        q.then = (ris, err) => Promise.resolve({ data: righe(), error: null, count: righe().length }).then(ris, err);
        return q;
      };
      return {
        from: (t) => query(t),
        auth: {
          /* Il segno di «sono entrato» sta nel magazzino del browser e non in una
             variabile: deve sopravvivere a un aggiornamento di pagina, come la
             sessione vera, altrimenti ricaricando si tornerebbe all'accesso. */
          getSession: async () => ({ data: { session: localStorage.getItem('__entrato') ? SESSIONE : null }, error: null }),
          signInWithPassword: async () => { localStorage.setItem('__entrato', '1'); return { data: { session: SESSIONE }, error: null }; },
          setSession: async () => ({ data: { session: SESSIONE }, error: null }),
          signOut: async () => { localStorage.removeItem('__entrato'); return { error: null }; },
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
        }
      };
    }
  };
}

async function principale() {
  const e = esiti('SCHERMO — il sistema si apre in un browser vero');
  await new Promise(r => server.listen(PORTA, r));

  let browser;
  try { browser = await chromium.launch(); }
  catch (x) { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }

  const pagina = await browser.newPage();
  const errori = [];
  pagina.on('pageerror', x => errori.push(String(x.message || x)));
  pagina.on('console', m => { if (m.type() === 'error') errori.push(m.text()); });

  /* Niente esce da questa prova: i fogli di stile e le librerie esterne si
     bloccano, così la prova non dipende dalla rete né da un servizio altrui. */
  await pagina.route('**://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/plain', body: '' }));
  await pagina.route('**://*.supabase.co/**', r => r.abort());
  await pagina.route('**://api.withusassicurazioni.it/**', r => r.abort());
  await pagina.addInitScript(finzione);

  const vai = async (hash) => {
    await pagina.goto(`http://127.0.0.1:${PORTA}/withus-one/index.html${hash || ''}`, { waitUntil: 'load' });
  };

  await e.provaAsync('senza sessione si chiede di entrare, e non si vede il gestionale', async () => {
    await vai();
    await pagina.waitForSelector('#f-acc', { timeout: 8000 });
    uguale(await pagina.locator('.w1-menu').count(), 0, 'il menu non deve comparire prima dell\'accesso');
  });

  await e.provaAsync('la password non si scrive in chiaro nel campo', async () => {
    uguale(await pagina.locator('#acc-pw').getAttribute('type'), 'password');
  });

  await e.provaAsync('entrando si apre la scrivania', async () => {
    await pagina.fill('#acc-mail', 'prova@withus.it');
    await pagina.fill('#acc-pw', 'qualcosa');
    await pagina.click('#f-acc button[type=submit]');
    await pagina.waitForSelector('.w1-menu a', { timeout: 8000 });
    await pagina.waitForFunction(() => document.querySelector('#w1-h1')?.textContent === 'Scrivania', null, { timeout: 8000 });
  });

  await e.provaAsync('la scocca ha le tre fasce e il menu per aree', async () => {
    deve(await pagina.locator('.w1-alta').count() === 1, 'manca la fascia alta');
    deve(await pagina.locator('.w1-titolo h1').count() === 1, 'manca la fascia del titolo');
    deve(await pagina.locator('.w1-menu .area').count() >= 5, 'il menu non è diviso per aree');
  });

  await e.provaAsync('un amministratore vede tutte le voci del menu', async () => {
    uguale(await pagina.locator('.w1-menu a').count(), MODULI.length);
  });

  await e.provaAsync('la scrivania mostra il lavoro di oggi con le sue fasce', async () => {
    deve(await pagina.locator('.w1-fascia').count() > 0, 'nessuna fascia: con un insoluto in archivio deve essercene almeno una');
    deve((await pagina.locator('#s-lista').innerText()).includes('Insoluto'), 'l\'insoluto del finto archivio non compare');
  });

  /* Il cuore della prova: si entra in OGNI modulo del menu. Un modulo che non
     si monta si vede subito, senza che nessuno debba ricordarsi di provarlo. */
  for (const m of MODULI) {
    await e.provaAsync(`si apre «${m.titolo}»`, async () => {
      const prima = errori.length;
      await pagina.click(`.w1-menu a[data-k="${m.chiave}"]`);
      await pagina.waitForFunction(
        (t) => document.querySelector('#w1-h1')?.textContent === t, m.titolo, { timeout: 8000 });
      await pagina.waitForFunction(
        () => !document.querySelector('#w1-cont .w1-attesa'), null, { timeout: 8000 });
      const testo = await pagina.locator('#w1-cont').innerText();
      deve(!/non è ancora disponibile|non è scritto bene|Non disponibile/.test(testo),
        'il modulo non si è montato: ' + testo.slice(0, 160));
      deve(testo.trim().length > 0, 'la pagina è rimasta vuota');
      uguale(errori.length, prima, 'ha stampato errori: ' + errori.slice(prima).join(' | '));
    });
  }

  await e.provaAsync('l\'indirizzo dice dove si è, e ricaricando si torna lì', async () => {
    await pagina.click('.w1-menu a[data-k="scadenzario"]');
    await pagina.waitForFunction(() => location.hash === '#/scadenzario', null, { timeout: 5000 });
    await pagina.reload({ waitUntil: 'load' });
    await pagina.waitForFunction(() => document.querySelector('#w1-h1')?.textContent === 'Scadenzario', null, { timeout: 8000 });
  });

  await e.provaAsync('un indirizzo inventato non rompe il guscio', async () => {
    await vai('#/inesistente');
    await pagina.waitForSelector('.w1-errore', { timeout: 8000 });
    deve(await pagina.locator('.w1-menu a').count() > 0, 'il menu deve restare navigabile');
  });

  await e.provaAsync('dalla scheda cliente si arriva alle sue polizze', async () => {
    await vai('#/clienti');
    await pagina.waitForSelector('.w1-tab tbody tr', { timeout: 8000 });
    await pagina.click('.w1-tab tbody tr');
    await pagina.waitForSelector('#c-storia .w1-tab', { timeout: 8000 });
    deve((await pagina.locator('#w1-cont').innerText()).includes('Mario Rossi'), 'la scheda non mostra il cliente');
    await pagina.click('#c-pol');
    await pagina.waitForFunction(() => document.querySelector('#w1-h1')?.textContent === 'Polizze', null, { timeout: 8000 });
  });

  await e.provaAsync('la polizza mostra i suoi quattro stati, ognuno spiegato', async () => {
    await vai('#/polizze?id=p1');
    await pagina.waitForSelector('.w1-dati', { timeout: 8000 });
    const spiegazioni = await pagina.locator('#w1-cont .w1-sem').evaluateAll(
      nodi => nodi.map(n => n.getAttribute('title') || ''));
    deve(spiegazioni.filter(t => /^Pagamento:/.test(t)).length >= 1, 'manca la spiegazione del pagamento');
    deve(spiegazioni.every(t => t.length > 6), 'c\'è un pallino senza spiegazione: ' + JSON.stringify(spiegazioni));
  });

  await e.provaAsync('il bottone Esporta non occupa tutta la larghezza', async () => {
    await vai('#/titoli');
    await pagina.waitForSelector('.w1-f-az .w1-btn', { timeout: 8000 });
    const b = await pagina.locator('.w1-f-az .w1-btn').first().boundingBox();
    deve(b.width < 220, 'il bottone è largo ' + Math.round(b.width) + 'px: sembra una fascia, non un bottone');
  });

  await e.provaAsync('la pagina non scorre in orizzontale', async () => {
    await vai('#/polizze');
    await pagina.waitForSelector('.w1-tab', { timeout: 8000 });
    deve(await pagina.evaluate(() => document.body.scrollWidth <= window.innerWidth + 1),
      'la pagina esce di lato: le tabelle larghe devono scorrere dentro il loro riquadro');
  });

  await e.provaAsync('nessun errore è comparso durante tutta la prova', async () => {
    uguale(errori, [], 'errori in pagina');
  });

  await browser.close();
  server.close();
  return e.stampa();
}

principale().then(ko => process.exit(ko === 0 ? 0 : 1))
  .catch(x => { console.error(x); server.close(); process.exit(1); });
