// ═══════════════════════════════════════════════════════════════════════════════
//  IL CAMPO DEL SEME ACCETTA SOLO SEMI (e si puo' svuotare)
//
//  PERCHE' ESISTE
//    Il 2 settembre 2026, nel campo «SEGRETO TOTP» di Allianz, c'erano sei
//    cifre: il codice che si legge sull'app, incollato nella casella accanto.
//    Il pannello l'ha preso senza dire niente, e da li' in poi ogni accesso
//    automatico e' fallito — con messaggi che davano la colpa al seme.
//
//    Due difetti, non uno:
//      1. il valore sbagliato veniva ACCETTATO (si poteva fermare all'ingresso);
//      2. una volta dentro, non si poteva piu' TOGLIERE — salvare a campo vuoto
//         vuol dire «non cambiare nulla», che e' giusto per la password e
//         micidiale per un valore sbagliato.
//    Qui si provano tutti e due, piu' il fatto che il rifiuto SPIEGHI.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import crypto from 'crypto';
import express from 'express';
import http from 'http';

const STORE = '/tmp/fonti.seme.test.json';
try { fs.unlinkSync(STORE); } catch {}
process.env.FONTI_STORE = STORE;
process.env.FONTI_SECRET = 'seme-di-prova';   // chiave nota: cosi' la prova puo' scrivere nello store
const leggiStore = () => { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; } };
// Stessa cassaforte del modulo (v1:base64(iv|tag|testo)): serve per piantare nello
// store un valore sbagliato, cioe' la situazione in cui il server si trova gia'.
const cifra = t => { const K = crypto.createHash('sha256').update(process.env.FONTI_SECRET).digest();
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', K, iv);
  const ct = Buffer.concat([c.update(String(t), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64'); };
/* Store di partenza: Allianz con dentro il valore sbagliato di quel giorno,
   scritto dal vero enc() del modulo (cosi' la prova legge quello che leggerebbe
   il servizio, non una finzione). */
const { fontiRouter } = await import('./fonti.js');

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { email: 'francesco.oddo199307@gmail.com' }; next(); });
app.use('/fonti', fontiRouter);
const srv = await new Promise(r => { const s = http.createServer(app).listen(0, '127.0.0.1', () => r(s)); });
const BASE = 'http://127.0.0.1:' + srv.address().port;

const chiama = async (metodo, via, corpo) => {
  const r = await fetch(BASE + via, {
    method: metodo,
    headers: corpo ? { 'content-type': 'application/json' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { stato: r.status, dati: await r.json().catch(() => ({})) };
};

const esiti = [];
const prova = async (n, f) => { try { esiti.push([true, n, (await f()) || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

const SEME = 'JBSWY3DPEHPK3PXP';        // 16 caratteri base32: un seme vero
const CODICE = '481920';                 // sei cifre: quello che si legge sull'app

await prova('sei cifre nel campo del seme vengono RIFIUTATE', async () => {
  const r = await chiama('POST', '/fonti/allianz/credenziali', { username: 'wu', totp_secret: CODICE });
  deve(r.stato === 400, 'il pannello le accetta ancora (stato ' + r.stato + ')');
  const st = leggiStore();
  deve(!(st.allianz && st.allianz.totp), 'il valore sbagliato e\' finito nello store lo stesso');
  return 'fermate all\'ingresso, dove si puo\' ancora spiegare';
});

await prova('il rifiuto dice PERCHE\', e cosa serve davvero', async () => {
  const r = await chiama('POST', '/fonti/allianz/credenziali', { username: 'wu', totp_secret: CODICE });
  const m = r.dati.error || '';
  deve(/CODICE/.test(m), 'non dice che quello e\' il codice: ' + m);
  deve(/QR|configuri/i.test(m), 'non dice dove sta il seme vero: ' + m);
  deve(/vuoto/.test(m), 'non indica la via d\'uscita per chi il seme non ce l\'ha: ' + m);
  return 'un rifiuto che insegna';
});

await prova('un seme vero passa', async () => {
  const r = await chiama('POST', '/fonti/allianz/credenziali', { username: 'wu', totp_secret: SEME });
  deve(r.stato === 200, 'rifiuta un seme valido (stato ' + r.stato + '): ' + (r.dati.error || ''));
  const st = leggiStore();
  deve(!!st.allianz.totp, 'il seme buono non e\' stato salvato');
  return 'la porta si chiude solo su quello che va fermato';
});

await prova('un seme salvato si puo\' SVUOTARE', async () => {
  const r = await chiama('DELETE', '/fonti/allianz/totp');
  deve(r.stato === 200, 'non si puo\' svuotare (stato ' + r.stato + ')');
  const st = leggiStore();
  deve(!st.allianz.totp, 'il campo e\' ancora pieno dopo lo svuotamento');
  deve(!!st.allianz.username, 'lo svuotamento del seme si e\' portato via anche l\'utente');
  return 'un valore sbagliato ora ha una via d\'uscita';
});

await prova('lo svuotamento porta via anche gli alias storici', async () => {
  // Il seme e' stato scritto per anni sotto nomi diversi (totpSecret, otp_secret…).
  // Cancellare solo `totp` lo lascerebbe in vita: storedTotp() lo ritroverebbe.
  const st = leggiStore();
  st.allianz.totpSecret = 'v1:finto'; st.allianz.otp_secret = 'v1:finto';
  fs.writeFileSync(STORE, JSON.stringify(st));
  await chiama('DELETE', '/fonti/allianz/totp');
  const dopo = leggiStore();
  deve(!dopo.allianz.totpSecret && !dopo.allianz.otp_secret, 'un alias e\' sopravvissuto allo svuotamento');
  return 'sparisce davvero, non solo dal nome principale';
});

await prova('il pannello VEDE che li\' dentro non c\'e\' un seme', async () => {
  /* Un valore sbagliato gia' nello store — com'e' sul server dal 2 settembre —
     non si puo' rifiutare a posteriori: si puo' pero' DIRLO, invece di mostrare
     la fonte come configurata a dovere. */
  const st = leggiStore();
  st.allianz.totp = cifra('481920');            // sei cifre: il codice, non il seme
  fs.writeFileSync(STORE, JSON.stringify(st));
  let a = ((await chiama('GET', '/fonti')).dati.fonti || []).find(x => x.id === 'allianz');
  deve(a, 'Allianz non compare nell\'elenco fonti');
  deve(a.totp_non_e_un_seme === true, 'l\'elenco non segnala il valore sbagliato gia\' salvato');
  deve(a.ha_totp === true, 'nasconde che il campo e\' pieno: sono due informazioni diverse');

  // E con un seme vero, nessun allarme.
  st.allianz.totp = cifra('JBSWY3DPEHPK3PXP');
  fs.writeFileSync(STORE, JSON.stringify(st));
  a = ((await chiama('GET', '/fonti')).dati.fonti || []).find(x => x.id === 'allianz');
  deve(a.totp_non_e_un_seme === false, 'con un seme valido segnala comunque un problema');
  return 'il pannello ha finalmente il dato per avvisare';
});

srv.close();
const ko = esiti.filter(e => !e[0]);
console.log('\n── Il campo del seme ────────────────────────────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
