#!/usr/bin/env bash
# SOLA LETTURA. Nessuna scrittura, nessun login avviato, nessun segreto stampato.
# Domanda: il Pannello Fonti e' vivo, e le compagnie sono collegate?
set -u

echo "== i servizi delle compagnie girano? =="
for s in moto-scraper allianz-scraper italiana-scraper hdi-scraper groupama-scraper \
         prima-scraper axa-scraper assieasy-scraper kube-scraper quotiamo-scraper; do
  printf '  %-20s %s\n' "$s" "$(systemctl is-active "$s" 2>/dev/null || echo assente)"
done

echo
echo "== e cosa rispondono, uno per uno =="
printf '  %-10s %-6s %-9s %-9s %-12s %s\n' FONTE PORTA RISPONDE LOGGATO CREDENZIALI PASSO
for riga in "24h:4100" "allianz:4200" "italiana:4300" "hdi:4400" "groupama:4500" \
            "prima:4600" "axa:4700" "assieasy:4800" "kube:4900" "quotiamo:5000"; do
  nome="${riga%%:*}"; porta="${riga##*:}"
  out=$(curl -s -m 8 "http://127.0.0.1:$porta/status" 2>/dev/null)
  if [ -z "$out" ]; then
    printf '  %-10s %-6s %-9s %-9s %-12s %s\n' "$nome" "$porta" "no" "-" "-" "(non risponde)"
    continue
  fi
  leggi() { printf '%s' "$out" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception: print('?'); raise SystemExit
v=d
for k in '$1'.split('.'):
    v = v.get(k) if isinstance(v,dict) else None
print('-' if v is None else v)
" 2>/dev/null || echo '?'; }
  printf '  %-10s %-6s %-9s %-9s %-12s %s\n' "$nome" "$porta" "si" \
    "$(leggi loggato)" "$(leggi ha_credenziali)" "$(leggi login_step)"
done

echo
echo "== il guardiano automatico =="
systemctl is-active withus-backend
journalctl -u withus-backend --since '-6 hours' --no-pager 2>/dev/null \
  | grep -iE 'vigilanza|rientro|sessione' | tail -12

echo
echo "== ultimi guai visti dal backend (senza segreti) =="
journalctl -u withus-backend --since '-2 hours' --no-pager 2>/dev/null \
  | grep -iE 'chiave-ponte|api-v1|errore|error' | tail -15
