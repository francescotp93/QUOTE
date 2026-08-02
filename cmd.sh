#!/usr/bin/env bash
# Sospende le mail della vigilanza fonti. UNICA modifica: una riga aggiunta in
# fondo a server/.env. Reversibile togliendola. Il file NON viene mai stampato:
# contiene i segreti.
E=/opt/withus-backend/server/.env
[ -f "$E" ] || { echo "ERRORE: $E non esiste"; exit 1; }

cp -n "$E" "$E.prima-di-sospendere-vigilanza" 2>/dev/null && echo "copia di sicurezza fatta"

if grep -q '^FONTI_VIGILANZA=' "$E"; then
  sed -i 's/^FONTI_VIGILANZA=.*/FONTI_VIGILANZA=0/' "$E"
  echo "riga gia' presente: portata a 0"
else
  printf '\n# Sospesa il 02/08/2026 su richiesta di Francesco: mandava una mail a ogni\n# oscillazione di stato di una fonte, e lo stato vive solo in memoria, quindi\n# ogni riavvio del backend la faceva ricominciare. Rimettere a 1 (o togliere la\n# riga) per riaccenderla.\nFONTI_VIGILANZA=0\n' >> "$E"
  echo "riga aggiunta"
fi

echo "righe FONTI_VIGILANZA nel file: $(grep -c '^FONTI_VIGILANZA=' "$E")  → valore: $(grep '^FONTI_VIGILANZA=' "$E" | cut -d= -f2)"

systemctl restart withus-backend
sleep 4
echo "backend: $(systemctl is-active withus-backend)"
echo
echo "### CONFERMA DAL LOG ###"
journalctl -u withus-backend --since '-2 min' --no-pager 2>/dev/null | grep -i "vigilanza" | tail -5
