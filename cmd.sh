#!/usr/bin/env bash
# Fonti — quotiamo dopo il riavvio + quanto ci mette /status di ognuno.
# Solo lettura. Nessun segreto stampato.
set -u
cd /opt/withus-backend || exit 1

echo "== quotiamo: riavviato con la chiave giusta? =="
for i in $(seq 1 12); do
  [ "$(systemctl is-active quotiamo-scraper)" = "active" ] && break
  sleep 5
done
echo "servizio: $(systemctl is-active quotiamo-scraper)  da $(systemctl show quotiamo-scraper -p ActiveEnterTimestamp --value)"
pid=$(systemctl show quotiamo-scraper -p MainPID --value 2>/dev/null)
figli=$(pgrep -P "$pid" 2>/dev/null | tr '\n' ' ')
for p in $pid $figli; do
  [ -r "/proc/$p/environ" ] || continue
  cmd=$(tr "\0" " " < /proc/$p/cmdline 2>/dev/null | cut -c1-30)
  if tr "\0" "\n" < "/proc/$p/environ" 2>/dev/null | grep -q '^FONTI_SECRET='; then
    echo "  pid $p FONTI_SECRET: presente   [$cmd]"
  else
    echo "  pid $p FONTI_SECRET: ASSENTE    [$cmd]"
  fi
done
sleep 10
echo "  /status: $(curl -s -m 10 http://127.0.0.1:5000/status 2>/dev/null | head -c 200)"

echo
echo "== quanto ci mette /status di ognuno (la sonda del pannello aspetta 3,5s) =="
printf '%-10s %-8s %-10s %s\n' PORTA ESITO TEMPO NOTA
for p in 4100 4200 4300 4400 4500 4600 4700 4800 4900 5000; do
  t0=$(date +%s%N)
  code=$(curl -s -o /tmp/s.$p -m 15 -w '%{http_code}' "http://127.0.0.1:$p/status" 2>/dev/null)
  t1=$(date +%s%N)
  ms=$(( (t1 - t0) / 1000000 ))
  nota=""
  [ "$ms" -gt 3500 ] && nota="OLTRE il tempo della sonda: il pannello la darebbe per spenta"
  printf '%-10s %-8s %-10s %s\n' "$p" "$code" "${ms}ms" "$nota"
done
rm -f /tmp/s.* 2>/dev/null

echo
echo "== seconda misura, subito dopo (per capire se e' un caso o e' sempre cosi') =="
for p in 4700 4800; do
  t0=$(date +%s%N); code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "http://127.0.0.1:$p/status" 2>/dev/null); t1=$(date +%s%N)
  echo "  porta $p: $code in $(( (t1-t0)/1000000 ))ms"
done
