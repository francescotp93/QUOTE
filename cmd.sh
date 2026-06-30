echo "=== Reputazione IP del VECCHIO server verso Prima/Cloudflare ==="
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
echo "--- IP del vecchio server:"
sudo ssh -o StrictHostKeyChecking=accept-new -i /root/.ssh/hdi_tunnel root@152.228.143.149 'curl -s --max-time 12 https://api.ipify.org; echo' 2>&1 | tail -1
echo "--- Prima visto DAL vecchio server (titolo/esito):"
sudo ssh -i /root/.ssh/hdi_tunnel root@152.228.143.149 "curl -s --max-time 20 -A '$UA' https://intermediari.prima.it/login" 2>/dev/null | python3 -c "
import sys,re
h=sys.stdin.read()
t=re.search(r'<title>(.*?)</title>', h, re.I|re.S)
print('title:', (t.group(1).strip()[:80]) if t else '(nessun title)')
low=h.lower()
if 'you have been blocked' in low: print('ESITO: BLOCCATO (hard block) anche dal vecchio server')
elif 'just a moment' in low or 'checking your browser' in low or 'cf-challenge' in low or 'turnstile' in low: print('ESITO: SFIDA JS (NON hard block) -> superabile col browser! IP OK')
elif 'login' in low or 'prima' in low or 'auth0' in low: print('ESITO: pagina reale (login) -> IP OK')
else: print('ESITO: incerto; primi 200c:', h[:200].replace(chr(10),' '))
print('lunghezza html:', len(h))
"
