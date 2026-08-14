#!/usr/bin/env bash
# Fase 3 — secondo controllo: gli scraper sono tutti tornati su e in ascolto?
set -u
cd /opt/withus-backend || exit 1

echo "== ramo =="
echo "$(git rev-parse --abbrev-ref HEAD)  @  $(git rev-parse --short HEAD)"

echo
echo "== servizi =="
printf '%-30s %-10s %-10s %s\n' SERVIZIO ATTIVO ABILITATO 'DA QUANDO'
for s in /etc/systemd/system/*scraper*.service /etc/systemd/system/withus-backend.service; do
  [ -f "$s" ] || continue
  n=$(basename "$s")
  da=$(systemctl show "$n" -p ActiveEnterTimestamp --value 2>/dev/null)
  printf '%-30s %-10s %-10s %s\n' "$n" "$(systemctl is-active "$n" 2>/dev/null)" "$(systemctl is-enabled "$n" 2>/dev/null)" "$da"
done

echo
echo "== porte in ascolto su 127.0.0.1 =="
ss -ltnp 2>/dev/null | grep 127.0.0.1 | awk '{print $4, $6}' | sort

echo
echo "== bussata su ogni telecomando (000 = non risponde) =="
for p in 3000 4100 4200 4300 4400 4500 4600 4700 4800 4900 5000; do
  printf 'porta %-5s -> %s\n' "$p" "$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:$p/ 2>/dev/null)"
done

echo
echo "== errori negli ultimi minuti =="
journalctl -u allianz-scraper --since '-10 min' --no-pager 2>/dev/null | tail -12
echo "---- backend ----"
journalctl -u withus-backend --since '-10 min' --no-pager 2>/dev/null | grep -iE 'error|errore|exception|fatal' | tail -10 || echo "(nessun errore)"
