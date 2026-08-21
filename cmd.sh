#!/usr/bin/env bash
# Passo 1 del pilota IAM: metto una copia dei file statici di IAM sul VPS, in una
# cartella nuova (/opt/withus-iam). Non tocca Caddy, non tocca il backend, non
# apre porte: e' solo una copia di file. Serve perche' poi Caddy la possa servire.
set -u
DIR=/opt/withus-iam
if [ -d "$DIR/.git" ]; then
  echo "gia' presente: aggiorno a main"
  git -C "$DIR" fetch -q origin main && git -C "$DIR" reset --hard -q origin/main && echo "aggiornato"
else
  echo "copio agente-sospesi (ramo main) in $DIR"
  git clone -q --depth 1 --branch main https://github.com/francescotp93/agente-sospesi "$DIR" && echo "copiato" || echo "COPIA NON RIUSCITA (forse repo privato: servono credenziali)"
fi
echo "-- cosa c'e' dentro --"
ls "$DIR" 2>/dev/null | head -20
echo "-- l'index e la versione --"
ls -la "$DIR/index.html" 2>/dev/null
git -C "$DIR" log --oneline -1 2>/dev/null
echo "(fine)"
