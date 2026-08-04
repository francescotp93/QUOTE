#!/usr/bin/env bash
# CONTROLLO URGENTE: la correzione del guardiano e' arrivata sulla macchina?
# Se NON c'e', rispengo la vigilanza all'istante: con il guardiano vecchio
# riaccesa significa di nuovo la casella piena.
cd /opt/withus-backend
E=/opt/withus-backend/server/.env
echo "ramo: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
CORRETTO=$(grep -c "dettoSalute" server/fontiWatchdog.js)
echo "«dettoSalute» presente: $CORRETTO"

if [ "$CORRETTO" -gt 0 ]; then
  echo "OK: il guardiano corretto E' sulla macchina. La vigilanza puo' restare accesa."
  grep -c "FONTI_VIGILANZA_STORE" server/fontiWatchdog.js | sed 's/^/memoria su disco: /'
  systemctl restart withus-backend; sleep 5
  echo "backend: $(systemctl is-active withus-backend)"
else
  echo "ANCORA VECCHIO: rispengo la vigilanza per non riempire la casella."
  grep -q "^FONTI_VIGILANZA=" "$E" || echo "FONTI_VIGILANZA=0" >> "$E"
  sed -i "s/^FONTI_VIGILANZA=.*/FONTI_VIGILANZA=0/" "$E"
  systemctl restart withus-backend; sleep 5
  echo "vigilanza: $(grep '^FONTI_VIGILANZA=' $E)"
  echo "backend: $(systemctl is-active withus-backend)"
fi

echo
echo "### La posta e' accesa? (deve restare accesa in ogni caso) ###"
grep -c "^BREVO_API_KEY=" "$E" | sed 's/^/BREVO_API_KEY attiva: /'

echo
echo "### Quante mail ha mandato la vigilanza da quando l'ho riaccesa? ###"
journalctl -u withus-backend --since '-15 min' --no-pager 2>/dev/null | grep -ci "email inviata" | sed 's/^/invii registrati: /'
journalctl -u withus-backend --since '-15 min' --no-pager 2>/dev/null | grep -i "vigilanza" | tail -6
