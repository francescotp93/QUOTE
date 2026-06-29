cat > /etc/systemd/system/hdi-tunnel.service <<'SVC'
[Unit]
Description=HDI tunnel nuovo:4401 -> vecchio:4400 (IP fidato)
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=/usr/bin/ssh -NT -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=accept-new -i /root/.ssh/hdi_tunnel -L 127.0.0.1:4401:127.0.0.1:4400 root@152.228.143.149
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
SVC
systemctl daemon-reload && systemctl enable --now hdi-tunnel >/dev/null 2>&1
sleep 7
echo "tunnel: $(systemctl is-active hdi-tunnel)"
echo "=== HDI del VECCHIO server via tunnel (localhost:4401) ==="
curl -s --max-time 12 http://127.0.0.1:4401/status 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print('risponde ✅  loggato='+str(d.get('loggato')),'url='+d.get('url','')[:60])" 2>/dev/null || echo "(nessuna risposta dal tunnel)"
