#!/usr/bin/env bash
# COM'E' FATTO IL VPS, prima di aggiungerci i due siti statici. Tutto in SOLA
# LETTURA: si guarda la config di Caddy, dove sta il backend, i permessi e lo
# spazio. Non si cambia niente. Serve a preparare i blocchi Caddy per
# quoto./iam. senza rischiare il blocco `api` che fa quotare l'agenzia.
set -u

echo "== chi sono e con quali diritti =="
whoami; id 2>/dev/null | tr ' ' '\n' | head -3
echo "posso sudo senza password? $(sudo -n true 2>/dev/null && echo SI || echo no)"
echo

echo "== il web server davanti al backend =="
systemctl is-active caddy 2>/dev/null && echo "caddy attivo" || echo "caddy: stato sconosciuto (o non systemd)"
echo "-- eseguibile caddy --"; command -v caddy && caddy version 2>/dev/null | head -1
echo "-- dove tiene la config (dal processo) --"
ps -eo args 2>/dev/null | grep -i "[c]addy run" | head -1

echo
echo "== la Caddyfile (i posti soliti) =="
for f in /etc/caddy/Caddyfile /opt/withus-backend/Caddyfile /root/Caddyfile /etc/caddy/conf.d/*.caddy; do
  if [ -f "$f" ]; then
    echo "--- $f ($(wc -l < "$f") righe) ---"
    sed -e 's/\(basicauth\|password\|token\|secret\)[^ ]* .*/\1 ****REDATTO****/I' "$f"
    echo
  fi
done
echo "-- chi puo' scrivere /etc/caddy --"; ls -ld /etc/caddy 2>/dev/null

echo
echo "== il backend: dov'e' e cosa contiene =="
ls -ld /opt/withus-backend 2>/dev/null
echo "-- c'e' il frontend statico di QUOTO nel repo del backend? --"
ls -la /opt/withus-backend/index.html /opt/withus-backend/CNAME 2>/dev/null | head
echo "-- il deploy automatico (autopull) --"
systemctl list-timers 2>/dev/null | grep -i "autopull\|withus" | head
ls -la /opt/withus-backend/deploy/autopull.sh 2>/dev/null

echo
echo "== spazio su disco (per clonare IAM) =="
df -h / /opt 2>/dev/null | grep -v tmpfs | head

echo
echo "== la porta del backend node (per non confondere i blocchi) =="
ss -ltnp 2>/dev/null | grep -iE "node|:3000|:8080|:4000|:5000" | head
echo "(fine)"
