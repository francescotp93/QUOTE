echo "=== registrationDate leggibile? + avente diritto compilato? ==="
curl -s --max-time 40 "http://127.0.0.1:4700/explore" 2>/dev/null | python3 -c "import sys,json
d=json.load(sys.stdin)
for f in d.get('fields',[]):
 if f.get('id') in ('registrationDate','2CFPI','2COGNO','2ONOME','2DNA1C'):
  print(' ',f.get('id'),'=',repr(f.get('val','')))" 2>/dev/null
echo "=== provo a riempire Data acquisto via xpath (come funziono' a mano) ==="
curl -s --max-time 35 -G "http://127.0.0.1:4700/explore" --data-urlencode 'fill=13/02/2025' --data-urlencode 'fillsel=xpath=(//*[contains(text(),"Data acquisto veicolo")]/following::input)[1]' >/dev/null 2>&1
sleep 1
curl -s --max-time 40 "http://127.0.0.1:4700/explore" 2>/dev/null | python3 -c "import sys,json
d=json.load(sys.stdin)
print('  testo contiene obbligo data acquisto?', 'obbligatorio compilare il campo' in d.get('text','').lower() or 'data acquisto' in d.get('text','').lower())
print('  fattori non completi ancora?', 'non sono completi' in d.get('text',''))" 2>/dev/null
