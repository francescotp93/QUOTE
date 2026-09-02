#!/usr/bin/env bash
# Server tornato: si e' aggiornato? gli scraper sono su? Plurima risponde?
set -u
cd /opt/withus-backend || exit 1

echo "== si sta aggiornando da solo? =="
echo "autopull timer : $(systemctl is-active withus-autopull.timer) / $(systemctl is-enabled withus-autopull.timer 2>/dev/null)"
echo "canale comandi : $(systemctl is-active cmd-runner.timer) / $(systemctl is-enabled cmd-runner.timer 2>/dev/null)"
echo "commit ora     : $(git log -1 --pretty='%h %ad %s' --date=short)"
echo "aspetto fino a 3 minuti che tiri il codice nuovo..."
for i in $(seq 1 18); do
  git fetch origin main -q 2>/dev/null
  L=$(git rev-parse HEAD 2>/dev/null); R=$(git rev-parse origin/main 2>/dev/null)
  [ "$L" = "$R" ] && { echo "allineato a main dopo ~$((i*10))s"; break; }
  sleep 10
done
echo "commit dopo    : $(git log -1 --pretty='%h %ad %s' --date=short)"
echo "in pari con main? $([ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && echo si || echo NO)"

echo
echo "== la guardia nuova e' arrivata? (1 = si) =="
grep -c 'SERVIZI DI CASA' deploy/autopull.sh

echo
echo "== i dieci scraper =="
for s in /etc/systemd/system/*scraper*.service; do
  n=$(basename "$s"); printf '%-28s %s\n' "$n" "$(systemctl is-active "$n")"
done

echo
echo "== Plurima (Italiana, porta 4300): e' dentro al portale? =="
curl -s -m 15 http://127.0.0.1:4300/status | head -c 300
echo
echo "(loggato:true = il recupero anagrafica puo' funzionare)"

echo
echo "== le altre fonti =="
for p in 4100 4200 4400 4500 4600 4700 4800 4900 5000; do
  printf '  porta %-5s ' "$p"
  curl -s -m 8 "http://127.0.0.1:$p/status" 2>/dev/null | head -c 110
  echo
done
