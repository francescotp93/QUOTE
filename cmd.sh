echo "=== link di accesso configurato per c-axa (campo url, in chiaro) ==="
node -e '
try {
  const s = JSON.parse(require("fs").readFileSync("/opt/withus-backend/server/fonti.store.json","utf8"));
  const cs = (s.__custom)||{};
  for (const k of Object.keys(cs)) if (/axa/i.test((cs[k].nome||"")+k)) console.log(k, "->", JSON.stringify(cs[k].url||"(vuoto)"));
} catch(e){ console.log("err", e.message); }
'
