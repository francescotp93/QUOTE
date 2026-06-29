# Deploy — Allestimenti auto/moto/autocarro + banca dati per codice

> Istruzioni per la sessione di **Claude Code che ha accesso al server** (computer
> con SSH alla VPS, oppure la VPS stessa). La sessione web NON può fare questo deploy.

Branch da deployare: **`claude/vehicle-setup-dropdown-k34432`** (repo `francescotp93/QUOTE`).

## Cosa è cambiato (e dove gira)
- `scraper/italiana/quote-service.mjs` → **scraper Italiana/Plurima** sulla VPS
  (porta 4300, display :97, VNC 5902). Nuovi endpoint: `/veicolo`, `/esplora`;
  navigazione per categoria (auto/moto/autocarro); estrazione tendina allestimenti
  con codice MotorNet.
- `server/moto.js` → **backend** `api.withusassicurazioni.it` (withus-backend).
  Nuovo endpoint `GET /moto/hub-veicolo` + scrittura banca dati `quote_catalogo_veicoli`.
- Tabella Supabase `quote_catalogo_veicoli` → **già creata** in produzione (nulla da fare).

## Passi
1. **Backend** (server `api.withusassicurazioni.it`):
   - `git fetch origin && git checkout claude/vehicle-setup-dropdown-k34432 && git pull`
   - assicurarsi che esista la env `ITALIANA_SCRAPER_URL` (default `http://127.0.0.1:4300`)
     e che `SUPABASE_SERVICE_ROLE_KEY` sia configurata (serve a scrivere la banca dati).
   - riavviare il processo del backend (pm2/systemd/screen: scoprire quale è in uso).
2. **Scraper Italiana** (VPS, porta 4300):
   - stesso branch sul repo della VPS (`git pull`), poi riavviare il processo dello scraper.
   - verifica login: `curl -s http://127.0.0.1:4300/status` → `"loggato": true`
     (altrimenti `curl -s http://127.0.0.1:4300/login` o login via VNC 5902).

## Verifica (diagnostica, sul server)
```bash
# Mappa le sezioni del portale (serve a confermare gli URL di auto/moto/autocarro)
curl -s "http://127.0.0.1:4300/esplora?categoria=auto"
curl -s "http://127.0.0.1:4300/esplora?categoria=moto"
curl -s "http://127.0.0.1:4300/esplora?categoria=autocarro"

# Prova una targa vera per categoria — guardare veicolo.allestimenti (descrizione+codice),
# veicolo.marca/modello/cilindrata/cavalli e debug.selects
curl -s "http://127.0.0.1:4300/veicolo?targa=XXXXXXX&categoria=auto"
```
Incollare l'output (targa oscurabile) nella chat: i selettori vanno **tarati** sul
DOM reale di Plurima (cfr. nota storica in cima a `quote-service.mjs`).

## Verifica lato utente (senza comandi)
Dopo il deploy, in QUOTO aprire un preventivo auto con una targa vera: la tendina
allestimenti si popola e la riga finisce in `quote_catalogo_veicoli`. La sessione
web di Claude può poi leggere la tabella via Supabase e confermare l'esito.
