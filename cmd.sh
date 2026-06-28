echo "=== imposto LINK DI ACCESSO AXA = https://ais.axa-italia.it/ ==="
node -e '
const fs=require("fs"); const P="/opt/withus-backend/server/fonti.store.json";
const s=JSON.parse(fs.readFileSync(P,"utf8")); const cs=s.__custom||{};
let id=null; for(const k of Object.keys(cs)) if(/axa/i.test((cs[k].nome||"")+k)) id=k;
if(!id){console.log("c-axa non trovato");process.exit(0);}
cs[id].url="https://ais.axa-italia.it/";
fs.writeFileSync(P, JSON.stringify(s,null,2), {mode:0o600});
console.log("ok, url aggiornato per", id);
'
echo "=== navigo a ais.axa-italia.it/ e guardo dove arriva (login form? errore?) ==="
curl -s --max-time 50 "http://127.0.0.1:4700/explore?goto=https://ais.axa-italia.it/" 2>&1 | head -c 700; echo
