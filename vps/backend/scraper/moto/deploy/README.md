# Scraper Moto Platinum come servizio systemd

Così lo scraper riparte **da solo** dopo riavvii del server o disconnessioni SSH:
niente più `pkill` + `tmux` a mano.

## Installazione (una volta sola, come root sul server)

```bash
chmod +x /opt/withus-backend/scraper/moto/start-service.sh
cp /opt/withus-backend/scraper/moto/deploy/moto-scraper.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now moto-scraper
```

Al primo avvio, se lo scraper chiede il login a Moto Platinum, fallo **una volta**
via VNC (`127.0.0.1:5900`, password `moto2026`): la sessione resta salvata in
`scraper/moto/userdata`.

## Verifica

```bash
systemctl status moto-scraper        # deve risultare "active (running)"
curl -s http://127.0.0.1:4100/        # negli endpoints deve esserci /lookup
journalctl -u moto-scraper -f         # log in tempo reale
```

## Aggiornamenti futuri (un solo comando)

```bash
cd /opt/withus-backend && git pull && systemctl restart withus-backend moto-scraper
```
