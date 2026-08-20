# QUOTO — Email automatiche (setup)

> **Attenzione al progetto giusto.** QUOTO non ha un database suo: sta nello
> stesso progetto Supabase di IAM, `ekjxrnsfqxnfxzrthdcf`. Esiste anche un
> progetto che si CHIAMA "QUOTE" (`icfmnhypqezjwpllkmmn`): è vuoto, non lo usa
> nessuno, ed è in pausa dal 2026. Questa pagina prima puntava lì — chi la
> seguiva metteva le chiavi su un progetto morto e non capiva perché non
> succedeva nulla.
>
> **Nota del 03/08/2026**: oggi la posta in uscita non passa più da qui ma da
> Brevo (`sendBrevo` in `server/notify.js`, sulla VPS). Questa pagina resta come
> storia dell'impianto Resend, non come istruzioni da eseguire.

Le notifiche email partono da una **Edge Function** Supabase (`notify-email`) che usa
**Resend** come provider. Eventi gestiti:

- **nuova_richiesta** → email a tutti gli **admin** quando un collaboratore invia una richiesta.
- **quotato** → email al **collaboratore** quando l'operatore allega la proposta/quotazione.
- **emessa** → email agli **admin** quando viene emessa la polizza.

## 1) Crea un account Resend (gratis)
1. Vai su https://resend.com → registrati.
2. **API Keys** → *Create API Key* → copia la chiave (`re_...`).
3. (Consigliato) **Domains** → aggiungi e verifica un tuo dominio (es. `quoto.it`) per poter
   inviare a qualsiasi destinatario. In assenza di dominio verificato, Resend con
   `onboarding@resend.dev` invia **solo** all'email del proprietario dell'account (utile per test).

## 2) Configura i secret su Supabase
Dal terminale (nella cartella del progetto), con la Supabase CLI:

```bash
supabase login
supabase link --project-ref ekjxrnsfqxnfxzrthdcf   # quello di IAM: e' l'unico vero
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
# opzionali:
supabase secrets set EMAIL_FROM="QUOTO <noreply@iltuodominio.it>"
supabase secrets set APP_URL="https://quoto.withusassicurazioni.it/"
```

> `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono già disponibili automaticamente nelle Edge Functions.

## 3) Deploy della function

```bash
supabase functions deploy notify-email
```

In alternativa, da **Supabase Dashboard → Edge Functions → Deploy**, incolla il contenuto di
`supabase/functions/notify-email/index.ts`.

## 4) Fatto
Il portale chiama automaticamente la function ai momenti giusti (richiesta inviata, proposta
allegata, polizza emessa). Se la function non è ancora deployata, il portale continua a
funzionare normalmente: l'email viene semplicemente saltata (nessun errore per l'utente).

## Test rapido
Invia una richiesta di preventivo da un collaboratore: gli admin attivi devono ricevere
l'email "Nuova richiesta di preventivo". Controlla i log in **Supabase → Edge Functions → notify-email → Logs**.
