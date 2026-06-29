echo "scraper gia caldo (nessun restart). 4 run di fila:"
for run in 1 2 3 4; do
  T0=$(date +%s)
  R=$(curl -s --max-time 175 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Rinnovo" 2>/dev/null)
  T1=$(date +%s)
  PA=$(printf '%s' "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);p=d.get('premio') or {};print('premio=%s sconto_q=%s ok=%s'%(p.get('premio_annuale'),p.get('sconto_quotazione'),d.get('ok')))" 2>/dev/null) || PA="(non JSON)"
  echo "RUN $run: $((T1-T0))s | $PA"
done
