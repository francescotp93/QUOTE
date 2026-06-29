echo "=== il VECCHIO server (IP fidato) raggiunge Assieasy? (via SSH key tunnel) ==="
ssh -i /root/.ssh/hdi_tunnel -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 root@152.228.143.149 \
  'curl -s -o /dev/null -w "VECCHIO: http_code=%{http_code} ip=%{remote_ip} time=%{time_total}s\n" --max-time 20 https://withus.assieasy.com/assieasy/ 2>&1 || echo "VECCHIO: curl FALLITO"' 2>&1
echo "=== confronto: NUOVO server ==="
curl -s -o /dev/null -w "NUOVO: http_code=%{http_code} time=%{time_total}s\n" --max-time 20 https://withus.assieasy.com/assieasy/ 2>&1 || echo "NUOVO: curl FALLITO"
