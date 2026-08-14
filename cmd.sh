#!/usr/bin/env bash
# Fonti — la correzione e' arrivata? le tre compagnie ora si vedono?
# Solo lettura. Nessun segreto stampato.
set -u
cd /opt/withus-backend || exit 1

echo "== aspetto che la correzione arrivi (max 180s) =="
for i in $(seq 1 36); do
  grep -q "const PORTALI" server/fonti.js 2>/dev/null && { echo "arrivata dopo ~$((i*5))s"; break; }
  sleep 5
done
echo "commit: $(git log -1 --pretty='%h %s' 2>/dev/null)"
echo "PORTALI presente in server/fonti.js: $(grep -c 'const PORTALI' server/fonti.js)"
echo "quotiamo.service punta a: $(grep -h '^EnvironmentFile=' /etc/systemd/system/quotiamo-scraper.service 2>/dev/null)"

echo
echo "== backend e scraper =="
printf '%-28s %-12s %s\n' SERVIZIO STATO 'DA QUANDO'
for s in /etc/systemd/system/withus-backend.service /etc/systemd/system/*scraper*.service; do
  n=$(basename "$s")
  printf '%-28s %-12s %s\n' "$n" "$(systemctl is-active "$n")" "$(systemctl show "$n" -p ActiveEnterTimestamp --value)"
done

echo
echo "== quotiamo ha finalmente la chiave giusta? =="
pid=$(systemctl show quotiamo-scraper -p MainPID --value 2>/dev/null)
for p in $pid $(pgrep -P "$pid" 2>/dev/null); do
  if tr "\0" "\n" < /proc/$p/environ 2>/dev/null | grep -q '^FONTI_SECRET='; then
    echo "  pid $p: FONTI_SECRET presente"
  else
    echo "  pid $p: FONTI_SECRET ASSENTE"
  fi
done
echo "  /status dice: $(curl -s -m 8 http://127.0.0.1:5000/status 2>/dev/null | head -c 200)"

echo
echo "== il pannello ora vede le tre compagnie? =="
echo "(interrogo lo stesso codice del backend, senza passare dal login)"
cat > /tmp/vedo.mjs <<'FINE'
process.env.FONTI_STORE = '/opt/withus-backend/server/fonti.store.json';
const { elencoFontiTecnico } = await import('/opt/withus-backend/server/fonti.js');
for (const f of elencoFontiTecnico()) {
  const porta = f.surl ? f.surl.split(':').pop() : 'NESSUNA';
  let risposta = '-';
  if (f.surl) {
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 4000);
      const r = await fetch(f.surl + '/status', { signal: c.signal }); clearTimeout(t);
      const d = await r.json().catch(() => ({}));
      risposta = 'loggato=' + JSON.stringify(d.loggato) + ' credenziali=' + JSON.stringify(d.ha_credenziali);
    } catch { risposta = 'non risponde'; }
  }
  console.log('  ' + String(f.nome || f.id).padEnd(24) + ' porta=' + String(porta).padEnd(8) + risposta);
}
FINE
node /tmp/vedo.mjs 2>&1 | head -20
rm -f /tmp/vedo.mjs
