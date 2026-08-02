#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Ferma i due scraper che stanno bussando ai portali delle compagnie: ogni
# tentativo di accesso fa scattare la notifica del portale, e a Francesco ne
# arrivano in continuazione. Reversibile con `systemctl start`.
#
# L'UNICA azione e' il `systemctl stop`. Tutto il resto qui sotto e' sola
# lettura: niente credenziali, niente dati di clienti, niente scritture.
# ─────────────────────────────────────────────────────────────────────────────

echo "### CHI GIRA ###"
for s in allianz-scraper italiana-scraper moto-scraper withus-backend caddy \
         withus-autopull.timer cmd-runner.timer; do
  printf '%-26s %s\n' "$s" "$(systemctl is-active "$s" 2>/dev/null)"
done

echo; echo "### LA PROVA DEL CICLO (solo righe keep-alive / autoLogin / freno) ###"
for s in allianz-scraper italiana-scraper; do
  echo "--- $s ---"
  journalctl -u "$s" --since '-8 hours' --no-pager 2>/dev/null \
    | grep -E "keep-alive|autoLogin|freno" | tail -14
done

echo; echo "### FERMO I DUE SCRAPER ###"
systemctl stop allianz-scraper italiana-scraper
sleep 2
for s in allianz-scraper italiana-scraper; do
  printf '%-26s %s\n' "$s" "$(systemctl is-active "$s" 2>/dev/null)"
done

echo; echo "### QUALE CODICE GIRA DAVVERO (domanda aperta da due giorni) ###"
if [ -d /opt/withus-backend/.git ]; then
  cd /opt/withus-backend || exit 0
  echo "ramo:   $(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  echo "commit: $(git log -1 --format='%h %ad %s' --date=short 2>/dev/null)"
  echo "remoto: $(git config --get remote.origin.url 2>/dev/null | sed 's#//[^@]*@#//***@#')"
  echo "-- che ramo insegue autopull --"
  grep -nE '^[[:space:]]*(BR|BRANCH)=|checkout|pull origin' deploy/autopull.sh 2>/dev/null | head -6
else
  echo "/opt/withus-backend non e' un clone git"
fi

echo; echo "### PERCHE' L'SSH NON RISPONDE SULLA 22 ###"
systemctl is-active ssh sshd 2>/dev/null
ss -lntp 2>/dev/null | grep -E ':22[^0-9]|sshd' | head -5

echo; echo "### CADDY ###"
systemctl status caddy --no-pager 2>/dev/null | head -12
