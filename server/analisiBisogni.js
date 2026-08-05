// ═══════════════════════════════════════════════════════════════════════════════
//  ANALISI DEI BISOGNI — rotte
//
//  Due router, come gia' fanno sign.js e fonti.js:
//
//    analisiRouter        area interna. Protetto da requireAuth: e' l'operatore.
//    publicAnalisi        il cliente da casa. Nessun login: si entra col codice
//                         dell'invito, e si vede SOLO la propria analisi.
//
//  Tre regole che valgono per tutto il file:
//
//  1. Il punteggio lo calcola il server. Il browser ne mostra un'anteprima
//     mentre si compila, ma prima di salvare o stampare si ricalcola qui: il
//     browser e' di chi lo usa, e un rating che finisce sotto una firma non
//     puo' arrivare da li'.
//
//  2. La pagina pubblica non tocca Supabase. Le tabelle hanno RLS attiva e
//     ZERO policy (sql/DA-APPROVARE-analisi-bisogni.sql): dal browser non si
//     legge e non si scrive niente, passa solo questo motore con la service
//     role. Un solo punto da sorvegliare invece di due.
//
//  3. Gli errori non fanno da elenco. A un codice sbagliato si risponde sempre
//     allo stesso modo, qualunque sia il motivo: distinguere «non esiste» da
//     «revocato» direbbe a un estraneo quali codici sono esistiti davvero, e
//     con qualche tentativo si scoprirebbe quali clienti hanno un'analisi in
//     corso.
// ═══════════════════════════════════════════════════════════════════════════════
import { Router } from 'express';
import { creaSnapshotRating, VERSIONE_REGOLE, VERSIONE_QUESTIONARIO } from './analisiBisogniRating.js';
import {
  generaToken, hashToken, calcolaScadenza, invitoUtilizzabile,
  perchePorteChiuse, mascheraRecapito, troppiTentativi, SCADENZE_AMMESSE,
} from './analisiBisogniInviti.js';
import { genOtp, sha, sendEmail, sendSms, shell, esc, uploadDoc, OTP_TTL_MIN } from './sign.js';
import { costruisciSnapshot, generaDocumento, VERSIONE_MOTORE_REPORT } from './analisiBisogniReport.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
const IAM_URL = (process.env.IAM_URL || 'https://iam.withusassicurazioni.it').replace(/\/$/, '');

/* PROVVISORIA. Va sostituita con l'informativa approvata dall'agenzia prima
   che la firmi un cliente vero (specifica 07 §1). La versione si salva insieme
   al consenso: quando il testo cambia, i consensi gia' raccolti continuano a
   dire A CHE COSA si riferivano. */
export const VERSIONE_PRIVACY = 'PRIV-PROVVISORIA-2026-08';

// ── Supabase con la service role ─────────────────────────────────────────────
function chiave() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata');
  return k;
}
function intestazioni(extra) {
  const k = chiave();
  return { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json', ...(extra || {}) };
}
async function sbGet(percorso) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${percorso}`, { headers: intestazioni() });
  if (!r.ok) throw new Error('Supabase: ' + (await r.text()).slice(0, 200));
  return r.json();
}
async function sbPost(tabella, righe) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}`, {
    method: 'POST', headers: intestazioni({ Prefer: 'return=representation' }),
    body: JSON.stringify(Array.isArray(righe) ? righe : [righe]),
  });
  if (!r.ok) throw new Error('Supabase insert: ' + (await r.text()).slice(0, 200));
  return r.json();
}
async function sbPatch(percorso, corpo) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${percorso}`, {
    method: 'PATCH', headers: intestazioni({ Prefer: 'return=representation' }), body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error('Supabase update: ' + (await r.text()).slice(0, 200));
  return r.json();
}

const AB = 'iam_analisi_bisogni';

/* L'audit dice CHE COSA e' successo, non che cosa ha risposto il cliente: le
   risposte stanno nella pratica, e ricopiarle qui moltiplicherebbe i posti da
   cui possono uscire. Non deve mai far fallire l'operazione che sta
   registrando: un registro rotto non e' una buona ragione per perdere il
   lavoro di chi sta compilando. */
async function evento(analisiId, tipo, attoreTipo, attoreId, dettagli) {
  try {
    await sbPost('iam_analisi_bisogni_eventi', {
      analisi_id: analisiId, tipo_evento: tipo, attore_tipo: attoreTipo,
      attore_id: attoreId || null, dettagli: dettagli || {},
    });
  } catch (e) { console.error('[analisi-bisogni] audit non scritto:', e.message); }
}

async function analisiPerId(id) {
  const r = await sbGet(`${AB}?id=eq.${encodeURIComponent(id)}&select=*`);
  return Array.isArray(r) ? r[0] : null;
}

/* Il punteggio autorevole. Si ricalcola SEMPRE dalle risposte salvate, mai da
   quello che arriva dal browser. */
function calcola(risposte) {
  const s = creaSnapshotRating(risposte || {});
  return {
    rating: s,
    indice_complessivo: s.indiceComplessivo,
    bisogno_principale: s.bisognoPrincipale,
    versione_regole: VERSIONE_REGOLE,
    versione_questionario: VERSIONE_QUESTIONARIO,
  };
}

/* Quello che la pagina pubblica puo' sapere. Non l'analisi intera: niente id
   interni, niente codice fiscale, niente altre pratiche. Il nome di battesimo
   serve solo a far capire al cliente che il link e' suo. */
function vistaPubblica(analisi, invito) {
  const a = analisi.risposte && analisi.risposte.anagrafica ? analisi.risposte.anagrafica : {};
  return {
    stato: analisi.stato,
    scade_il: invito.scade_il,
    cliente: { nome: a.nome || '' },
    risposte: analisi.risposte || {},
    versione_questionario: analisi.versione_questionario,
    versione_privacy: analisi.versione_privacy || VERSIONE_PRIVACY,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  AREA INTERNA
// ═══════════════════════════════════════════════════════════════════════════
export const analisiRouter = Router();

// Elenco delle analisi di un cliente
analisiRouter.get('/', async (req, res) => {
  try {
    const q = new URLSearchParams({ select: '*', order: 'creata_il.desc', limit: '50' });
    if (req.query.anagrafica_id) q.set('anagrafica_id', 'eq.' + req.query.anagrafica_id);
    res.json({ ok: true, items: await sbGet(`${AB}?${q}`) });
  } catch (e) { res.status(500).json({ errore: e.message }); }
});

// Apre una nuova analisi
analisiRouter.post('/', async (req, res) => {
  try {
    const { anagrafica_id, modalita } = req.body || {};
    if (!anagrafica_id) return res.status(400).json({ errore: 'Seleziona prima un cliente.' });
    if (!['agenzia', 'link'].includes(modalita)) return res.status(400).json({ errore: 'Modalità non valida.' });
    const [riga] = await sbPost(AB, {
      anagrafica_id, modalita, operatore_id: req.user && req.user.id,
      versione_questionario: VERSIONE_QUESTIONARIO, versione_regole: VERSIONE_REGOLE,
      versione_privacy: VERSIONE_PRIVACY,
      stato: modalita === 'agenzia' ? 'in_compilazione' : 'bozza',
    });
    await evento(riga.id, 'analisi_creata', 'operatore', req.user && req.user.id, { modalita });
    res.json({ ok: true, ...riga });
  } catch (e) { res.status(500).json({ errore: e.message }); }
});

analisiRouter.get('/:id', async (req, res) => {
  try {
    const a = await analisiPerId(req.params.id);
    if (!a) return res.status(404).json({ errore: 'Analisi non trovata.' });
    res.json({ ok: true, analisi: a });
  } catch (e) { res.status(500).json({ errore: e.message }); }
});

/* Salvataggio della bozza con controllo di versione. Operatore e cliente
   possono avere la stessa analisi aperta: senza questo controllo chi salva per
   secondo cancella il lavoro dell'altro, e nessuno dei due se ne accorge. */
analisiRouter.patch('/:id/risposte', async (req, res) => {
  try {
    const { risposte, versione_locale } = req.body || {};
    const a = await analisiPerId(req.params.id);
    if (!a) return res.status(404).json({ errore: 'Analisi non trovata.' });
    if (a.stato === 'firmata') {
      return res.status(409).json({ errore: 'Questa analisi è già stata firmata e non può essere modificata. Aprine una nuova.' });
    }
    if (versione_locale != null && versione_locale !== a.versione_locale) {
      return res.status(409).json({
        errore: 'Qualcun altro ha modificato questa analisi nel frattempo. Ricaricala prima di salvare.',
        versione_attuale: a.versione_locale,
      });
    }
    const [riga] = await sbPatch(`${AB}?id=eq.${encodeURIComponent(req.params.id)}`, {
      risposte: risposte || {}, versione_locale: a.versione_locale + 1,
      stato: a.stato === 'bozza' ? 'in_compilazione' : a.stato,
    });
    res.json({ ok: true, versione_locale: riga.versione_locale });
  } catch (e) { res.status(500).json({ errore: e.message }); }
});

// ── L'invito ────────────────────────────────────────────────────────────────
analisiRouter.post('/:id/inviti', async (req, res) => {
  try {
    const ore = Number(req.body && req.body.scadenza_ore) || 72;
    if (!SCADENZE_AMMESSE.includes(ore)) {
      return res.status(400).json({ errore: 'Scadenza non ammessa: scegli 24 ore, 3 giorni o 7 giorni.' });
    }
    const a = await analisiPerId(req.params.id);
    if (!a) return res.status(404).json({ errore: 'Analisi non trovata.' });
    if (a.stato === 'firmata') return res.status(409).json({ errore: 'Questa analisi è già firmata: non serve più un invito.' });

    /* Il codice esiste in chiaro solo qui e nel link consegnato. Nel database
       va la sua impronta: chi legge il database non deve poter aprire le
       analisi dei clienti. */
    const token = generaToken();
    const scade = calcolaScadenza(ore);
    await sbPost('iam_analisi_bisogni_inviti', {
      analisi_id: a.id, token_hash: hashToken(token), scade_il: scade.toISOString(),
    });
    await sbPatch(`${AB}?id=eq.${encodeURIComponent(a.id)}`, { stato: 'invito_creato' });
    await evento(a.id, 'invito_creato', 'operatore', req.user && req.user.id, { scadenza_ore: ore });

    res.json({
      ok: true,
      url: `${IAM_URL}/analisi-bisogni.html?t=${encodeURIComponent(token)}`,
      scade_il: scade.toISOString(),
    });
  } catch (e) { res.status(500).json({ errore: e.message }); }
});

analisiRouter.post('/:id/inviti/:invitoId/revoca', async (req, res) => {
  try {
    await sbPatch(`iam_analisi_bisogni_inviti?id=eq.${encodeURIComponent(req.params.invitoId)}&analisi_id=eq.${encodeURIComponent(req.params.id)}`,
      { revocato_il: new Date().toISOString() });
    await evento(req.params.id, 'invito_revocato', 'operatore', req.user && req.user.id, {});
    res.json({ ok: true });   // ripetibile senza effetti diversi
  } catch (e) { res.status(500).json({ errore: e.message }); }
});

analisiRouter.get('/:id/inviti', async (req, res) => {
  try {
    /* Mai il token_hash verso il browser: e' un segreto, e non serve a niente
       di quello che la schermata deve mostrare. */
    const r = await sbGet(`iam_analisi_bisogni_inviti?analisi_id=eq.${encodeURIComponent(req.params.id)}`
      + '&select=id,scade_il,revocato_il,aperto_il,completato_il,ultimo_accesso_il,creato_il&order=creato_il.desc');
    res.json({ ok: true, items: r });
  } catch (e) { res.status(500).json({ errore: e.message }); }
});

// Chiusura dall'area interna (compilazione in agenzia)
analisiRouter.post('/:id/completa', async (req, res) => {
  try {
    const a = await analisiPerId(req.params.id);
    if (!a) return res.status(404).json({ errore: 'Analisi non trovata.' });
    const c = calcola(a.risposte);
    const [riga] = await sbPatch(`${AB}?id=eq.${encodeURIComponent(a.id)}`, {
      ...c, stato: 'completata', completata_il: new Date().toISOString(),
    });
    await evento(a.id, 'analisi_completata', 'operatore', req.user && req.user.id,
      { indice: c.indice_complessivo, bisogno: c.bisogno_principale });
    res.json({ ok: true, analisi: riga });
  } catch (e) { res.status(500).json({ errore: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  IL CLIENTE DA CASA
// ═══════════════════════════════════════════════════════════════════════════
export const publicAnalisi = Router();

const CHIUSA = 'Questo link non è più valido. Chiedi al tuo consulente With Us un nuovo invito.';

/* Ritrova l'invito dal codice. Risponde con lo STESSO messaggio in tutti i
   casi in cui non si puo' entrare — inesistente, revocato, troppi tentativi —
   perche' rispondere in modo diverso trasformerebbe questa rotta in un elenco
   dei clienti con un'analisi aperta. */
async function apriConToken(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    || String((req.query && req.query.t) || '');
  if (!token || token.length < 20) return { errore: CHIUSA, codice: 403 };
  let inviti;
  try { inviti = await sbGet(`iam_analisi_bisogni_inviti?token_hash=eq.${hashToken(token)}&select=*`); }
  catch { return { errore: CHIUSA, codice: 403 }; }
  const invito = Array.isArray(inviti) ? inviti[0] : null;
  if (!invito || troppiTentativi(invito)) return { errore: CHIUSA, codice: 403 };
  if (!invitoUtilizzabile(invito)) return { errore: perchePorteChiuse(invito) || CHIUSA, codice: 403 };
  const analisi = await analisiPerId(invito.analisi_id);
  if (!analisi) return { errore: CHIUSA, codice: 403 };
  return { invito, analisi };
}

publicAnalisi.get('/sessione', async (req, res) => {
  try {
    const s = await apriConToken(req);
    if (s.errore) return res.status(s.codice).json({ errore: s.errore });
    const adesso = new Date().toISOString();
    const primaVolta = !s.invito.aperto_il;
    await sbPatch(`iam_analisi_bisogni_inviti?id=eq.${s.invito.id}`,
      primaVolta ? { aperto_il: adesso, ultimo_accesso_il: adesso } : { ultimo_accesso_il: adesso });
    if (primaVolta) {
      await sbPatch(`${AB}?id=eq.${s.analisi.id}`, { stato: 'aperta' });
      await evento(s.analisi.id, 'link_aperto', 'cliente', null, {});
    }
    res.json({ ok: true, ...vistaPubblica(s.analisi, s.invito) });
  } catch (e) { res.status(500).json({ errore: 'Non riusciamo ad aprire la tua analisi. Riprova fra qualche minuto.' }); }
});

publicAnalisi.patch('/risposte', async (req, res) => {
  try {
    const s = await apriConToken(req);
    if (s.errore) return res.status(s.codice).json({ errore: s.errore });
    if (s.analisi.stato === 'firmata') {
      return res.status(409).json({ errore: 'Questa analisi è già stata firmata e non può essere modificata.' });
    }
    await sbPatch(`${AB}?id=eq.${s.analisi.id}`, {
      risposte: (req.body && req.body.risposte) || {},
      versione_locale: s.analisi.versione_locale + 1,
      stato: 'in_compilazione',
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ errore: 'Non riusciamo a salvare. Riprova fra qualche minuto.' }); }
});

// ── Firma OTP: lo stesso metodo delle altre firme del sistema ───────────────
publicAnalisi.post('/privacy/otp/invia', async (req, res) => {
  try {
    const s = await apriConToken(req);
    if (s.errore) return res.status(s.codice).json({ errore: s.errore });
    const a = (s.analisi.risposte && s.analisi.risposte.anagrafica) || {};
    const recapito = a.email || '';
    if (!recapito) {
      return res.status(400).json({ errore: 'Manca l\'indirizzo email a cui inviare il codice. Contatta il tuo consulente With Us.' });
    }
    /* Attesa fra un invio e l'altro: senza, questa rotta diventa un modo per
       far arrivare messaggi a raffica a un indirizzo altrui. */
    const ultimo = s.invito.metadata && s.invito.metadata.otp_inviato_il;
    if (ultimo && Date.now() - new Date(ultimo).getTime() < 60000) {
      return res.status(429).json({ errore: 'Abbiamo appena inviato un codice. Attendi un minuto prima di chiederne un altro.' });
    }
    const codice = genOtp();
    await sbPatch(`iam_analisi_bisogni_inviti?id=eq.${s.invito.id}`, {
      metadata: {
        ...(s.invito.metadata || {}),
        // MAI il codice: solo la sua impronta, legata a questo invito.
        otp_hash: sha(codice + ':' + s.invito.id),
        otp_scade_il: new Date(Date.now() + OTP_TTL_MIN * 60000).toISOString(),
        otp_inviato_il: new Date().toISOString(),
      },
    });
    await sendEmail(recapito, 'Il tuo codice di firma — With Us Assicurazioni',
      shell('Firma la tua analisi dei bisogni',
        `<p>Gentile ${esc(a.nome || 'cliente')},<br>ecco il codice per firmare il consenso e concludere la tua analisi.</p>
         <div style="font-size:30px;font-weight:900;letter-spacing:8px;color:#1b2a6b;background:#eef2ff;border-radius:12px;padding:14px;text-align:center">${codice}</div>
         <p style="color:#6b7488;font-size:13px">Valido ${OTP_TTL_MIN} minuti. Se non hai richiesto tu questo codice, ignora il messaggio.</p>`));
    if (a.telefono) await sendSms(a.telefono, `With Us: il codice per firmare la tua analisi e' ${codice} (valido ${OTP_TTL_MIN} min).`);
    await evento(s.analisi.id, 'otp_richiesto', 'cliente', null, { recapito: mascheraRecapito(recapito) });
    res.json({ ok: true, recapito: mascheraRecapito(recapito) });
  } catch (e) { res.status(500).json({ errore: 'Non riusciamo a inviare il codice. Riprova fra qualche minuto.' }); }
});

publicAnalisi.post('/privacy/otp/verifica', async (req, res) => {
  try {
    const s = await apriConToken(req);
    if (s.errore) return res.status(s.codice).json({ errore: s.errore });
    const { codice, consensi } = req.body || {};
    if (!(consensi && consensi.privacy)) {
      return res.status(400).json({ errore: 'Per completare l\'analisi devi accettare l\'informativa privacy.' });
    }
    const m = s.invito.metadata || {};
    if (!m.otp_hash) return res.status(400).json({ errore: 'Chiedi prima l\'invio del codice.' });
    if (new Date(m.otp_scade_il).getTime() < Date.now()) {
      return res.status(410).json({ errore: 'Il codice è scaduto. Richiedine uno nuovo.' });
    }
    if (sha(String(codice) + ':' + s.invito.id) !== m.otp_hash) {
      await sbPatch(`iam_analisi_bisogni_inviti?id=eq.${s.invito.id}`,
        { tentativi_falliti: (s.invito.tentativi_falliti || 0) + 1 });
      await evento(s.analisi.id, 'otp_fallito', 'cliente', null, {});
      return res.status(401).json({ errore: 'Il codice non è corretto. Controlla il messaggio ricevuto o richiedine uno nuovo.' });
    }

    const adesso = new Date().toISOString();
    const a = (s.analisi.risposte && s.analisi.risposte.anagrafica) || {};
    const comune = {
      analisi_id: s.analisi.id, versione_testo: s.analisi.versione_privacy || VERSIONE_PRIVACY,
      accettato_il: adesso, recapito_mascherato: mascheraRecapito(a.email || ''),
      otp_riferimento: String(s.invito.id), otp_verificato_il: adesso, modalita: 'link',
    };
    /* Due righe distinte, e il marketing con il suo valore vero: e' un
       consenso separato e facoltativo, non puo' essere inglobato in quello
       necessario ne' darsi per acquisito insieme a lui. */
    await sbPost('iam_analisi_bisogni_consensi', [
      { ...comune, tipo: 'privacy', accettato: true },
      { ...comune, tipo: 'marketing', accettato: Boolean(consensi.marketing) },
    ]);

    const c = calcola(s.analisi.risposte);
    await sbPatch(`${AB}?id=eq.${s.analisi.id}`, {
      ...c, stato: 'firmata', completata_il: s.analisi.completata_il || adesso, firmata_il: adesso,
    });
    // Il link si chiude qui: dopo la firma le risposte non si toccano piu'.
    await sbPatch(`iam_analisi_bisogni_inviti?id=eq.${s.invito.id}`, { completato_il: adesso });
    await evento(s.analisi.id, 'analisi_firmata', 'cliente', null,
      { indice: c.indice_complessivo, bisogno: c.bisogno_principale, marketing: Boolean(consensi.marketing) });

    res.json({ ok: true, firmata_il: adesso, indice: c.indice_complessivo, rating: c.rating });
  } catch (e) { res.status(500).json({ errore: 'Non riusciamo a registrare la firma. Riprova fra qualche minuto.' }); }
});

// ── I due report ────────────────────────────────────────────────────────────
/* Si genera, si archivia, si registra. In quest'ordine e in una volta sola:
   il documento e' una fotografia, e una fotografia che si puo' rifare diversa
   non dimostra niente. Rigenerarlo con gli STESSI dati produce gli stessi
   byte e la stessa impronta, quindi non crea un doppione (il vincolo unico
   sulla tabella lo garantisce anche a database). */
async function fabbricaReport(analisi, tipi, operatore) {
  let anagrafica = null;
  if (analisi.anagrafica_id) {
    try {
      const r = await sbGet(`quote_anagrafiche?id=eq.${encodeURIComponent(analisi.anagrafica_id)}&select=nominativo`);
      anagrafica = Array.isArray(r) ? r[0] : null;
    } catch (_) { /* il nome sta comunque nelle risposte: non vale fermarsi qui */ }
  }
  const snap = costruisciSnapshot({ analisi, cliente: anagrafica, operatore });
  const fatti = [];
  for (const tipo of tipi) {
    const doc = generaDocumento(snap, tipo);
    const percorso = `analisi-bisogni/${analisi.id}/${tipo}-${snap.report_id}.${doc.estensione}`;
    await uploadDoc(percorso, doc.contenuto, doc.contentType);
    try {
      await sbPost('iam_analisi_bisogni_documenti', {
        analisi_id: analisi.id, tipo, percorso_storage: percorso, sha256: doc.sha256,
        snapshot: snap, motore_versione: VERSIONE_MOTORE_REPORT, generato_da: operatore ? null : null,
      });
    } catch (e) {
      /* Il vincolo unico (analisi, tipo, impronta) respinge il doppione: vuol
         dire che quel documento identico c'era gia', e va bene cosi'. */
      if (!/duplicate|unique/i.test(e.message)) throw e;
    }
    fatti.push({ tipo, nome_file: doc.nomeFile, sha256: doc.sha256, percorso });
  }
  return { snap, documenti: fatti };
}

analisiRouter.post('/:id/report', async (req, res) => {
  try {
    const a = await analisiPerId(req.params.id);
    if (!a) return res.status(404).json({ errore: 'Analisi non trovata.' });
    if (!a.risposte || !Object.keys(a.risposte).length) {
      return res.status(400).json({ errore: 'Non ci sono ancora risposte da cui generare un report.' });
    }
    const richiesti = (req.body && Array.isArray(req.body.tipi) && req.body.tipi.length)
      ? req.body.tipi.filter(t => ['cliente', 'agenzia'].includes(t))
      : ['cliente', 'agenzia'];
    const out = await fabbricaReport(a, richiesti, (req.user && req.user.email) || null);
    await evento(a.id, 'report_generato', 'operatore', req.user && req.user.id,
      { tipi: richiesti, report_id: out.snap.report_id });
    res.json({ ok: true, report_id: out.snap.report_id, documenti: out.documenti });
  } catch (e) { res.status(500).json({ errore: e.message }); }
});

/* Si serve dal motore e non con un indirizzo pubblico permanente: un documento
   con la situazione familiare e patrimoniale di una persona non puo' restare
   raggiungibile per sempre da chiunque ne indovini il percorso. */
analisiRouter.get('/:id/report/:tipo', async (req, res) => {
  try {
    if (!['cliente', 'agenzia'].includes(req.params.tipo)) return res.status(400).send('Tipo non valido');
    const righe = await sbGet(`iam_analisi_bisogni_documenti?analisi_id=eq.${encodeURIComponent(req.params.id)}`
      + `&tipo=eq.${req.params.tipo}&select=percorso_storage&order=generato_il.asc&limit=1`);
    const doc = Array.isArray(righe) ? righe[0] : null;
    if (!doc) return res.status(404).send('Report non ancora generato.');
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/documenti/${doc.percorso_storage}`, { headers: intestazioni() });
    if (!r.ok) return res.status(404).send('Report non più disponibile.');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(500).send('Errore: ' + e.message); }
});

/* Se un report di quel tipo esiste gia', si riprende quello. Rigenerarlo a
   ogni scaricamento darebbe un identificativo nuovo ogni volta e una riga in
   piu' nell'archivio: una fotografia che si rifa' diversa non dimostra
   niente, e dopo la firma il documento consegnato dev'essere sempre lo stesso
   — comprese le regole con cui e' nato, che intanto potrebbero essere
   cambiate. */
async function reportArchiviato(analisiId, tipo) {
  const righe = await sbGet(`iam_analisi_bisogni_documenti?analisi_id=eq.${encodeURIComponent(analisiId)}`
    + `&tipo=eq.${tipo}&select=percorso_storage&order=generato_il.asc&limit=1`);
  const doc = Array.isArray(righe) ? righe[0] : null;
  if (!doc) return null;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/documenti/${doc.percorso_storage}`, { headers: intestazioni() });
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

/* Il cliente scarica SOLO il suo, e solo dopo aver firmato. Prima della firma
   non esiste ancora un documento da consegnare: esistono risposte a meta'. */
publicAnalisi.get('/report/cliente', async (req, res) => {
  try {
    const s = await apriConToken(req);
    if (s.errore) return res.status(s.codice).send(s.errore);
    if (s.analisi.stato !== 'firmata') {
      return res.status(409).send('Il documento sarà disponibile dopo la firma.');
    }
    let contenuto = await reportArchiviato(s.analisi.id, 'cliente');
    if (!contenuto) {
      const out = await fabbricaReport(s.analisi, ['cliente'], null);
      contenuto = generaDocumento(out.snap, 'cliente').contenuto;
    }
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(contenuto);
  } catch (e) { res.status(500).send('Non riusciamo a preparare il documento. Riprova fra qualche minuto.'); }
});
