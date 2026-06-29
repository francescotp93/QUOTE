echo "=== git remote /opt/withus-backend (token REDATTO) ==="; git -C /opt/withus-backend remote -v 2>/dev/null | sed -E 's#x-access-token:[^@]+@#x-access-token:<TOKEN>@#g'
echo "=== branch corrente ==="; git -C /opt/withus-backend rev-parse --abbrev-ref HEAD 2>/dev/null
echo "=== Caddy: domini configurati ==="; grep -hoE "^[a-z0-9.-]+\.(it|com|net)" /etc/caddy/Caddyfile 2>/dev/null | sort -u; echo "--- reverse_proxy ---"; grep -iE "reverse_proxy|:3000" /etc/caddy/Caddyfile 2>/dev/null | head
echo "=== chiavi nel server/.env (solo NOMI, non valori) ==="; sed -E 's/=.*$//' /opt/withus-backend/server/.env 2>/dev/null | grep -vE '^\s*#|^\s*$' | sort
echo "=== mappa scraper: display + porta ==="; for d in /opt/withus-backend/scraper/*/; do c=$(basename "$d"); case "$c" in _*) continue;; esac; disp=$(grep -oE 'DISPLAY=:[0-9]+' "/etc/systemd/system/$c-scraper.service" 2>/dev/null | head -1); port=$(grep -oE "127.0.0.1:4[0-9]{3}|PORT[ =]*[0-9]{4}|'4[0-9]{3}'" "$d/quote-service.mjs" 2>/dev/null | head -1); echo "  $c: $disp port~$port"; done
echo "=== quale FONTI_SECRET decifra il fonti.store? (test, NON stampo segreti/credenziali) ==="
node -e '
const fs=require("fs"),cr=require("crypto");
const store=JSON.parse(fs.readFileSync("/opt/withus-backend/server/fonti.store.json","utf8"));
function dec(secret,blob){try{const KEY=cr.createHash("sha256").update(secret).digest();const raw=Buffer.from(String(blob).slice(3),"base64");const d=cr.createDecipheriv("aes-256-gcm",KEY,raw.subarray(0,12));d.setAuthTag(raw.subarray(12,28));const o=Buffer.concat([d.update(raw.subarray(28)),d.final()]).toString("utf8");return o.length>0;}catch(e){return false;}}
let blob=null;(function find(o){if(blob)return;if(typeof o==="string"&&o.startsWith("v1:")){blob=o;return;}if(o&&typeof o==="object")for(const k of Object.keys(o))find(o[k]);})(store);
if(!blob){console.log("nessun campo cifrato trovato");process.exit(0);}
const cands={"vps-v1":"withus-fonti-vps-v1","host-v1":"withus-fonti-"+(process.env.HOSTNAME||require("os").hostname())+"-v1"};
for(const[name,sec]of Object.entries(cands))console.log("  "+name+" => "+(dec(sec,blob)?"DECIFRA ✅":"no"));
' 2>&1 | tail -5
