echo "== timer/cron frequenti =="
systemctl list-timers --all 2>/dev/null | grep -iE 'posta|mail|cmd|pull|digest|withus' | head
echo "== crontab root =="
crontab -l 2>/dev/null | grep -vE '^#|^$' | head
echo "== file che menzionano digest_key o posta_config in /opt =="
grep -rIl -e 'digest_key' -e 'posta_config' /opt 2>/dev/null | grep -v node_modules | head
echo "== definizione servizio cmd-runner (se esiste) =="
ls /opt/withus-backend/*.sh 2>/dev/null; ls /opt/*.sh 2>/dev/null | head
for u in cmd-runner withus-cmd autopull; do systemctl cat ${u}.service ${u}.timer 2>/dev/null | grep -iE 'ExecStart|OnUnitActive|OnCalendar' | head -4; done
echo "== processi che potrebbero fare patch ripetute =="
ps -eo pid,etimes,cmd 2>/dev/null | grep -iE 'posta|digest|patch|node .*index' | grep -v grep | head
