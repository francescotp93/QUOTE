echo "=== /status ==="; curl -s --max-time 14 http://127.0.0.1:4700/status | sed 's/"url":"[^"]*"/"url":"<om>"/'; echo
echo "=== pagina attuale (text + campi) ==="
curl -s --max-time 40 "http://127.0.0.1:4700/explore" 2>/dev/null | python3 -c "import sys,json
d=json.load(sys.stdin)
print('URL contiene login/siteminder/oidc?:', any(x in d.get('url','').lower() for x in ['siteminder','oidc','login','usernameor']))
print('TEXT:',d.get('text','')[:250])
print('FIELDS:',[(f.get('id') or f.get('name') or f.get('type')) for f in d.get('fields',[])][:8])"
