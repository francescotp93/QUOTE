# Fonti — Auto-login 2FA + fail-fast (rende la schermata Fonti "leggera")

Obiettivo: metti **link, utente, password** e — dove serve un codice — il sistema
**genera/legge il codice da solo** e rinnova l'accesso alla compagnia senza intervento.
Così "gli accessi non riescono" smette di essere un problema quotidiano.

## Moduli (logica pura, testata — nessuna dipendenza)
- `totp.js` — genera il codice a 6 cifre da un **segreto authenticator** (RFC 6238, verificato sui vettori standard). Per i portali il cui 2FA è un'app.
- `otp-extract.js` — estrae il **codice OTP dalla mail** del portale (molte fonti lo mandano via email). `extractOtp(testo)` + `scegliMailOtp(messaggi, {mittente,oggetto})`.
- `fonti-autologin.js` — `codiceAutomatico(cfg, {mailFetch})` risolve il codice secondo il tipo di 2FA; `isAuthError(msg)` / `valutaEsitoFonte(err)` per il **fail-fast** del giro premio.

## Tipi di 2FA (campo `tipo2fa` nella config della fonte)
| tipo2fa | come | esito |
|--------|------|-------|
| `totp` | codice generato dal segreto (salvato cifrato in `totp`) | **automatico** |
| `email` | OTP letto dalla casella IMAP del portale | **automatico** |
| `push` | approvazione sul telefono (Allianz Duo) | manuale (non simulabile) |
| `sms` | codice via SMS | manuale (per ora) |

## Come si aggancia (integrazione — da fare con collaudo su VPS)
1. **Config per fonte** (Pannello Fonti / `fonti.store.json`): aggiungere `tipo2fa`, e per email `otp_mittente`/`otp_oggetto`/`otp_length`. Il segreto `totp` è già previsto e cifrato (enc/dec in `fonti.js`).
2. **Login automatico** in `fonti.js`: nuovo flusso `/:id/accedi-auto` → chiama lo scraper `/accedi`, poi `codiceAutomatico(cfg, {mailFetch})` e infine `/codice?codice=…`. Per `totp` è tutto in-process; per `email` serve un `mailFetch` che legga le ultime mail della casella del portale riusando il motore IMAP esistente (`server/mail.js` / `caselleMailStore`).
3. **Auto-relogin**: quando lo `stato` di una fonte è `scaduta`, invocare in automatico il login (sopra) invece di aspettare l'operatore.
4. **Fail-fast giro premio** (`moto.js` / `quotation.js`): per ogni fonte, se l'errore soddisfa `isAuthError`, **scartarla subito** (timeout breve) e — opzionale — lanciare un re-login in background. Evita i ~50s di attesa visti nel report.

## Sicurezza
- Segreto TOTP e password: **cifrati a riposo** (AES-256-GCM, già in `fonti.js`), mai rimandati al browser, accesso **solo Super Admin**.
- L'auto-login usa le credenziali della NOSTRA agenzia (accesso autorizzato come intermediari).

## Stato
- Logica pura **testata** (TOTP su vettori RFC; estrazione OTP; fail-fast). Wiring in `fonti.js`/`moto.js` + `mailFetch` IMAP + config per-fonte = prossimo passo, con prova sul VPS.
