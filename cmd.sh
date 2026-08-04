#!/usr/bin/env bash
# Inventario di tutto quello che gira sulla macchina. Sola lettura.
echo "### SERVIZI withus ###"
systemctl list-units --type=service --all --no-pager --plain 2>/dev/null | grep -iE "withus|scraper" | awk '{print $1, $3, $4}'
echo
echo "### TIMER ###"
systemctl list-timers --all --no-pager 2>/dev/null | grep -iE "withus|scraper|NEXT" | head -12
echo
echo "### CRON di sistema ###"
crontab -l 2>/dev/null | grep -v "^#" | grep -v "^$" || echo "(nessun crontab per root)"
ls /etc/cron.d/ 2>/dev/null | tr '\n' ' '
echo
echo "### PROCESSI NODE attivi ###"
ps -eo comm,args --no-headers 2>/dev/null | grep -E "node" | grep -v grep | sed 's#/opt/withus-backend/##' | cut -c1-90 | sort | uniq -c
echo
echo "### CHROMIUM accesi (uno per scraper) ###"
ps -eo args --no-headers 2>/dev/null | grep -c "[c]hrome\|[c]hromium"
echo
echo "### PORTE in ascolto su 127.0.0.1 ###"
ss -ltnp 2>/dev/null | grep 127.0.0.1 | awk '{print $4}' | sort -u | tr '\n' ' '
echo
echo "### DISPLAY VIRTUALI (Xvfb) ###"
ps -eo args --no-headers 2>/dev/null | grep "[X]vfb" | grep -oE ":[0-9]+" | sort -u | tr '\n' ' '
