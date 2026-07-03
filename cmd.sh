set +e
GAR="081035,081036,081278,081279,081280,081281,081282,081283,081284,091202,131065,135032,131067,131068,181009,170218"
B="provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5&garanzie=$GAR"
pf(){ curl -s --max-time 130 "http://127.0.0.1:4400/premio-casa?$B&fattori=$1" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  lordo',d.get('premio_totale'),'via',d.get('via'),d.get('error') or '')" 2>&1; }
echo "== Tutela + vita privata + mass 15.000 =="; pf "170218~3MAXTU~15000,170218~3TLB~1"
echo "== Tutela + vita privata + mass 20.000 (ora deve cambiare?) =="; pf "170218~3MAXTU~20000,170218~3TLB~1"
echo "== Tutela + vita privata + immobile (deve salire) =="; pf "170218~3MAXTU~15000,170218~3TLB~1,170218~3TLA~1"
echo "== Tutela + tutte e 3 (vita+immobile+lavoro) =="; pf "170218~3MAXTU~15000,170218~3TLB~1,170218~3TLA~1,170218~3TLC~1"
echo "---fine---"
