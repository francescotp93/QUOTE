#!/usr/bin/env bash
# DIAGNOSI SCRAPER — sola lettura. Stato servizi, health, decifrabilità Fonti, impronte FONTI_SECRET.
set -u
declare -A PORT=( [moto/24h]=4100 [allianz]=4200 [italiana]=4300 [hdi]=4400 [groupama]=4500 [prima]=4600 [axa]=4700 )
SCR=/opt/withus-backend/scraper/diagnosi-fonti.mjs

echo "════════ 1) SERVIZI systemd ════════"
systemctl list-units --type=service --all --no-legend 2>/dev/null \
 | grep -iE 'withus|scraper|allianz|axa|hdi|groupama|italiana|moto|prima|24h' \
 | awk '{printf "%-34s load=%-8s active=%-8s sub=%s\n",$1,$2,$3,$4}'

echo; echo "════════ 2) HEALTH scraper (localhost) ════════"
for name in moto/24h allianz italiana hdi groupama prima axa; do
  p=${PORT[$name]}
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$p/health" 2>/dev/null)
  body=$(curl -s --max-time 5 "http://127.0.0.1:$p/health" 2>/dev/null | head -c 120)
  printf "%-12s :%s  http=%s  %s\n" "$name" "$p" "${code:-timeout}" "$body"
done

echo; echo "════════ 3) BACKEND: impronta FONTI_SECRET + credenziali decifrabili ════════"
BE_ENV=$(systemctl show withus-backend -p Environment --value 2>/dev/null)
env $BE_ENV node "$SCR" 2>&1 | sed 's/^/[backend] /'

echo; echo "════════ 4) IMPRONTA FONTI_SECRET per ogni scraper (deve == backend) ════════"
for svc in $(systemctl list-units --type=service --no-legend 2>/dev/null | grep -iE 'allianz|axa|hdi|groupama|italiana|moto|prima|24h|scraper' | awk '{print $1}'); do
  fp=$(env $(systemctl show "$svc" -p Environment --value 2>/dev/null) node "$SCR" 2>/dev/null | grep 'Impronta chiave' | head -1)
  printf "%-30s %s\n" "$svc" "${fp:-<no fingerprint>}"
done
echo "FINE."
