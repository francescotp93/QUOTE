B=http://127.0.0.1:4300
echo "=== chi chiama inizializzaRangeSliderScontoAuto (sorgente quotazioni) ==="
curl -s "$B/jsgrep?q=inizializzaRangeSliderScontoAuto(quotazione)&before=400&after=60" | python3 -c 'import sys,json;d=json.load(sys.stdin);[print(w["snippet"]) for w in d.get("windows",[])]' 2>/dev/null
echo; echo "=== getIndiceScontoTariffaAuto + getValoreInizialeScontoTariffaAuto ==="
for fn in getIndiceScontoTariffaAuto getValoreInizialeScontoTariffaAuto; do echo "--- $fn ---"; curl -s "$B/jsgrep?q=function%20$fn&before=10&after=300" | python3 -c 'import sys,json;d=json.load(sys.stdin);[print(w["snippet"]) for w in d.get("windows",[])]' 2>/dev/null; done
echo "=== definizione/uso di 'tariffe' (let/const/var tariffe) ==="
curl -s "$B/jsgrep?q=tariffe%20%3D&before=20&after=140" | python3 -c 'import sys,json;d=json.load(sys.stdin);[print("AT",w["at"],":",w["snippet"][:260]) for w in d.get("windows",[])]' 2>/dev/null | head -40
