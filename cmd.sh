cd /opt/withus-backend 2>/dev/null
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; L=$(git rev-parse HEAD|cut -c1-7); [ "$L" = "5a9ad9f" ] && { echo "autopull ok"; break; }; sleep 4; done
sudo systemctl restart groupama-scraper.service 2>&1; sleep 13
echo "=== 1) apro ISA ==="
curl -s --max-time 50 "http://127.0.0.1:4500/explore?goto=https://accedi.groupama.it/pda/PR_ISA" 2>&1 | grep "\"url\"" | head -1
echo "=== 2) Trattativa ==="
curl -s --max-time 40 "http://127.0.0.1:4500/explore?click=Trattativa" 2>&1 >/dev/null
echo "=== 3) Nuovo preventivo auto ==="
curl -s --max-time 40 "http://127.0.0.1:4500/explore?click=Nuovo%20preventivo%20auto" 2>&1 | grep "\"text\"" | head -1
echo "=== 4) scrivo targa GY263BY ==="
curl -s --max-time 40 "http://127.0.0.1:4500/explore?fill=GY263BY" 2>&1 | grep -iE "targa" | head -3
echo "=== 5) CREA (recupero ANIA, attendo) ==="
curl -s --max-time 60 "http://127.0.0.1:4500/explore?click=CREA" 2>&1 >/dev/null
sleep 10
echo "=== 6) schermata dopo CREA (veicolo/premio) ==="
curl -s --max-time 45 "http://127.0.0.1:4500/explore?all=1" 2>&1 > /tmp/crea.json
grep "\"text\"" /tmp/crea.json | head -1
echo "--- campi/select ---"; grep -iE "\"name\":|\"placeholder\":" /tmp/crea.json | head -20
echo "--- bottoni/voci ---"; grep -iE "\"t\":|premio|garanz|massimale|guida|veicolo|errore|ania" /tmp/crea.json | head -40
