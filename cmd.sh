#!/usr/bin/env bash
# Stato REALE di Allianz e Groupama dopo il rilascio della PR 48.
# PRIVACY: dei campi cifrati si stampa solo lunghezza e forma. Mai il valore.
set -u
cd /opt/withus-backend || exit 1

echo "== che codice gira qui =="
git log --oneline -1 2>/dev/null
grep -c 'esitoCodiceRifiutato' scraper/allianz/quote-service.mjs 2>/dev/null | sed 's/^/allianz nuovo (atteso >0): /'
grep -c 'motivoNonLoggato' scraper/groupama/quote-service.mjs 2>/dev/null | sed 's/^/groupama nuovo (atteso >0): /'
grep -c 'semeRifiutato' server/fonti.js 2>/dev/null | sed 's/^/backend nuovo (atteso >0): /'
echo

echo "== i campi cifrati, e con quale chiave si aprono =="
node -e '
const fs=require("fs"), crypto=require("crypto");
let seg=null;
try { const m=fs.readFileSync("server/.env","utf8").match(/^\s*FONTI_SECRET\s*=\s*(.*)$/m); if(m) seg=m[1].trim().replace(/^["\x27]|["\x27]$/g,""); } catch {}
const K = s => crypto.createHash("sha256").update(s).digest();
const chiavi = {}; if (seg) chiavi.attuale = K(seg);
chiavi.derivata_vps = K("withus-fonti-vps-v1");
chiavi.derivata_host = K("withus-fonti-" + (process.env.HOSTNAME||"vps") + "-v1");
function apri(k,b){ if(!k||!b||!String(b).startsWith("v1:")) return null;
  try { const r=Buffer.from(String(b).slice(3),"base64"); const d=crypto.createDecipheriv("aes-256-gcm",k,r.subarray(0,12));
    d.setAuthTag(r.subarray(12,28)); return Buffer.concat([d.update(r.subarray(28)),d.final()]).toString("utf8"); } catch { return null; } }
console.log("FONTI_SECRET in server/.env:", seg ? "presente" : "ASSENTE (si usa la chiave derivata)");
const st = JSON.parse(fs.readFileSync("server/fonti.store.json","utf8"));
const dove = (id) => st[id] || (st.__custom||{})[id] || null;
for (const id of ["allianz","groupama","axa"]) {
  const a = dove(id); console.log("== " + id.toUpperCase() + (a ? "" : " : NON TROVATA") + " ==");
  if (!a) continue;
  console.log("  codice_ts: " + (a.codice_ts ? new Date(a.codice_ts).toISOString() : "assente"));
  for (const campo of ["username","password","totp","totpSecret","codice"]) {
    if (!a[campo]) continue;
    let val=null, con=null;
    for (const [nome,k] of Object.entries(chiavi)) { const v=apri(k,a[campo]); if (v!==null) { val=v; con=nome; break; } }
    if (val===null) { console.log("  " + campo.padEnd(11) + ": presente ma NON si apre con nessuna chiave -> per il servizio e VUOTO"); continue; }
    const cifre=/^[0-9]+$/.test(val), b32=/^[A-Z2-7]+=*$/i.test(val.replace(/\s/g,""));
    console.log("  " + campo.padEnd(11) + ": " + val.length + " caratteri, chiave " + con +
      ((campo==="totp"||campo==="totpSecret"||campo==="codice") ? " | solo cifre: "+cifre+" | base32: "+b32 : "") +
      ((campo.startsWith("totp")) ? (val.length>=16 && b32 ? "  -> SEME OK" : "  -> NON e un seme") : "") +
      (con!=="attuale" && seg ? "   [!] CHIAVE DIVERSA DA QUELLA IN USO" : ""));
  }
}
'
echo

echo "== /status Allianz (4200) =="
curl -s -m 15 http://127.0.0.1:4200/status; echo; echo
echo "== /status Groupama (4500) =="
curl -s -m 15 http://127.0.0.1:4500/status; echo; echo

echo "== GROUPAMA: provo ad accedere e leggo il motivo vero =="
curl -s -m 20 -X POST http://127.0.0.1:4500/accedi > /dev/null 2>&1
for i in $(seq 1 20); do sleep 5; S=$(curl -s -m 8 http://127.0.0.1:4500/loginstate); echo "  $i) $S";
  case "$S" in *loggato*|*attesa_otp*|*non_loggato*|*error*) break;; esac; done
echo

echo "== ultimi log Groupama =="
journalctl -u groupama-scraper --since "-10 min" --no-pager 2>/dev/null | tail -20
echo
echo "== ultimi log Allianz =="
journalctl -u allianz-scraper --since "-15 min" --no-pager 2>/dev/null | tail -20
