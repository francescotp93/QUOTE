set +e
export HOME=/root
cd /opt/withus-backend || { echo NOREPO; exit 0; }
git config --global --add safe.directory /opt/withus-backend 2>/dev/null
echo "=== 1) sblocco immediato: chmod +x autopull.sh ==="
chmod +x deploy/autopull.sh; ls -l deploy/autopull.sh
echo "=== 2) fetch + reset al remoto (porta il commit 4293455) ==="
git fetch origin claude/vibrant-tesla-o0glfd 2>&1 | tail -2
BEFORE=$(git rev-parse --short HEAD)
git reset --hard origin/claude/vibrant-tesla-o0glfd 2>&1 | tail -1
AFTER=$(git rev-parse --short HEAD)
echo "HEAD: $BEFORE -> $AFTER"
echo "=== 3) verifica file sul disco ==="
echo -n "autopull self-heal: "; grep -c 'SELF-HEAL' deploy/autopull.sh
echo -n "autopull eseguibile ora: "; test -x deploy/autopull.sh && echo SI || echo NO
echo -n "allianz patch nuova: "; grep -c 'openFastQuote tentativo' scraper/allianz/quote-service.mjs
echo -n "moto.js bersani Allianz: "; grep -c 'String(bersani).toUpperCase' server/moto.js
echo "=== 4) restart servizi cambiati (backend + allianz) ==="
sudo systemctl restart withus-backend && echo 'backend riavviato'
sudo systemctl restart allianz-scraper && echo 'allianz riavviato'
echo "=== 5) l'autopull ora riparte da solo? ==="
sudo systemctl start withus-autopull.service 2>&1; sleep 3
echo -n 'is-failed: '; systemctl is-failed withus-autopull.service
sudo journalctl -u withus-autopull.service --no-pager -n 5 2>&1 | tail -5
echo "---fine---"
