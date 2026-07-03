set +e
echo "== nginx root per quoto =="
grep -rEl "quoto.withusassicurazioni" /etc/nginx/ 2>/dev/null | head -2
grep -rEA6 "server_name[^;]*quoto" /etc/nginx/ 2>/dev/null | grep -E "root|proxy_pass|server_name|index" | head -12
echo "== /opt/withus-backend index.html marker =="
echo "  tcm hits: $(grep -c 'cwTcmQuota' /opt/withus-backend/index.html 2>&1)"
echo "  commit: $(git -C /opt/withus-backend rev-parse --short HEAD 2>&1) ramo $(git -C /opt/withus-backend rev-parse --abbrev-ref HEAD 2>&1)"
echo "== curl localhost frontend =="
curl -s --max-time 10 -H "Host: quoto.withusassicurazioni.it" http://127.0.0.1/ 2>&1 | grep -c "cwTcmQuota\|QUOTO" | head -1
echo "---fine---"
