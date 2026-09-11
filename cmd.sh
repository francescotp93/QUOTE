# Verifica del rilascio del registro esiti (#126): la VPS deve avere 902194b e il backend ripartito.
ATTESO=902194b
for i in $(seq 1 40); do
  H=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)
  [ "$H" = "$ATTESO" ] && break
  sleep 5
done
echo "HEAD VPS: $H (atteso $ATTESO)"
echo "backend: $(systemctl is-active withus-backend) — avviato: $(systemctl show withus-backend -p ActiveEnterTimestamp --value)"
echo "esiti.js presente: $([ -f /opt/withus-backend/server/esiti.js ] && echo si || echo NO)"
echo "SUPABASE_SERVICE_ROLE_KEY nel .env: $(grep -c '^SUPABASE_SERVICE_ROLE_KEY=' /opt/withus-backend/server/.env 2>/dev/null)"
echo "--- ultime righe del giornale backend:"
journalctl -u withus-backend -n 15 --no-pager 2>/dev/null | cut -c1-160
echo "--- righe [esiti] nel giornale (ultimi 10 min):"
journalctl -u withus-backend --since '-10min' --no-pager 2>/dev/null | grep -i 'esiti' | tail -5 | cut -c1-200
echo "--- /health:"
curl -s -m 5 http://127.0.0.1:3000/health
