set -u
echo "=== fonti custom presenti (Groupama?) — solo dati non segreti ==="
node -e '
try{
  const s=require("/opt/withus-backend/server/fonti.store.json");
  const c=s.__custom||{};
  for(const k of Object.keys(c)){
    const f=c[k];
    console.log("ID:",k,"| nome:",f.nome,"| url:",f.url||"(vuoto)","| has2fa:",!!f.has2fa,"| ha_user:",!!f.username,"| ha_pass:",!!f.password,"| scraper_port:",f.scraper_port||"-","| ruolo:",f.ruolo||"-");
  }
}catch(e){console.log("err",e.message)}
'
echo "=== scraper attivi (porte) ==="
for p in 4100 4200 4300 4400 4500; do echo -n "porta $p: "; curl -s --max-time 5 "http://127.0.0.1:$p/status" 2>/dev/null | head -c 120 || echo "(niente)"; echo; done
