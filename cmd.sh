#!/usr/bin/env bash
# SOLA LETTURA. E' il nostro backend a spedire mail? E chi altro tocca i portali?
echo "### IL BACKEND HA SPEDITO MAIL OGGI? ###"
journalctl -u withus-backend --since today --no-pager 2>/dev/null \
  | grep -icE "mail|smtp|brevo|sendmail|inviata" | xargs printf "  righe che parlano di posta: %s\n"
journalctl -u withus-backend --since today --no-pager 2>/dev/null \
  | grep -iE "mail|smtp|brevo|inviata" | tail -12

echo; echo "### CHIAMATE ALLE ROTTE CHE FANNO PARTIRE UN LOGIN ###"
journalctl -u withus-backend --since today --no-pager 2>/dev/null \
  | grep -iE "/fonti/.*(verifica|login|codice)" | tail -10 | sed 's/^\(.\{140\}\).*/\1/'

echo; echo "### C'E' UN CRON O UN TIMER CHE TOCCA LE FONTI? ###"
systemctl list-timers --all --no-legend 2>/dev/null | awk '{print "  "$0}' | head -12
echo "  --- crontab di root ---"
crontab -l 2>/dev/null | grep -v '^#' | head -10 || echo "  (vuoto)"

echo; echo "### QUANTE VOLTE OGNI SCRAPER HA DAVVERO PREMUTO INVIO SU UN FORM ###"
cd /opt/withus-backend 2>/dev/null || exit 0
for u in $(systemctl list-units --type=service --all --no-legend 2>/dev/null | awk '/scraper/{print $1}'); do
  n=$(journalctl -u "$u" --since today --no-pager 2>/dev/null \
      | grep -cE "step1: utente=|campi compilati|passcode|codice monouso inserito|submit")
  h=$(journalctl -u "$u" --since '-3 hours' --no-pager 2>/dev/null \
      | grep -cE "step1: utente=|campi compilati|passcode|codice monouso inserito|submit")
  printf '  %-26s oggi %4s   ultime 3 ore %4s\n' "$u" "$n" "$h"
done
