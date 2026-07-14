echo "HOST $(hostname)"
echo "BACKEND $(systemctl is-active withus-backend 2>/dev/null)"
for c in italiana hdi groupama moto axa prima allianz; do echo "SCRAPER $c $(systemctl is-active ${c}-scraper 2>/dev/null)"; done
echo "DISK $(df -h / | awk "NR==2{print \$5\" usato\"}")"
echo "UPTIME $(uptime -p 2>/dev/null)"
echo "FONTI_SECRET $(grep -q "^FONTI_SECRET=" /opt/withus-backend/server/.env && echo presente || echo ASSENTE)"
