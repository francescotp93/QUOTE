#!/usr/bin/env bash
# SOLA LETTURA. TUTTI i servizi scraper: chi tenta accessi, quanti, e con che meccanismo.
echo "### TUTTI I SERVIZI SCRAPER INSTALLATI ###"
systemctl list-units --type=service --all --no-legend 2>/dev/null | awk '/scraper/{print "  "$1"  "$3"/"$4}'

echo; echo "### TENTATIVI DI ACCESSO OGGI, PER SERVIZIO ###"
for u in $(systemctl list-units --type=service --all --no-legend 2>/dev/null | awk '/scraper/{print $1}'); do
  n=$(journalctl -u "$u" --since today --no-pager 2>/dev/null | grep -icE "autoLogin|login|accedi|signin" )
  u2=$(journalctl -u "$u" --since '-2 hours' --no-pager 2>/dev/null | grep -icE "autoLogin|login" )
  printf '  %-26s oggi %5s   ultime 2 ore %5s\n' "$u" "$n" "$u2"
done

echo; echo "### CHI HA UN CICLO A TEMPO (non solo keepAlive) ###"
cd /opt/withus-backend 2>/dev/null && for d in scraper/*/; do
  c=$(basename "$d"); f="$d/quote-service.mjs"; [ -f "$f" ] || continue
  n=$(grep -c 'setInterval' "$f")
  [ "$n" -gt 0 ] && { printf '  %-12s %s cicli: ' "$c" "$n"; grep -o 'setInterval([a-zA-Z]*' "$f" | sed 's/setInterval(//' | tr '\n' ' '; echo; }
done

echo; echo "### ULTIME RIGHE DI CHI HA LAVORATO NELLE ULTIME 2 ORE ###"
for u in $(systemctl list-units --type=service --all --no-legend 2>/dev/null | awk '/scraper/{print $1}'); do
  r=$(journalctl -u "$u" --since '-2 hours' --no-pager 2>/dev/null | grep -iE "autoLogin|login|otp|codice" | tail -4)
  [ -n "$r" ] && { echo "--- $u ---"; echo "$r"; }
done
