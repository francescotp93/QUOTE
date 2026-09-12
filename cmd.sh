echo "=== ORA: $(date '+%F %T %Z')"
echo "=== DA QUANTO GIRANO GLI SCRAPER (un riavvio = browser nuovo)"
for s in axa groupama allianz italiana hdi moto; do
  [ -f "/etc/systemd/system/${s}-scraper.service" ] || continue
  printf '%-10s %s  dal %s  riavvii:%s\n' "$s" "$(systemctl is-active ${s}-scraper)" "$(systemctl show ${s}-scraper -p ActiveEnterTimestamp --value)" "$(systemctl show ${s}-scraper -p NRestarts --value)"
done
echo "=== STATO SESSIONE ADESSO (dal telecomando interno di ogni scraper)"
for p in "axa 4700" "groupama 4500" "allianz 4200" "italiana 4300" "hdi 4400"; do
  set -- $p
  printf '%-10s %s\n' "$1" "$(curl -s -m 8 http://127.0.0.1:$2/status | head -c 320)"
done
echo "=== QUANTE VOLTE SONO CADUTE NELLE ULTIME 48 ORE (righe di login/sessione nel giornale)"
for s in axa groupama; do
  echo "--- $s"
  journalctl -u ${s}-scraper --since '-48h' --no-pager 2>/dev/null | grep -iE 'login|sessione|scadut|logout|non loggat|riconness|cookie|storage' | tail -25 | cut -c1-190
done
echo "=== CARTELLE DI SESSIONE SU DISCO (data ultima modifica = ultimo salvataggio)"
for s in axa groupama allianz italiana hdi; do
  d=/opt/withus-backend/scraper/$s
  printf '%-10s ' "$s"
  ls -ld $d/userdata $d/auth.json 2>/dev/null | awk '{print $6,$7,$8,$9}' | tr '\n' ' '
  echo
done
