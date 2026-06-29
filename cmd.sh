echo "=== attendo autopull + restart italiana-scraper, poi 2 run di verifica ==="
# forzo un giro autopull e aspetto che il commit sia attivo + scraper su
systemctl start withus-autopull.service 2>/dev/null || true
for i in $(seq 1 24); do
  git -C /opt/withus-backend log --oneline -1 2>/dev/null | grep -q "attesa intelligente" && break
  sleep 5
done
echo "commit attivo: $(git -C /opt/withus-backend log --oneline -1 2>/dev/null)"
sleep 8  # lascio risvegliare lo scraper dopo il restart
for run in 1 2; do
  T0=$(date +%s)
  R=$(curl -s --max-time 170 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Rinnovo" 2>/dev/null)
  T1=$(date +%s)
  echo "--- RUN $run: tempo $((T1-T0))s ---"
  echo "$R" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=d.get('premio') or {}
print('ok:',d.get('ok'),'| premio_annuale:',p.get('premio_annuale'),'| prodotto:',p.get('prodotto'),'| sconto_q:',p.get('sconto_quotazione'))
"
done
