systemctl start withus-autopull.service 2>/dev/null || true
for i in $(seq 1 24); do git -C /opt/withus-backend log --oneline -1 2>/dev/null | grep -q "ripristino attesa premio fissa" && break; sleep 5; done
echo "commit: $(git -C /opt/withus-backend log --oneline -1 2>/dev/null)"
for i in $(seq 1 20); do curl -s --max-time 6 http://127.0.0.1:4300/status 2>/dev/null | grep -q '"loggato": *true' && { echo pronto; break; }; sleep 4; done
for run in 1 2 3; do
  T0=$(date +%s)
  R=$(curl -s --max-time 175 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Rinnovo" 2>/dev/null)
  T1=$(date +%s)
  PA=$(printf '%s' "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);p=d.get('premio') or {};print('premio=%s sconto_q=%s ok=%s'%(p.get('premio_annuale'),p.get('sconto_quotazione'),d.get('ok')))" 2>/dev/null) || PA="(non JSON: $(printf '%s' "$R" | head -c 80))"
  echo "RUN $run: $((T1-T0))s | $PA"
done
