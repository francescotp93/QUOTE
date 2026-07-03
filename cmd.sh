set +e
echo "== dove punta il DNS di quoto =="
getent hosts quoto.withusassicurazioni.it 2>&1 | head -2
echo "== nginx: server block per quoto (con sudo) =="
sudo grep -rEl "quoto" /etc/nginx/ 2>/dev/null | head
sudo grep -rEA8 "server_name[^;]*quoto" /etc/nginx/ 2>/dev/null | grep -iE "root|proxy_pass|server_name|index|alias" | head -15
echo "== la home reale risponde da GitHub Pages o nginx? =="
curl -sI --max-time 12 https://quoto.withusassicurazioni.it/ 2>&1 | grep -iE "^server:|^x-github|^via:|^HTTP" | head -6
echo "== l'index servito ha il mio ultimo commit? cerco marker recente =="
curl -s --max-time 15 https://quoto.withusassicurazioni.it/index.html 2>&1 | grep -c "cwTcmQuota" 
echo "---fine---"
