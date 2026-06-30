echo "=== ALLIANZ: esploro la banca dati ANIA (Ricerca.aspx) ==="
R=$(curl -s --max-time 60 "http://127.0.0.1:4200/explore?goto=https://portaleagenzie.allianz.it/Auto/InquiryAnia/Ricerca.aspx&wait=4500" 2>/dev/null)
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception as e: print('NON JSON',e); print(sys.stdin.read()[:400]); sys.exit()
print('url finale:', d.get('url'))
for f in (d.get('frames') or []):
  print('--- frame:', f.get('url'),'| title:', f.get('title'),'| bodylen:', f.get('bodylen'))
  print('    campi:', json.dumps(f.get('fields'),ensure_ascii=False))
  print('    link:', json.dumps(f.get('links'),ensure_ascii=False)[:500])
" 2>&1 | head -40
