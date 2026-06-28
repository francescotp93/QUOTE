echo "=== AUTOPULL: unit service ==="
systemctl cat withus-autopull.service 2>/dev/null | head -40
echo "=== AUTOPULL: script ExecStart ==="
EXEC=$(systemctl show withus-autopull.service -p ExecStart 2>/dev/null)
echo "$EXEC" | head -3
# prova a trovare lo script di pull
for f in /opt/withus-backend/autopull.sh /opt/withus-backend/scripts/autopull.sh /usr/local/bin/withus-autopull.sh /opt/autopull.sh; do [ -f "$f" ] && { echo "--- $f ---"; cat "$f"; }; done
echo "=== servizi scraper presenti ==="
systemctl list-units --type=service 2>/dev/null | grep -iE "scraper|withus|italiana|hdi|groupama|allianz|prima|axa" | awk '{print $1}'
echo "=== NEXUS url dal menu Applicazioni ==="
curl -s --max-time 40 "http://127.0.0.1:4500/explore?goto=https://accedi.groupama.it/pda/PortaleGA/index.xhtml" 2>&1 >/dev/null
curl -s --max-time 40 "http://127.0.0.1:4500/explore?click=Applicazioni&all=1" 2>&1 | grep -iE "nexus|href.*pda|PR_|omnia" | head -15
