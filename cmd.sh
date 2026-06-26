B=http://127.0.0.1:4300
echo "=== tutte_garanzie (key + titolo) dal Preventivo ==="
curl -s -m 200 "$B/hubpremio?targa=GY263BY&situazione=Rinnovo&maxNext=8" > /tmp/hp.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/hp.json'))
tg=d.get('tutte_garanzie') or d.get('drive',{}).get('tutte_garanzie')
if tg is None:
    # cerca in profondità
    def find(o):
        if isinstance(o,dict):
            if 'tutte_garanzie' in o: return o['tutte_garanzie']
            for v in o.values():
                r=find(v)
                if r is not None: return r
        return None
    tg=find(d)
print('haSelezionaGaranzia:', d.get('haSelezionaGaranzia'))
for g in (tg or []): print(' ', g.get('key'),'|',g.get('titolo'),'| attiva=',g.get('attiva'))
PY
