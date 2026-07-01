cd /opt/withus-backend
git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null
git reset --hard origin/claude/vibrant-tesla-o0glfd -q 2>/dev/null
sudo systemctl restart hdi-scraper.service 2>/dev/null
sleep 22
echo "=== A: appartamento condominio <100mq (TP) ==="
curl -s -m 120 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=1&dimora=1&piano=2&cc=2&eta=6" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('ok:',d.get('ok'),'premio_totale:',d.get('premio_totale'),'error:',d.get('error'))
print('garanzie:', [(x['nome'],x['lordo']) for x in (d.get('garanzie') or [])][:8])
"
echo ""
echo "=== B: villa monofamiliare >150mq (MI) ==="
curl -s -m 120 "http://127.0.0.1:4400/premio-casa?provincia=MI&tipo=6&mq=3&dimora=1&piano=3&cc=2&eta=1" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('ok:',d.get('ok'),'premio_totale:',d.get('premio_totale'),'error:',d.get('error'))
"
echo "---fine---"
