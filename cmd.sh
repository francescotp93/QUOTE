#!/usr/bin/env bash
# Dove tiene le variabili il servizio? (solo i NOMI, mai i valori)
set -u
cd /opt/withus-backend || exit 1
echo "-- unit --"
systemctl cat withus-backend 2>/dev/null | grep -iE "EnvironmentFile|Environment=|WorkingDirectory|ExecStart" | sed 's/=.*SERVICE_ROLE.*/=<nascosto>/'
echo "-- file .env presenti --"
for f in /opt/withus-backend/.env /opt/withus-backend/server/.env /etc/withus-backend.env /opt/withus/.env; do
  [ -f "$f" ] && echo "  $f  ($(grep -c . "$f") righe)  nomi: $(grep -oE '^[A-Z_]+' "$f" | tr '\n' ' ')"
done
