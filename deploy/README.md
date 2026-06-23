# Auto-deploy WithUs (niente più terminale)

Il server si aggiorna **da solo** ogni minuto: quando viene pushato un commit sul branch
di lavoro, un timer systemd fa `git pull` e riavvia **solo** i servizi cambiati
(`withus-backend`, `allianz-scraper`, `moto-scraper`).

La sessione Allianz **non si perde** ai riavvii: i cookie sono salvati su disco
(`scraper/allianz/userdata`).

## Installazione (UNA volta sola)
```bash
cd /opt/withus-backend
git fetch origin claude/vibrant-tesla-o0glfd
git checkout -B claude/vibrant-tesla-o0glfd FETCH_HEAD
chmod +x deploy/autopull.sh
cp deploy/withus-autopull.service deploy/withus-autopull.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now withus-autopull.timer
```

Da qui in poi: **non serve più toccare il terminale.** Ogni mia modifica arriva da sola.

## Comandi utili (facoltativi)
```bash
systemctl list-timers withus-autopull.timer     # quando scatta la prossima volta
journalctl -u withus-autopull.service -n 30      # cosa ha aggiornato/riavviato
systemctl start withus-autopull.service          # forza un aggiornamento subito
```
