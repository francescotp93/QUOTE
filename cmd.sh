#!/usr/bin/env bash
# BACKUP stato Fonti: store credenziali + chiave (.env) + sessioni scraper.
# Copia in un archivio a parte fuori da /opt/withus-backend (che l'autopull resetta).
# NON stampa mai segreti: solo nomi file e dimensioni.
set -u
TS=$(date +%Y%m%d-%H%M%S)
DEST="/opt/withus-backup/fonti-$TS"
mkdir -p "$DEST/sessioni"
B=/opt/withus-backend/server
[ -f "$B/fonti.store.json" ] && cp -a "$B/fonti.store.json" "$DEST/" && echo "store credenziali: ok ($(wc -c <"$B/fonti.store.json") byte)"
[ -f "$B/.env" ] && cp -a "$B/.env" "$DEST/env-backend.txt" && echo "chiave/.env (per decifrare lo store): ok"
n=0
for d in /opt/withus-backend/scraper/*/; do
  c=$(basename "$d")
  for f in auth.json storageState.json; do
    [ -f "$d$f" ] && cp -a "$d$f" "$DEST/sessioni/$c-$f" && n=$((n+1)) && echo "sessione $c/$f: ok"
  done
done
echo "sessioni salvate: $n"
tar -czf "$DEST.tgz" -C /opt/withus-backup "fonti-$TS" 2>/dev/null && echo "archivio unico: $DEST.tgz ($(wc -c <"$DEST.tgz") byte)"
echo "== backup esistenti in /opt/withus-backup =="
ls -1 /opt/withus-backup/ 2>/dev/null | tail -8
echo "== contenuto di questo backup (solo nomi) =="
find "$DEST" -type f -printf '%p  %s byte\n' 2>/dev/null | sed -E 's#(env-backend\.txt)#\1 [contiene FONTI_SECRET]#'
echo "(fine)"
