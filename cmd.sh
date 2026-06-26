B=http://127.0.0.1:4300
echo "=== inizializzaRangeSliderScontoAuto ==="
curl -s "$B/jsgrep?q=inizializzaRangeSliderScontoAuto&before=20&after=1100"
echo; echo "=== applicaScontoAuto( ==="
curl -s "$B/jsgrep?q=function%20applicaScontoAuto&before=20&after=900"
