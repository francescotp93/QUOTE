#!/usr/bin/env bash
# Allianz: cosa c'e' davvero nel campo del segreto TOTP?
# PRIVACY: stampa SOLO lunghezza e forma. Mai il valore.
set -u
cd /opt/withus-backend || exit 1

node -e '
const fs=require("fs"), crypto=require("crypto");
let seg=null;
try { const m=fs.readFileSync("server/.env","utf8").match(/^\s*FONTI_SECRET\s*=\s*(.*)$/m); if(m) seg=m[1].trim().replace(/^["\x27]|["\x27]$/g,""); } catch {}
const K = s => crypto.createHash("sha256").update(s).digest();
const chiavi = { attuale: seg && K(seg), vecchia: K("withus-fonti-vps-v1") };
function apri(k, b){ if(!k||!b||!String(b).startsWith("v1:")) return null;
  try { const r=Buffer.from(String(b).slice(3),"base64"); const d=crypto.createDecipheriv("aes-256-gcm",k,r.subarray(0,12));
    d.setAuthTag(r.subarray(12,28)); return Buffer.concat([d.update(r.subarray(28)),d.final()]).toString("utf8"); } catch { return null; } }
const st = JSON.parse(fs.readFileSync("server/fonti.store.json","utf8"));
const a = st.allianz || {};
for (const campo of ["totp","codice"]) {
  if (!a[campo]) { console.log(campo.padEnd(8) + " : assente"); continue; }
  let val=null, con=null;
  for (const [nome,k] of Object.entries(chiavi)) { const v=apri(k,a[campo]); if (v!==null) { val=v; con=nome; break; } }
  if (val===null) { console.log(campo.padEnd(8) + " : presente ma NON si apre con nessuna chiave"); continue; }
  const soloCifre = /^[0-9]+$/.test(val);
  const base32ok = /^[A-Z2-7]+=*$/i.test(val.replace(/\s/g,""));
  console.log(campo.padEnd(8) + " : " + val.length + " caratteri, si apre con la chiave " + con +
    " | solo cifre: " + soloCifre + " | forma base32: " + base32ok +
    (campo==="totp" ? (val.length>=16 && base32ok ? "  -> SEME PLAUSIBILE" : "  -> NON e un seme: e un codice") : ""));
}
'
echo
echo "== cosa dice lo scraper adesso =="
curl -s -m 12 http://127.0.0.1:4200/status | head -c 300
echo
echo
echo "== ultimi tentativi di accesso Allianz =="
journalctl -u allianz-scraper --since "-40 min" --no-pager 2>/dev/null | grep -iE "autoLogin|passcode|monouso|TOTP|Duo|accettato" | tail -12
