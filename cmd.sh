#!/usr/bin/env bash
# Fonti — quale chiave apre quale credenziale?
# ATTENZIONE PRIVACY: questo script non stampa MAI un segreto ne' un valore
# decifrato. Stampa solo booleani ("si apre / non si apre") e impronte
# non reversibili (hash dell'hash), che servono solo a confrontare due chiavi.
set -u
cd /opt/withus-backend || exit 1

echo "== il backend carica un EnvironmentFile? =="
systemctl cat withus-backend 2>/dev/null | grep -iE 'EnvironmentFile|^Environment=|WorkingDirectory|ExecStart' | sed 's/=.*SECRET.*/=<nascosto>/'

echo
echo "== gli scraper caricano un EnvironmentFile? =="
for s in /etc/systemd/system/*scraper*.service; do
  n=$(basename "$s")
  e=$(grep -c '^EnvironmentFile=' "$s" 2>/dev/null)
  printf '%-28s EnvironmentFile attivi: %s\n' "$n" "$e"
done

echo
echo "== prova delle due chiavi su ogni credenziale salvata =="
node -e '
const fs=require("fs"), crypto=require("crypto");

// chiave A: quella che il backend userebbe leggendo server/.env
let daEnv=null;
try {
  const t=fs.readFileSync("server/.env","utf8");
  const m=t.match(/^\s*FONTI_SECRET\s*=\s*(.*)$/m);
  if (m) daEnv=m[1].trim().replace(/^["\x27]|["\x27]$/g,"");
} catch {}
// chiave B: quella derivata, usata da chi NON ha FONTI_SECRET in ambiente
const derivata = "withus-fonti-" + (process.env.HOSTNAME || "vps") + "-v1";

const kdi = s => crypto.createHash("sha256").update(s).digest();
const impronta = k => crypto.createHash("sha256").update(k).digest("hex").slice(0,12);
const A = daEnv ? kdi(daEnv) : null, B = kdi(derivata);

console.log("FONTI_SECRET presente in server/.env : " + (daEnv ? "si" : "no"));
console.log("impronta chiave A (da .env)          : " + (A ? impronta(A) : "-"));
console.log("impronta chiave B (derivata)         : " + impronta(B));
console.log("le due chiavi coincidono?            : " + (A && impronta(A)===impronta(B) ? "SI" : "NO"));

function apre(k, blob){
  if (!k || !blob || !String(blob).startsWith("v1:")) return null;
  try {
    const raw=Buffer.from(String(blob).slice(3),"base64");
    const d=crypto.createDecipheriv("aes-256-gcm",k,raw.subarray(0,12));
    d.setAuthTag(raw.subarray(12,28));
    const v=Buffer.concat([d.update(raw.subarray(28)),d.final()]).toString("utf8");
    return v.length>0;              // solo "si apre e non e vuoto": mai il valore
  } catch { return false; }
}

let store={}; try { store=JSON.parse(fs.readFileSync("server/fonti.store.json","utf8")); } catch(e){ console.log("store illeggibile"); process.exit(0); }
const campi=["username","password","totp","totpSecret","totp_secret","otp_secret","otpSecret","secret_totp","otp","codice"];

function esamina(etichetta, s){
  const righe=[];
  for (const c of campi){
    if (!s || s[c]==null || s[c]==="") continue;
    righe.push("    " + c.padEnd(12) + " A(.env)=" + String(apre(A,s[c])) + "  B(derivata)=" + String(apre(B,s[c])));
  }
  if (!righe.length) return;
  console.log("  " + etichetta);
  console.log(righe.join("\n"));
}

console.log("\n--- fonti built-in ---");
for (const id of ["24h","allianz"]) esamina(id, store[id]);
console.log("--- fonti custom ---");
for (const [id,s] of Object.entries(store.__custom||{})) esamina(id + "  (" + (s.nome||"?") + ")", s);
'
