for i in $(seq 1 10); do H=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null); [ "$H" = "daac63f" ] && break; sleep 8; done
echo "HEAD=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)"
sudo systemctl restart allianz-scraper.service 2>&1 || systemctl restart allianz-scraper.service 2>&1
for i in $(seq 1 13); do S=$(curl -s -m 8 "http://127.0.0.1:4200/status" 2>/dev/null); echo "$S" | grep -q '"loggato":true' && { echo PRONTO; break; }; sleep 8; done
curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=20" >/dev/null 2>&1
echo "=== /premio tipo=auto ==="
curl -s -m 120 "http://127.0.0.1:4200/premio?targa=GY263BY&nascita=17/07/1993&tipo=auto" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print(json.dumps({k:d.get(k) for k in ['ok','premio_annuale','pacchetto','classe_cu','tipo_veicolo','error']},ensure_ascii=False,indent=1))" 2>/dev/null
