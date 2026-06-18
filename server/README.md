# withus-backend

Backend di servizio per le app **IAM** e **QUOTO**. Base su cui costruire:
- **Mail** (lettura via IMAP + invio via SMTP, caselle Aruba) — modulo "Posta" in IAM.
- **Pagamenti** (PayPal + Axerve/Fabrick) in QUOTO.

Il sito (GitHub Pages) è statico e non può parlare con i server di posta/pagamento:
ci pensa questo backend, sempre acceso, che espone un'API sicura alle app.

## Deploy su Render (gratis)

1. Vai su **render.com** → registrati / accedi **con GitHub**.
2. **New +** → **Web Service** → collega il repo **`francescotp93/QUOTE`**.
3. Configura:
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
4. (Facoltativo) In **Environment** puoi lasciare i default; `CORS_ORIGINS` è già impostato per i tuoi domini.
5. **Create Web Service.** Render installa e avvia: otterrai un URL tipo
   `https://withus-backend.onrender.com`.
6. **Verifica:** apri quell'URL nel browser → deve rispondere
   `{"status":"ok","service":"withus-backend",...}`.

> Nota: il piano Free "va in pausa" dopo ~15 min di inattività e al primo accesso
> successivo impiega ~30-60 secondi a risvegliarsi. Va benissimo per iniziare.

Quando l'URL risponde "ok", comunicalo: da lì aggiungiamo gli endpoint della **posta**.
