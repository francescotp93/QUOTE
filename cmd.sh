echo "commit: $(git -C /opt/withus-backend log --oneline -1 2>/dev/null)"
echo "stato scraper: $(systemctl is-active italiana-scraper)"
# attendo che lo scraper risponda e sia loggato a Plurima
for i in $(seq 1 30); do
  S=$(curl -s --max-time 6 http://127.0.0.1:4300/status 2>/dev/null)
  echo "$S" | grep -q '"loggato": *true' && { echo "scraper pronto"; break; }
  sleep 4
done
for run in 1 2; do
  T0=$(date +%s)
  R=$(curl -s --max-time 175 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Rinnovo" 2>/dev/null)
  T1=$(date +%s)
  echo "--- RUN $run: tempo $((T1-T0))s ---"
  PA=$(printf '%s' "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);p=d.get('premio') or {};print('premio_annuale=%s sconto_q=%s ok=%s'%(p.get('premio_annuale'),p.get('sconto_quotazione'),d.get('ok')))" 2>/dev/null) || PA="(risposta non JSON: $(printf '%s' "$R" | head -c 120))"
  echo "$PA"
done
