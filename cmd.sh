#!/usr/bin/env bash
# Verifica sul campo: i due portali arrivano fino a «chiedimi il codice»?
# Nessun dato personale viene stampato: solo stato del login e messaggi.
set -u
cd /opt/withus-backend || exit 1

echo "== versione in esecuzione =="
git fetch origin main --quiet 2>/dev/null; git reset --hard origin/main --quiet 2>/dev/null
git log --oneline -1
grep -c 'attendiSchermata' scraper/groupama/quote-service.mjs | sed 's/^/  groupama attesa-vera: /'
grep -c 'ricordaDispositivo' scraper/allianz/quote-service.mjs | sed 's/^/  allianz ricorda-dispositivo: /'
for s in allianz groupama; do systemctl restart "${s}-scraper" 2>/dev/null && echo "  ${s}-scraper riavviato"; done
sleep 30
echo

echo "== il link di accesso salvato per Groupama =="
node -e 'const st=require("/opt/withus-backend/server/fonti.store.json");
const cs=st.__custom||{}; for(const k of Object.keys(cs)) if(/groupama/i.test(cs[k].nome||""))
  console.log("  chiave:", k, "| url:", cs[k].url || "(non impostato -> si usa quello di default)");'
echo

aspetta () { # $1 porta, $2 nome
  local P="$1" N="$2" PRIMA S
  PRIMA=$(curl -s -m 8 "http://127.0.0.1:$P/loginstate")
  curl -s -m 20 -X POST "http://127.0.0.1:$P/accedi" > /dev/null 2>&1
  for i in $(seq 1 24); do
    sleep 5
    S=$(curl -s -m 8 "http://127.0.0.1:$P/loginstate")
    [ "$S" = "$PRIMA" ] && continue
    PRIMA="$S"; echo "  [$N] $S"
    case "$S" in *attesa_otp*|*'"loggato"'*|*non_loggato*|*error*) return 0;; esac
  done
  echo "  [$N] nessun esito entro due minuti"
}

echo "== GROUPAMA: accedo =="
aspetta 4500 groupama
echo
echo "== ALLIANZ: accedo =="
aspetta 4200 allianz
echo

echo "== stato finale =="
echo "-- Allianz --"; curl -s -m 15 http://127.0.0.1:4200/status; echo
echo "-- Groupama --"; curl -s -m 15 http://127.0.0.1:4500/status; echo
echo
echo "== log Groupama =="
journalctl -u groupama-scraper --since "-5 min" --no-pager 2>/dev/null | grep -v systemd | tail -14
echo
echo "== log Allianz =="
journalctl -u allianz-scraper --since "-5 min" --no-pager 2>/dev/null | grep -v systemd | tail -14
