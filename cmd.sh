echo "stato groupama: $(systemctl is-active groupama-scraper)"
for i in $(seq 1 15); do curl -s --max-time 6 http://127.0.0.1:4500/status 2>/dev/null | grep -q '"loggato": *true' && { echo pronto; break; }; sleep 4; done
for run in 1 2; do
  T0=$(date +%s)
  R=$(curl -s --max-time 120 "http://127.0.0.1:4500/premio?targa=GY263BY" 2>/dev/null)
  T1=$(date +%s)
  PA=$(printf '%s' "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);print('premio=%s ok=%s prodotto=%s err=%s'%(d.get('premio_annuale'),d.get('ok'),d.get('prodotto'),d.get('error')))" 2>/dev/null) || PA="(non JSON: $(printf '%s' "$R" | head -c 100))"
  echo "RUN $run: $((T1-T0))s | $PA"
done
