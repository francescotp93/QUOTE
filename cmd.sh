echo "=== riavvio withus-backend per caricare le nuove rotte fonti ==="
sudo systemctl restart withus-backend.service 2>&1 || systemctl restart withus-backend.service 2>&1
echo "restart inviato, attendo…"
sleep 6
echo "=== probe rotte (404 = rotta assente, 401/403 = rotta presente ma serve auth) ==="
for PATH_ in /api/fonti /fonti; do
  for EP in verifica accedi conferma-codice altro-codice; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST http://127.0.0.1:3000${PATH_}/c-groupama/${EP} 2>/dev/null)
    echo "  POST ${PATH_}/c-groupama/${EP} -> $code"
  done
done
echo "=== stato backend ==="
systemctl is-active withus-backend.service 2>&1
journalctl -u withus-backend.service -n 6 --no-pager 2>/dev/null | tail -6
