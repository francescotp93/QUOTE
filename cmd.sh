B=http://127.0.0.1:4300
echo "=== getScontoConsigliatoMassimoAuto (completa) ==="
curl -s "$B/jsgrep?q=function%20getScontoConsigliatoMassimoAuto&before=5&after=700" | python3 -c 'import sys,json;d=json.load(sys.stdin);[print(w["snippet"]) for w in d.get("windows",[])]' 2>/dev/null
echo; echo "=== normalizzaScontoTariffaAuto ==="
curl -s "$B/jsgrep?q=function%20normalizzaScontoTariffaAuto&before=5&after=320" | python3 -c 'import sys,json;d=json.load(sys.stdin);[print(w["snippet"]) for w in d.get("windows",[])]' 2>/dev/null
