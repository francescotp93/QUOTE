cd /opt/withus-backend 2>/dev/null
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; L=$(git rev-parse HEAD|cut -c1-7); [ "$L" = "5a60825" ] && { echo "autopull ok"; break; }; sleep 4; done
sudo systemctl restart groupama-scraper.service 2>&1; sleep 12
echo "=== quali iframe ci sono + contenuto del frame interno ==="
curl -s --max-time 45 "http://127.0.0.1:4500/explore?all=1" 2>&1 > /tmp/f.json
echo "--- frames ---"; grep -A30 "\"frames\"" /tmp/f.json | head -25
echo "--- testo frame interno ---"; grep "\"text\"" /tmp/f.json | head -1
echo "--- link nel frame (cerco news/modale/applicazioni) ---"; grep -iE "\"t\":|isa|conferma|applicaz|preventiv" /tmp/f.json | head -40
