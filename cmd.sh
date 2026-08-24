#!/usr/bin/env bash
# Dove e' definito HDI_SCRAPER_URL=4401? E qual e' la porta giusta di HDI? (sola lettura)
set -u
echo "== unit backend: EnvironmentFile? =="
systemctl cat withus-backend 2>/dev/null | grep -iE "Environment|ExecStart|WorkingDirectory" | head
echo "== grep HDI_SCRAPER_URL nei posti probabili =="
for f in /opt/withus-backend/.env /opt/withus-backend/.env.local /etc/withus-backend.env /etc/default/withus-backend /opt/withus-backend/ecosystem.config.js; do
  [ -f "$f" ] && echo "-- $f --" && grep -niE "HDI_SCRAPER_URL|4401|4400" "$f" 2>/dev/null | sed -E 's/(TOKEN|SECRET|KEY|PASS)[^=]*=.*/\1=***/I'
done
echo "== grep ricorsivo (solo nomi file) =="
grep -rlnI "HDI_SCRAPER_URL" /opt/withus-backend /etc/systemd/system 2>/dev/null | head
echo "== nessuno ascolta su 4401? =="
ss -ltnp 2>/dev/null | grep ":4401" || echo "4401: NESSUNO in ascolto"
echo "== la porta configurata dello scraper HDI =="
grep -rniE "PORT|4400|4401" /opt/withus-backend/scraper/hdi/deploy/*.service 2>/dev/null | head
echo "== 4400 stato scraper HDI =="
curl -s -m 8 "http://127.0.0.1:4400/status" 2>/dev/null | grep -oE '"(loggato|url)"[: ]*("[^"]*"|[a-z]+)' | head
echo "(fine)"
