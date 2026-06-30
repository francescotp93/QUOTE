echo "=== status groupama (4500) ==="
curl -s -m 8 "http://127.0.0.1:4500/status" 2>/dev/null | head -c 250
echo ""
echo "=== /premio GY697XA (nostro Groupama) ==="
curl -s -m 200 "http://127.0.0.1:4500/premio?targa=GY697XA" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(json.dumps({k:d.get(k) for k in ['ok','premio_annuale_num','prodotto','marca','modello','valore_assicurato','cu','bm','error']},ensure_ascii=False,indent=1))
" 2>/dev/null || echo "(scraper non pronto o errore)"
