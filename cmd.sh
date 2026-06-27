set -u
echo "=== abilito has2fa su c-groupama nel store (per mostrare il campo OTP) ==="
node -e '
const fs=require("fs"); const P="/opt/withus-backend/server/fonti.store.json";
try{
  const s=JSON.parse(fs.readFileSync(P,"utf8"));
  if(s.__custom && s.__custom["c-groupama"]){ s.__custom["c-groupama"].has2fa=true; fs.writeFileSync(P, JSON.stringify(s,null,2)); console.log("has2fa=true impostato su c-groupama"); }
  else console.log("c-groupama non trovato");
}catch(e){console.log("err",e.message)}
'
echo "=== stato login Groupama adesso ==="
curl -s --max-time 8 "http://127.0.0.1:4500/loginstate" 2>/dev/null; echo
curl -s --max-time 8 "http://127.0.0.1:4500/status" 2>/dev/null; echo
