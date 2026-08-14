#!/usr/bin/env bash
# Fonti — cosa risponde davvero /status di ogni scraper.
# Solo lettura. I campi stampati sono booleani e url di pagina, mai segreti.
set -u
cd /opt/withus-backend || exit 1

echo "== /status di ogni scraper (quello che la sonda legge davvero) =="
for p in 4100 4200 4300 4400 4500 4600 4700 4800 4900 5000; do
  echo "---- porta $p ----"
  code=$(curl -s -o /tmp/st.$p -m 6 -w '%{http_code}' "http://127.0.0.1:$p/status" 2>/dev/null)
  echo "http: $code"
  if [ "$code" = "200" ]; then
    node -e '
      const fs=require("fs");
      let j; try { j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); } catch(e){ console.log("non JSON: "+fs.readFileSync(process.argv[1],"utf8").slice(0,200)); process.exit(0); }
      const k=["loggato","url","ha_credenziali","ha_totp","totp_illeggibile","login_running","login_msg","errore","motivo"];
      const o={}; for (const x of k) if (x in j) o[x]=j[x];
      const altri=Object.keys(j).filter(x=>!k.includes(x));
      console.log(JSON.stringify(o));
      if (altri.length) console.log("altri campi presenti: "+altri.join(", "));
    ' /tmp/st.$p
  else
    head -c 200 /tmp/st.$p 2>/dev/null; echo
  fi
done
rm -f /tmp/st.* 2>/dev/null

echo
echo "== quali fonti custom sono censite nel pannello (solo nomi e porta) =="
node -e '
const fs=require("fs");
let j={}; try { j=JSON.parse(fs.readFileSync("server/fonti.store.json","utf8")); } catch(e){ console.log("illeggibile"); process.exit(0); }
const c=j.__custom||{};
for (const [id,s] of Object.entries(c)) {
  console.log([id, (s.nome||"?"), "attiva="+(s.attiva!==false), "scraper_url="+(s.scraper_url||s.scraper_port||"(dedotto dal nome)"),
    "utente="+!!s.username, "password="+!!s.password].join("  |  "));
}
console.log("--- fonti built-in nello store ---");
for (const id of ["24h","allianz"]) { const s=j[id]||{}; console.log(id+"  |  utente="+!!s.username+"  password="+!!s.password+"  totp="+!!(s.totp||s.totpSecret||s.totp_secret)); }
'

echo
echo "== impronta della chiave di cifratura vista dal backend =="
node -e '
const crypto=require("crypto");
const SECRET = process.env.FONTI_SECRET || ("withus-fonti-" + (process.env.HOSTNAME || "vps") + "-v1");
const KEY = crypto.createHash("sha256").update(SECRET).digest();
console.log("FONTI_SECRET impostata in ambiente? " + (process.env.FONTI_SECRET ? "si" : "NO (si usa la derivata)"));
console.log("impronta: " + crypto.createHash("sha256").update(KEY).digest("hex").slice(0,12));
'
echo "FONTI_SECRET presente in server/.env? $(grep -c '^FONTI_SECRET=' server/.env 2>/dev/null)"
