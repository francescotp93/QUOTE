curl -s -m 15 "http://127.0.0.1:4200/sniff/stop" >/dev/null 2>&1
curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=0" >/dev/null 2>&1
echo "sniffer VNC spento, keepalive ripristinato"
