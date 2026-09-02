#!/usr/bin/env bash
# 1) porta il server all'ultima versione   2) RIAVVIA davvero gli scraper
# 3) toglie dal pannello il finto seme di Allianz (con backup)  4) rileggi lo stato
# PRIVACY: dei campi cifrati si stampa solo lunghezza e forma. Mai il valore.
set -u
cd /opt/withus-backend || exit 1

echo "== 1. aggiorno il codice =="
git fetch origin main --quiet 2>/dev/null
git reset --hard origin/main --quiet 2>/dev/null
git log --oneline -1
grep -c 'esitoCodiceRifiutato' scraper/allianz/quote-service.mjs | sed 's/^/  allianz nuovo: /'
grep -c 'ricordaDispositivo' scraper/allianz/quote-service.mjs | sed 's/^/  allianz ricorda-dispositivo: /'
grep -c 'motivoNonLoggato' scraper/groupama/quote-service.mjs | sed 's/^/  groupama nuovo: /'
grep -c 'semeRifiutato' server/fonti.js | sed 's/^/  backend nuovo: /'
echo

echo "== 2. chi sta nello store (solo i nomi, nessun valore) =="
node -e 'const st=require("/opt/withus-backend/server/fonti.store.json");
console.log("  predefinite:", Object.keys(st).filter(k=>k!=="__custom").join(", ")||"(nessuna)");
console.log("  custom     :", Object.keys(st.__custom||{}).join(", ")||"(nessuna)");'
echo

echo "== 3. tolgo il finto seme di Allianz (sei cifre, chiave morta) =="
cp -a server/fonti.store.json "server/fonti.store.json.bak-$(date +%Y%m%d-%H%M%S)" && echo "  backup fatto"
node -e '
const fs="/opt/withus-backend/server/fonti.store.json";
const f=require("fs"); const st=JSON.parse(f.readFileSync(fs,"utf8"));
const a=st.allianz||{}; let tolti=[];
for (const k of ["totp","totpSecret","totp_secret","otp_secret","otpSecret","secret_totp","otp"]) if (a[k]) { delete a[k]; tolti.push(k); }
st.allianz=a; f.writeFileSync(fs, JSON.stringify(st,null,2), {mode:0o600});
console.log("  campi rimossi:", tolti.length?tolti.join(", "):"(nessuno, era gia pulito)");'
echo

echo "== 4. riavvio DAVVERO gli scraper toccati =="
for s in allianz groupama; do
  systemctl restart "${s}-scraper" 2>/dev/null && echo "  ${s}-scraper riavviato" || echo "  ${s}-scraper NON riavviato"
done
systemctl restart withus-backend 2>/dev/null && echo "  withus-backend riavviato"
sleep 25
echo

echo "== 5. come stanno adesso =="
echo "-- Allianz --"; curl -s -m 15 http://127.0.0.1:4200/status; echo
echo "-- Groupama --"; curl -s -m 15 http://127.0.0.1:4500/status; echo
echo

echo "== 6. GROUPAMA: accedo e aspetto che lo stato CAMBI =="
PRIMA=$(curl -s -m 8 http://127.0.0.1:4500/loginstate)
echo "  stato di partenza: $PRIMA"
curl -s -m 20 -X POST http://127.0.0.1:4500/accedi > /dev/null 2>&1
for i in $(seq 1 22); do
  sleep 6
  S=$(curl -s -m 8 http://127.0.0.1:4500/loginstate)
  [ "$S" = "$PRIMA" ] && continue
  echo "  $i) $S"
  case "$S" in *'"loggato"'*|*attesa_otp*|*non_loggato*|*error*) break;; esac
done
echo

echo "== 7. log Groupama =="
journalctl -u groupama-scraper --since "-6 min" --no-pager 2>/dev/null | tail -25
