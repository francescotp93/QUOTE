set +e
echo "== da quando gira il backend (per capire se ha ricaricato i 150s) =="
systemctl show withus-backend -p ActiveEnterTimestamp 2>&1
echo "== ultime richieste premio-casa/tcm nei log backend =="
journalctl -u withus-backend --since "-8 min" --no-pager 2>/dev/null | grep -iE "premio-casa|premio-tcm|abort|timeout|502|GET /moto" | tail -25
echo "== log scraper HDI ultimi (attività/errori) =="
journalctl -u hdi-scraper --since "-8 min" --no-pager 2>/dev/null | tail -25
echo "---fine---"
