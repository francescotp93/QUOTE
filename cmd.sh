#!/usr/bin/env bash
# SOLA LETTURA. Chi ha spedito posta DOPO che ho spento la vigilanza (19:22)?
# Nessun filtro per servizio: guardo tutto il diario di sistema.
echo "### QUALUNQUE RIGA CHE PARLI DI POSTA, DOPO LE 19:20, DA CHIUNQUE ###"
journalctl --since '19:20' --no-pager 2>/dev/null \
  | grep -iE "mail|smtp|brevo|sendgrid|resend|inviat|notific|alert" \
  | grep -viE "sysstat|apt-daily|man-db|motd" | tail -30

echo; echo "### TUTTI I SERVIZI CHE HANNO SCRITTO QUALCOSA NEGLI ULTIMI 15 MINUTI ###"
journalctl --since '-15 min' --no-pager -o json 2>/dev/null \
  | sed -n 's/.*"_SYSTEMD_UNIT":"\([^"]*\)".*/\1/p' | sort | uniq -c | sort -rn | head -15

echo; echo "### IL TIMER TELEGRAM: CHE COSA FA? ###"
systemctl cat notifica-telegram.service 2>/dev/null | grep -E "ExecStart|Description" | head -4
journalctl -u notifica-telegram --since today --no-pager 2>/dev/null | tail -8

echo; echo "### PROCESSI CHE PARLANO CON UN SERVER DI POSTA ADESSO ###"
ss -tnp 2>/dev/null | grep -iE ":25|:465|:587|smtp" | head -5 || echo "  nessuna connessione SMTP aperta"

echo; echo "### LA VIGILANZA E' DAVVERO SPENTA? ###"
journalctl -u withus-backend --since '-20 min' --no-pager 2>/dev/null | grep -i "vigilanza" | tail -3
echo "  ultima mail registrata dal backend: $(journalctl -u withus-backend --since today --no-pager 2>/dev/null | grep 'email inviata' | tail -1 | cut -c1-40)"
