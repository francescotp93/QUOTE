#!/usr/bin/env bash
# Installa il notificatore Telegram: legge la posta nuova da Supabase e la manda a
# Francesco su Telegram. Timer systemd ogni 10 min. Idempotente.
set -u

mkdir -p /opt/withus-backend/deploy

# --- script python del notificatore ---
cat > /opt/withus-backend/deploy/notifica-telegram.py <<'PYEOF'
import json, urllib.request, urllib.parse
ENVF='/opt/withus-backend/server/.env'
def val(k):
    try:
        for line in open(ENVF):
            if line.startswith(k+'='):
                return line.split('=',1)[1].strip().strip('"')
    except Exception: pass
    return ''
SRK=val('SUPABASE_SERVICE_ROLE_KEY'); SBURL=val('SUPABASE_URL') or 'https://ekjxrnsfqxnfxzrthdcf.supabase.co'
H={'apikey':SRK,'Authorization':'Bearer '+SRK}
def get(path):
    req=urllib.request.Request(SBURL+path, headers=H)
    return json.load(urllib.request.urlopen(req, timeout=30))
def patch(path, body):
    req=urllib.request.Request(SBURL+path, data=json.dumps(body).encode(),
        headers={**H,'Content-Type':'application/json','Prefer':'return=minimal'}, method='PATCH')
    urllib.request.urlopen(req, timeout=30).read()
cfg=get('/rest/v1/posta_config?id=eq.1&select=telegram_token,telegram_chat_id')[0]
TG=cfg.get('telegram_token'); CHAT=cfg.get('telegram_chat_id')
if not TG or not CHAT:
    print('token/chat mancanti'); raise SystemExit(0)
rows=get('/rest/v1/posta_notifiche?avvisato=eq.false&categoria=neq.spam&select=mittente,oggetto,casella,importante&order=importante.desc')
if rows:
    imp=[r for r in rows if r.get('importante')]; oth=[r for r in rows if not r.get('importante')]
    lines=['\U0001F4EC %d nuove email:'%len(rows)]
    for r in imp: lines.append('\U0001F534 %s — %s (%s)'%(r.get('mittente',''), r.get('oggetto',''), r.get('casella','')))
    for r in oth: lines.append('• %s — %s'%(r.get('mittente',''), r.get('oggetto','')))
    text='\n'.join(lines)
    data=urllib.parse.urlencode({'chat_id':CHAT,'text':text}).encode()
    urllib.request.urlopen('https://api.telegram.org/bot%s/sendMessage'%TG, data=data, timeout=30).read()
    print('inviato: %d email'%len(rows))
else:
    print('niente di nuovo')
# marca tutte le pendenti (incl. spam) come avvisate
patch('/rest/v1/posta_notifiche?avvisato=eq.false', {'avvisato':True})
PYEOF

# --- unit systemd ---
cat > /etc/systemd/system/notifica-telegram.service <<'SVCEOF'
[Unit]
Description=Notifica Telegram posta nuova (Giulia)
After=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /opt/withus-backend/deploy/notifica-telegram.py
SVCEOF

cat > /etc/systemd/system/notifica-telegram.timer <<'TMREOF'
[Unit]
Description=Notifica Telegram ogni 10 minuti
[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
AccuracySec=30s
[Install]
WantedBy=timers.target
TMREOF

systemctl daemon-reload
systemctl enable --now notifica-telegram.timer >/dev/null 2>&1
echo "timer: $(systemctl is-active notifica-telegram.timer) / enabled: $(systemctl is-enabled notifica-telegram.timer 2>/dev/null)"

echo "=== esecuzione di prova adesso ==="
systemctl start notifica-telegram.service
sleep 2
journalctl -u notifica-telegram.service -n 8 --no-pager 2>/dev/null | tail -8
echo "=== prossimo avvio ==="
systemctl list-timers notifica-telegram.timer --no-pager 2>/dev/null | head -3
echo FINE.
