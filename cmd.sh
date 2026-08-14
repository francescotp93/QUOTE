#!/usr/bin/env bash
# PRE-VOLO Fase 3. SOLA LETTURA: non cambia niente.
# La domanda: spostando il ramo, che cosa si perde?
cd /opt/withus-backend
echo "### DOVE SIAMO ###"
echo "ramo: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
echo "autopull insegue: $(grep -m1 '^BR=' deploy/autopull.sh)"
echo
echo "### FILE NON TRACCIATI (sopravvivono a reset --hard, ma verifichiamo) ###"
git status --porcelain --untracked-files=normal | head -25
echo "  totale non tracciati: $(git status --porcelain -uall 2>/dev/null | grep -c '^??')"
echo
echo "### LE COSE CHE NON DEVONO SPARIRE ###"
for f in server/.env server/fonti.store.json server/fontiWatchdog.store.json; do
  [ -f "$f" ] && echo "  c'e': $f ($(stat -c%s "$f") byte) · tracciato: $(git ls-files --error-unmatch "$f" >/dev/null 2>&1 && echo SI || echo no)"
done
echo "  sessioni dei browser (userdata):"
for d in scraper/*/userdata; do
  [ -d "$d" ] || continue
  echo "    $d · $(du -sh "$d" 2>/dev/null | cut -f1) · tracciato: $(git ls-files "$d" | head -1 | grep -q . && echo SI || echo no)"
done
echo
echo "### MODIFICHE LOCALI NON COMMITTATE (verrebbero perse) ###"
git status --porcelain | grep -v '^??' || echo "  nessuna"
echo
echo "### STATO ATTUALE DEI SERVIZI ###"
systemctl is-active withus-backend | sed 's/^/  backend: /'
for s in /etc/systemd/system/*-scraper.service; do n=$(basename $s); printf "  %-24s %s\n" "$n" "$(systemctl is-active $n)"; done
