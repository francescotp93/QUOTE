# Deploy withus-backend su VPS (IP statico, sempre acceso)

Obiettivo: spostare il backend da Render a un **VPS** con **IP statico**, HTTPS automatico e
nessun "addormentamento". Risultato: il backend risponde su `https://api.withusassicurazioni.it`.

Stack: **Ubuntu 24.04** + **Node 20** + **Caddy** (HTTPS automatico) + **systemd** (avvio/riavvio).

---

## 1) Crea il server (consigliato: Hetzner Cloud)
- Provider consigliato: **Hetzner Cloud** (ottimo rapporto qualità/prezzo, EU).
  Alternativa: DigitalOcean.
- Tipo: **CX22** (2 vCPU / 4 GB) ~€4/mese — più che sufficiente.
- Immagine: **Ubuntu 24.04**.
- Datacenter: EU (Nuremberg / Falkenstein / Helsinki).
- Aggiungi la tua **chiave SSH** (o usa la password root che ti dà il provider).
- Annota l'**IP pubblico** del server (è il tuo IP statico).

## 2) DNS (Aruba)
Crea un record **A**:
- Nome/Host: `api`
- Tipo: `A`
- Valore: l'**IP** del server
- (Risultato: `api.withusassicurazioni.it` → IP del VPS)

Aspetta che il DNS si propaghi (qualche minuto).

## 3) Installazione (sul server)
Collegati via SSH (`ssh root@IP`) e lancia:

```bash
curl -fsSL https://raw.githubusercontent.com/francescotp93/QUOTE/main/server/deploy/setup.sh | bash
```

Lo script installa Node, Caddy, scarica il codice e configura il servizio.

## 4) Variabili d'ambiente (i segreti)
Modifica il file degli env e incolla i valori (gli stessi che hai su Render):

```bash
nano /opt/withus-backend/server/.env
```

Vedi `.env.example` per l'elenco delle variabili. Poi:

```bash
systemctl restart withus-backend
```

## 5) Imposta il dominio in Caddy
```bash
nano /etc/caddy/Caddyfile      # metti il tuo dominio api.withusassicurazioni.it
systemctl reload caddy
```

## 6) Verifica
Apri: `https://api.withusassicurazioni.it/pay/config` → deve rispondere come prima.

## 7) Sposta le app sul nuovo backend
Nel codice si cambiano due sole righe (lo faccio io quando il server è pronto):
- QUOTO `index.html`: `PAY_API = 'https://api.withusassicurazioni.it'`
- IAM `index.html`: `MAIL_API = 'https://api.withusassicurazioni.it'`

E si aggiunge il nuovo dominio alla CORS (`CORS_ORIGINS`) — già previsto.

## 8) Dismetti Render
Quando tutto funziona sul VPS, su Render puoi sospendere il servizio (o tienilo come backup).
