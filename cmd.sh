B=http://127.0.0.1:4300
echo "=== inizializzaRangeSliderScontoAuto: parte del widget \$slider (oltre) ==="
curl -s "$B/jsgrep?q=const%20%24slider%20%3D&before=20&after=1100" | python3 -c 'import sys,json;d=json.load(sys.stdin);[print("FILE",w.get("file"),"\n",w["snippet"]) for w in d.get("windows",[])]' 2>/dev/null
echo; echo "=== sorgente quotazioni: getScontiConsigliatiTariffeAuto ==="
curl -s "$B/jsgrep?q=function%20getScontiConsigliatiTariffeAuto&before=5&after=500" | python3 -c 'import sys,json;d=json.load(sys.stdin);[print(w["snippet"]) for w in d.get("windows",[])]' 2>/dev/null
