B=http://127.0.0.1:4300
for fn in getScontoConsigliatoMassimoAuto setValoreScontoTariffaAuto getValoreScontoTariffaAuto; do
  echo "=== $fn ==="
  curl -s "$B/jsgrep?q=function%20$fn&before=10&after=380" | python3 -c 'import sys,json
d=json.load(sys.stdin)
for w in d.get("windows",[]): print(w["snippet"])' 2>/dev/null
  echo
done
