#!/usr/bin/env bash
# Posta che resta in caricamento — dove si ferma davvero.
# PRIVACY: gli indirizzi escono mascherati (a***@dominio). Nessuna password.
set -u
cd /opt/withus-backend || exit 1

echo "== macchina =="
echo "commit : $(git log -1 --pretty='%h %ad %s' --date=short)"
echo "backend: $(systemctl is-active withus-backend)  da $(systemctl show withus-backend -p ActiveEnterTimestamp --value)"

echo
echo "== quante caselle sono configurate, e come =="
cat > /tmp/posta.mjs <<'JS'
const mask = e => { const [a,d] = String(e).split('@'); return (a||'?').slice(0,1) + '***@' + (d||'?'); };
process.chdir('/opt/withus-backend');
const { caselleMailStore } = await import('/opt/withus-backend/server/fonti.js');
let daPannello = [];
try { daPannello = caselleMailStore(); } catch (e) { console.log('pannello illeggibile: ' + e.message); }
console.log('  dal Pannello Fonti : ' + daPannello.length);
for (const c of daPannello) console.log('      ' + mask(c.email) + '  password=' + (c.pass ? 'letta (' + c.pass.length + ' car.)' : 'VUOTA') + '  imap=' + (c.imapHost || '(dedotto)'));
let daEnv = 0;
if (process.env.MAIL_USER && process.env.MAIL_PASS) { daEnv++; console.log('      [env] ' + mask(process.env.MAIL_USER)); }
for (let i = 2; i <= 8; i++) if (process.env['MAIL_USER_' + i] && process.env['MAIL_PASS_' + i]) { daEnv++; console.log('      [env] ' + mask(process.env['MAIL_USER_' + i])); }
console.log('  dalle variabili    : ' + daEnv);
JS
set -a; . server/.env 2>/dev/null; set +a
node /tmp/posta.mjs 2>&1 | head -30

echo
echo "== prova di collegamento IMAP, una casella per volta, con cronometro =="
cat > /tmp/imap.mjs <<'JS'
import { ImapFlow } from '/opt/withus-backend/server/node_modules/imapflow/lib/imap-flow.js';
const mask = e => { const [a,d] = String(e).split('@'); return (a||'?').slice(0,1) + '***@' + (d||'?'); };
const { caselleMailStore } = await import('/opt/withus-backend/server/fonti.js');
function prov(email) {
  const dom = (String(email).split('@')[1] || '').toLowerCase();
  if (/(^|\.)gmail\.com$|googlemail\.com$/.test(dom)) return 'imap.gmail.com';
  if (/aruba\.it$|withusassicurazioni\.it$|withus\.coop$/.test(dom)) return 'imaps.aruba.it';
  return 'mail.' + dom;
}
const caselle = [];
try { for (const c of caselleMailStore()) caselle.push(c); } catch {}
if (process.env.MAIL_USER && process.env.MAIL_PASS) caselle.push({ email: process.env.MAIL_USER, pass: process.env.MAIL_PASS });
for (let i = 2; i <= 8; i++) if (process.env['MAIL_USER_' + i]) caselle.push({ email: process.env['MAIL_USER_' + i], pass: process.env['MAIL_PASS_' + i] });
for (const c of caselle) {
  const host = c.imapHost || prov(c.email);
  const t0 = Date.now();
  const cl = new ImapFlow({ host, port: 993, secure: true, auth: { user: c.email, pass: c.pass }, logger: false, greetingTimeout: 15000, socketTimeout: 30000 });
  let esito;
  try {
    await Promise.race([cl.connect(), new Promise((_, r) => setTimeout(() => r(new Error('TIMEOUT 30s')), 30000))]);
    const st = await cl.status('INBOX', { unseen: true, messages: true });
    esito = 'OK  non lette=' + st.unseen + ' totali=' + st.messages;
    try { await cl.logout(); } catch {}
  } catch (e) {
    esito = 'ERRORE  ' + String(e.message || e).replace(new RegExp(c.email, 'gi'), mask(c.email)).slice(0, 160);
    try { cl.close(); } catch {}
  }
  console.log('  ' + mask(c.email).padEnd(28) + host.padEnd(22) + (Date.now() - t0) + 'ms  ' + esito);
}
JS
timeout 240 node /tmp/imap.mjs 2>&1 | head -30
rm -f /tmp/posta.mjs /tmp/imap.mjs

echo
echo "== il backend risponde sulle rotte posta? (401 = vivo e protetto) =="
for r in /mail/accounts /mail/unread; do
  t0=$(date +%s%N); code=$(curl -s -o /dev/null -m 30 -w '%{http_code}' "http://127.0.0.1:3000$r"); t1=$(date +%s%N)
  echo "  $r -> $code in $(( (t1-t0)/1000000 ))ms"
done

echo
echo "== errori posta nei log del backend (ultime 24h) =="
journalctl -u withus-backend --since '-24h' --no-pager 2>/dev/null | grep -iE 'imap|mail|posta' | grep -iE 'error|errore|timeout|fail|ECONN|EAUTH' | tail -15 || echo "(nessuno)"
