#!/usr/bin/env bash
# Verifica fix Groupama sul backend + diagnosi AXA (dove si inchioda). Sola lettura.
set -u
red(){ sed -E 's/("(token|cookie|password|otp|code|codice|secret|authorization)"[: ]*)"[^"]*"/\1"***"/gI'; }
echo "== backend ha il fix mappaScraper? =="
grep -c "login_step === 'loggato'" /opt/withus-backend/server/fonti.js 2>/dev/null
echo "backend HEAD: $(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)  attivo=$(systemctl is-active withus-backend 2>/dev/null)  ultimo-avvio=$(systemctl show withus-backend -p ActiveEnterTimestamp --value 2>/dev/null)"
echo "== Groupama 4500: status grezzo =="
curl -s -m 8 "http://127.0.0.1:4500/status" 2>/dev/null | grep -oE '"(loggato|login_step|login_running|url)":[^,}]*' | red | head
echo "== AXA 4700: dove si inchioda =="
curl -s -m 8 "http://127.0.0.1:4700/loginstate" 2>/dev/null | red | head -c 500; echo
echo "AXA status:"; curl -s -m 8 "http://127.0.0.1:4700/status" 2>/dev/null | grep -oE '"(loggato|login_step|url|ha_credenziali)":[^,}]*' | red | head
echo "== AXA: ha il segreto 2FA salvato? (dallo store, senza mostrarlo) =="
node -e 'try{const s=JSON.parse(require("fs").readFileSync("/opt/withus-backend/server/fonti.store.json","utf8"));const a=(s.__custom&&s.__custom.axa)||s.axa||{};console.log("axa:",{user:!!a.username,pass:!!a.password,totp:!!(a.totp||a.totpSecret||a.totp_secret||a.otp_secret)});}catch(e){console.log("store non leggibile:",e.message)}' 2>/dev/null
echo "(fine)"
