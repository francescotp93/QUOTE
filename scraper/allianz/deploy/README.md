# Scraper Allianz — interrogazione ANIA per targa

Telecomando HTTP locale su `127.0.0.1:4200`. Stesso schema del 24H (`scraper/moto`),
ma display `:98` e VNC `5901` per convivere. Serve **solo per la banca dati ANIA**
(situazione assicurativa + proprietario), non per i preventivi.

## Installazione sul VPS (una volta)
```bash
cd /opt/withus-backend/scraper/allianz
npm install
npx playwright install chromium      # se non già presente dal 24H
# strumenti display (se non già installati per il 24H):
# apt-get install -y xvfb fluxbox x11vnc

cp deploy/allianz-scraper.service /etc/systemd/system/
# IMPORTANTE: in [Service] imposta la STESSA FONTI_SECRET di withus-backend
#   (EnvironmentFile=/opt/withus-backend/.env  oppure  Environment=FONTI_SECRET=...)
systemctl daemon-reload
systemctl enable --now allianz-scraper
systemctl status allianz-scraper
```

## Primo login
Le credenziali (utente/password) e la **chiave TOTP** si inseriscono dal **Pannello Fonti → Allianz**.
- Con la chiave TOTP salvata, il server genera il codice e fa **login automatico**:
  `curl localhost:4200/login`
- In alternativa, login manuale **una volta** via VNC:
  ```bash
  ssh -L 5901:127.0.0.1:5901 root@<VPS>     # dal Mac
  # apri un VNC viewer su 127.0.0.1:5901 (password: allianz2026) e accedi
  ```
  La sessione resta salvata in `./userdata`.

## Endpoint
- `GET /status` — url corrente, se loggato, se ci sono credenziali/TOTP
- `GET /login` — forza un tentativo di (auto)login
- `GET /logindump` — mappa la pagina di login (per tarare i selettori dell'auto-login)
- `GET /lookup?targa=AB12345` — interrogazione ANIA + dump pagina (per tarare l'estrazione)
- `GET /shot` — screenshot in `shots/current.png`

## Collegamento al backend
Il backend espone la fonte via `server/fonti.js`. Per instradare il lookup Allianz si
userà `ALLIANZ_SCRAPER_URL=http://127.0.0.1:4200` (da aggiungere quando si collega l'endpoint).
