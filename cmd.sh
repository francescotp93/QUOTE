set +e
echo "== TCM caso utente: 100000 / 10 anni / NON fumatore / annuale =="
T0=$(date +%s)
curl -s --max-time 120 "http://127.0.0.1:4400/premio-tcm?capitale=100000&durata=10&nascita=17/07/1993&eta=33&fumatore=0&frazcode=1&prodotto=TCM07H.7" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'premio',d.get('premio_lordo'),'err',(d.get('error') or '')[:90])" 2>&1
T1=$(date +%s); echo "  tempo: $((T1-T0))s"
echo "---fine---"
