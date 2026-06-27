cd /opt/withus-backend 2>/dev/null
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; L=$(git rev-parse HEAD|cut -c1-7); [ "$L" = "2ea654b" ] && { echo "autopull ok"; break; }; sleep 4; done
sudo systemctl restart groupama-scraper.service 2>&1; sleep 12
echo "=== 1) chiudo modale: Conferma lettura (nativo) ==="
curl -s --max-time 35 "http://127.0.0.1:4500/explore?click=Conferma%20lettura" 2>&1 | grep -iE "\"text\"|conferma lettura" | head -3
echo "=== 2) click Applicazioni (nativo) + dump ==="
curl -s --max-time 45 "http://127.0.0.1:4500/explore?click=Applicazioni&all=1" 2>&1 > /tmp/n.json
grep -iE "\"text\"" /tmp/n.json | head -1
echo "--- link dopo Applicazioni (cerco ISA/auto/preventivo) ---"
grep -iE "\"t\":|isa|auto|preventiv|trattat|danni|sinistr" /tmp/n.json | head -45
