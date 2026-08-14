#!/usr/bin/env bash
# Fase 3 — verifica dello spostamento della macchina da ramo di lavoro a main.
# Solo lettura: guarda, non tocca.
set -u
cd /opt/withus-backend || exit 1

echo "== attendo che la macchina passi su main (max 180s) =="
for i in $(seq 1 36); do
  B=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [ "$B" = "main" ]; then echo "passata a main dopo ~$((i*5))s"; break; fi
  sleep 5
done

echo
echo "== dove sta la macchina =="
echo "ramo   : $(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
echo "commit : $(git log -1 --pretty='%h  %ad  %s' --date=short 2>/dev/null)"
echo "BR nel file autopull: $(grep -m1 '^BR=' deploy/autopull.sh)"
git fetch origin main --quiet 2>/dev/null
echo "origin/main: $(git rev-parse --short origin/main 2>/dev/null)   HEAD: $(git rev-parse --short HEAD 2>/dev/null)"
echo "modifiche locali non committate: $(git status --porcelain 2>/dev/null | grep -v '^??' | wc -l)"

echo
echo "== backend =="
echo "servizio: $(systemctl is-active withus-backend) / $(systemctl is-enabled withus-backend 2>/dev/null)"
echo "risposta http (401 = vivo e protetto): $(curl -s -o /dev/null -m 8 -w '%{http_code}' http://127.0.0.1:3000/fonti/salute 2>/dev/null)"

echo
echo "== scraper (attivo / abilitato) =="
for s in /etc/systemd/system/*scraper*.service; do
  [ -f "$s" ] || continue
  n=$(basename "$s")
  printf '%-30s %-10s %s\n' "$n" "$(systemctl is-active "$n" 2>/dev/null)" "$(systemctl is-enabled "$n" 2>/dev/null)"
done

echo
echo "== quello che doveva sopravvivere =="
for f in server/.env server/fonti.store.json server/fontiWatchdog.store.json; do
  if [ -f "$f" ]; then echo "OK      $f  ($(stat -c%s "$f") byte)"; else echo "MANCA   $f"; fi
done
echo "cartelle userdata: $(ls -d scraper/*/userdata 2>/dev/null | wc -l)   spazio: $(du -sch scraper/*/userdata 2>/dev/null | tail -1 | cut -f1)"
echo "vercel.json ancora presente? $([ -f vercel.json ] && echo si || echo no, come previsto)"

echo
echo "== ultimi giri di autopull =="
journalctl -u withus-autopull --since '-8 min' --no-pager 2>/dev/null | tail -25
