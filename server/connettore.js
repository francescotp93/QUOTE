// ═══════════════════════════════════════════════════════════════════════════════
//  CONNETTORE — dove atterrano le catture dell'estensione Chrome
//
//  «Creiamo l'estensione aggiornata per Chrome che mappa solo i domini che ci
//  interessano e porta automaticamente tutti i dati che ci servono»
//  (Francesco, 10/09/2026). L'estensione registra le chiamate degli otto
//  portali mentre l'agente fa un preventivo; questo modulo e' il posto dove
//  quelle catture ARRIVANO e si CONSERVANO — prima finivano in una textarea da
//  copiare a mano e incollare in chat, e la storia non c'era.
//
//  DUE PORTE, DUE CHIAVI.
//  - L'estensione non ha il token di IAM (vive nel browser, fuori dalla
//    pagina): consegna con una CHIAVE SUA, data da IAM al momento del
//    collegamento. Sul server resta solo l'impronta (sha256): chi legge il
//    file non puo' rifarsi la chiave. La chiave apre UNA porta sola — «deposita
//    una cattura» — e niente altro.
//  - Leggere, elencare e cancellare le catture e' roba da Super Admin, dietro
//    lo stesso cancello del resto del pannello Fonti.
//
//  Le catture stanno su disco (server/catture/), non nel database: sono
//  materiale di studio, pesano fino a 8 MB l'una, e non devono finire in una
//  tabella che si legge dal browser. Niente migrazioni, niente RLS da scrivere.
//
//  La logica e' in una funzione senza Express (creaConnettore), cosi' le prove
//  girano anche dove express non e' installato (server/verifica/connettore.test.mjs).
// ═══════════════════════════════════════════════════════════════════════════════
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const PORTALI_CONNETTORE = ['italiana', 'hdi', 'allianz', 'prima', 'groupama', 'axa', 'sara', '24h'];
export const MAX_CATTURA_BYTE = 8 * 1024 * 1024;
export const MAX_CHIAMATE = 2000;

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const idBuono = (id) => /^c[a-z0-9]{5,40}$/.test(String(id || ''));   // solo gli id che salvaCattura conia: «indice» e «..» restano fuori

export function creaConnettore({ load, save, cartella }) {
  const indicePath = path.join(cartella, 'indice.json');
  const assicuraCartella = () => { try { fs.mkdirSync(cartella, { recursive: true }); } catch {} };
  const leggiIndice = () => { try { return JSON.parse(fs.readFileSync(indicePath, 'utf8')) || []; } catch { return []; } };
  const scriviIndice = (i) => { assicuraCartella(); fs.writeFileSync(indicePath, JSON.stringify(i, null, 2)); };

  const chiaviDi = (store) => ((store.__connettore || {}).chiavi) || [];

  /* Una chiave per browser collegato: si puo' revocare una senza toccare le
     altre. Il nome e' quello che IAM manda (di solito il browser).
     DUE RUOLI, che non si scambiano: «deposito» e' la chiave dell'estensione
     e apre solo la porta per lasciare una cattura; «lettura» e' la chiave di
     chi le legge da fuori — Giulia, dalla sua sessione — e apre solo le porte
     per elencarle e leggerle. «Non c'e' un modo per tu vedere in automatico le
     catture quando ti chiedo di vederle?» (Francesco, 10/09/2026). */
  function chiaveNuova(nome, ruolo) {
    ruolo = ruolo === 'lettura' ? 'lettura' : 'deposito';
    const chiave = (ruolo === 'lettura' ? 'wul_' : 'wuc_') + crypto.randomBytes(32).toString('base64url');
    const id = 'k' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
    const store = load();
    store.__connettore = store.__connettore || {};
    store.__connettore.chiavi = chiaviDi(store).concat([{ id, nome: String(nome || 'browser').slice(0, 120), ruolo, hash: sha(chiave), creato: new Date().toISOString() }]);
    if (!save(store)) throw new Error('non riesco a salvare la chiave');
    return { id, chiave, ruolo };
  }
  function chiaveRevoca(id) {
    const store = load();
    const prima = chiaviDi(store);
    const dopo = prima.filter(k => k.id !== id);
    if (dopo.length === prima.length) return false;
    store.__connettore = Object.assign({}, store.__connettore, { chiavi: dopo });
    return save(store);
  }
  /* Confronto a tempo costante sulle impronte: una chiave sbagliata non deve
     rispondere piu' in fretta di una giusta. */
  function verifica(chiave, ruolo) {
    ruolo = ruolo || 'deposito';
    if (!/^wu[cl]_[A-Za-z0-9_-]{20,}$/.test(String(chiave || ''))) return null;
    const h = Buffer.from(sha(chiave), 'hex');
    for (const k of chiaviDi(load())) {
      let hk; try { hk = Buffer.from(String(k.hash || ''), 'hex'); } catch { continue; }
      if (hk.length === h.length && crypto.timingSafeEqual(hk, h)) return (k.ruolo || 'deposito') === ruolo ? k.id : null;
    }
    return null;
  }

  /* Cosa si accetta: una forma sola, con limiti detti. Una cattura fuori forma
     viene rifiutata con il motivo, non salvata «piu' o meno». */
  function controlla(c) {
    if (!c || typeof c !== 'object') return 'corpo mancante';
    if (!PORTALI_CONNETTORE.includes(c.portale)) return 'portale sconosciuto: ' + String(c.portale || '').slice(0, 30);
    if (!String(c.caso || '').trim()) return 'manca il caso: una cattura senza caso e\' muta';
    if (!Array.isArray(c.chiamate)) return 'chiamate mancanti';
    if (c.chiamate.length > MAX_CHIAMATE) return 'troppe chiamate (' + c.chiamate.length + ' > ' + MAX_CHIAMATE + ')';
    const peso = Buffer.byteLength(JSON.stringify(c));
    if (peso > MAX_CATTURA_BYTE) return 'cattura troppo grande (' + Math.round(peso / 1048576) + ' MB > 8 MB)';
    return null;
  }

  function salvaCattura(c, daChiave) {
    const errore = controlla(c);
    if (errore) return { ok: false, error: errore };
    const id = 'c' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
    const quando = new Date().toISOString();
    const record = {
      id, quando, portale: c.portale, caso: String(c.caso).trim().slice(0, 300),
      avvio: c.avvio || null, fine: c.fine || null, fermata: String(c.fermata || '').slice(0, 120),
      versione_estensione: String(c.versione || '').slice(0, 20), da: daChiave || null,
      chiamate: c.chiamate,
    };
    assicuraCartella();
    fs.writeFileSync(path.join(cartella, id + '.json'), JSON.stringify(record));
    const byte = Buffer.byteLength(JSON.stringify(record));
    const voce = { id, quando, portale: record.portale, caso: record.caso, n: c.chiamate.length, byte, fermata: record.fermata, da: record.da };
    scriviIndice([voce].concat(leggiIndice()).slice(0, 500));
    return { ok: true, id, n: voce.n, byte };
  }
  function elenco() { return leggiIndice(); }
  function leggi(id) {
    if (!idBuono(id)) return null;
    try { return JSON.parse(fs.readFileSync(path.join(cartella, id + '.json'), 'utf8')); } catch { return null; }
  }
  function elimina(id) {
    if (!idBuono(id)) return false;
    try { fs.unlinkSync(path.join(cartella, id + '.json')); } catch {}
    const prima = leggiIndice();
    const dopo = prima.filter(v => v.id !== id);
    scriviIndice(dopo);
    return dopo.length !== prima.length;
  }
  function riepilogo() {
    const chiavi = chiaviDi(load()).map(k => ({ id: k.id, nome: k.nome, ruolo: k.ruolo || 'deposito', creato: k.creato }));
    const catture = leggiIndice();
    return { chiavi, catture: catture.length, ultima: catture[0] || null, portali: PORTALI_CONNETTORE };
  }

  return { chiaveNuova, chiaveRevoca, verifica, controlla, salvaCattura, elenco, leggi, elimina, riepilogo };
}

/* Le rotte. `fontiRouter` e' gia' dietro il cancello del Super Admin quando
   arriva qui; `publicFontiRouter` no, e ci sta solo la porta con la chiave. */
export function montaConnettore({ fontiRouter, publicFontiRouter, load, save, cartella }) {
  const C = creaConnettore({ load, save, cartella });

  publicFontiRouter.post('/connettore/catture', (req, res) => {
    const chiave = req.get('x-connettore-chiave') || '';
    const da = C.verifica(chiave);
    if (!da) return res.status(401).json({ ok: false, error: 'chiave del connettore non riconosciuta: ricollega l\'estensione da IAM' });
    const r = C.salvaCattura(req.body, da);
    if (!r.ok) return res.status(400).json(r);
    res.json(r);
  });

  /* La porta di LETTURA con la chiave: per chi legge da fuori (Giulia). Solo
     elenco e lettura, mai cancellazione, mai chiavi. */
  const conChiaveDiLettura = (req, res, next) => {
    const da = C.verifica(req.get('x-connettore-chiave') || '', 'lettura');
    if (!da) return res.status(401).json({ ok: false, error: 'chiave di lettura non riconosciuta' });
    req.chiaveLettura = da; next();
  };
  publicFontiRouter.get('/connettore/lettura/catture', conChiaveDiLettura, (req, res) => res.json({ ok: true, catture: C.elenco() }));
  publicFontiRouter.get('/connettore/lettura/catture/:id', conChiaveDiLettura, (req, res) => {
    const c = C.leggi(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'cattura non trovata' });
    res.json(c);
  });

  fontiRouter.get('/connettore', (req, res) => res.json(C.riepilogo()));
  fontiRouter.post('/connettore/chiave', (req, res) => {
    try { res.json(Object.assign({ ok: true }, C.chiaveNuova((req.body || {}).nome, (req.body || {}).ruolo))); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  fontiRouter.delete('/connettore/chiave/:id', (req, res) => res.json({ ok: C.chiaveRevoca(req.params.id) }));
  fontiRouter.get('/connettore/catture', (req, res) => res.json({ catture: C.elenco() }));
  fontiRouter.get('/connettore/catture/:id', (req, res) => {
    const c = C.leggi(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'cattura non trovata' });
    res.json(c);
  });
  fontiRouter.delete('/connettore/catture/:id', (req, res) => res.json({ ok: C.elimina(req.params.id) }));
  return C;
}
