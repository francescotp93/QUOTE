echo "== hostname =="; hostname
echo "== dir backend =="; ls -d /opt/withus-backend >/dev/null 2>&1 && echo presente || echo MANCA
echo "== backend attivo =="; systemctl is-active withus-backend 2>/dev/null
echo "== FONTI_SECRET in .env =="; grep -q "^FONTI_SECRET=" /opt/withus-backend/server/.env 2>/dev/null && echo presente || echo assente
echo "== IP pubblico =="; curl -s --max-time 5 ifconfig.me 2>/dev/null; echo
echo "== scraper attivi =="; systemctl list-units --type=service --no-legend 2>/dev/null | grep -i scraper | awk "{print \$1, \$4}"
