cd /opt/withus-backend 2>/dev/null || cd /opt/*backend* 2>/dev/null
echo "=== servizi attivi (backend + scraper) ==="
systemctl list-units --type=service --state=running 2>/dev/null | grep -iE "backend|quoto|withus|node|server" | head
echo "=== il backend espone /accedi? (probe SENZA auth: mi aspetto 401/403, NON 404) ==="
for P in 3000 8080 4000; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST http://127.0.0.1:$P/api/fonti/c-groupama/accedi 2>/dev/null)
  echo "  porta $P -> HTTP $code"
done
echo "=== HEAD del backend ==="
git rev-parse HEAD 2>/dev/null | cut -c1-7
echo "=== ultimi log richieste fonti (accedi/conferma) ==="
journalctl --since "-10 min" 2>/dev/null | grep -iE "fonti/.*(accedi|conferma|codice)|POST /api/fonti" | tail -15
echo "=== nome servizio backend ==="
systemctl list-unit-files 2>/dev/null | grep -iE "backend|quoto|withus|pay|server" | head
