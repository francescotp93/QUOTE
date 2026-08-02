#!/usr/bin/env bash
# SOLA LETTURA. Verifica che il rilascio sia arrivato e che il freno sia attivo.

echo "### IL CODICE E' ARRIVATO? ###"
cd /opt/withus-backend 2>/dev/null && {
  echo "commit: $(git log -1 --format='%h %ad %s' --date=short 2>/dev/null)"
  echo "freno presente nei tre scraper:"
  for c in allianz hdi italiana; do
    printf '  %-10s %s\n' "$c" "$(grep -c 'const FRENO = creaFreno' scraper/$c/quote-service.mjs 2>/dev/null)"
  done
  echo "modulo comune: $(ls -1 scraper/comune/freno.mjs 2>/dev/null || echo MANCA)"
}

echo; echo "### I SERVIZI ###"
for s in allianz-scraper hdi-scraper italiana-scraper; do
  printf '%-22s %s\n' "$s" "$(systemctl is-active "$s" 2>/dev/null) (da $(systemctl show -p ActiveEnterTimestamp --value "$s" 2>/dev/null))"
done

echo; echo "### IL FRENO STA LAVORANDO? (ultime righe) ###"
for s in allianz-scraper hdi-scraper italiana-scraper; do
  echo "--- $s ---"
  journalctl -u "$s" --since '-20 min' --no-pager 2>/dev/null \
    | grep -E "freno|keep-alive|autoLogin" | tail -8
done

echo; echo "### AUTOPULL: ha lavorato? ###"
journalctl -u withus-autopull --since '-15 min' --no-pager 2>/dev/null | tail -12
