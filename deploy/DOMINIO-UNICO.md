# Dominio unico su VPS — guida operativa (Fase 1 di WITH US ONE)

> **Aggiornamento 15/09/2026 — si fa con Caddy, non con nginx.** Sul VPS davanti
> al backend c'è già Caddy (`api.withusassicurazioni.it`, col suo registro:
> `REGISTRO-RICHIESTE.md`), e `/opt/withus-iam` è già clonato e tenuto su `main`
> dall'autopull dal 21/08/2026. Il pacchetto di questa pagina (nginx, certbot,
> `deploy/nginx/`) non è mai stato eseguito e **non si esegue**: lo sostituisce
>
> - `deploy/caddy/iam.caddy` — il sito `iam.withusassicurazioni.it` versionato:
>   IAM alla radice, QUOTO sotto `/nuovo-preventivo/`, i percorsi di servizio al
>   backend sulla stessa macchina;
> - `deploy/setup.d/20-dominio-unico-caddy.sh` — l'impianto una-tantum: copia il
>   sito in `/etc/caddy/withus/`, aggiunge una riga `import` al Caddyfile, valida,
>   ricarica, controlla `api.` e la configurazione in esecuzione, e rientra da solo
>   se un passo fallisce;
> - il blocco «SITI CADDY VERSIONATI» in `deploy/autopull.sh` — ogni modifica
>   futura a `deploy/caddy/` si valida prima e si ricarica dopo, con rientro;
> - `deploy/dominio-unico.test.mjs` — la prova: niente di ciò che il browser
>   carica viene nascosto, il sorgente del backend sì, lo script ha tutte le reti.
>
> Il gesto che resta a Francesco è lo stesso della tabella qui sotto: su Aruba
> `iam` da `CNAME francescotp93.github.io` ad `A 51.254.142.199`. Caddy prende il
> certificato da solo. Un dettaglio: il sito viene acceso su Caddy **prima** del
> DNS, apposta (così un errore di configurazione si scopre mentre il sito è ancora
> su Pages, senza che nessuno se ne accorga). In quell'intervallo Caddy prova a
> farsi dare il certificato e non ci riesce, e allunga l'attesa fra un tentativo e
> l'altro. **Subito dopo il cambio DNS** conviene un `systemctl reload caddy` (dal
> canale comandi): riparte da zero e il certificato arriva in un minuto.
> Il resto della pagina è la storia del piano, e i dettagli su nginx non valgono più.

> Obiettivo: `iam.withusassicurazioni.it` servito dal VPS OVH (`51.254.142.199`),
> con IAM alla radice, QUOTO sotto `/nuovo-preventivo/` e i servizi smistati
> dallo stesso indirizzo. Stessa origine = un solo login, un solo software.

## Cosa fa il VPS da solo (nessun terminale)

Il meccanismo è lo stesso già usato per gli scraper: `deploy/autopull.sh` gira
ogni minuto e, quando questo pacchetto arriva sul branch che il VPS segue,
esegue in autonomia:

1. **`deploy/setup.d/10-dominio-unico.sh`** (primo impianto, una volta sola):
   - controlla che le porte 80/443 siano libere o già di nginx — se le tiene
     un altro programma **si ferma senza toccare nulla** (protezione di
     `api.withusassicurazioni.it` in produzione);
   - installa nginx e certbot se mancano;
   - crea i checkout delle facciate: `/opt/withus-quoto` (QUOTE, branch `main`)
     e `/opt/withus-iam` (Agente-sospesi, branch `main`);
   - attiva il sito nginx in HTTP;
   - **aspetta che il DNS punti al VPS** e solo allora chiede il certificato
     a Let's Encrypt (HTTPS con rinvio automatico).
2. **Config nginx versionate**: ogni modifica futura a `deploy/nginx/*.conf`
   viene applicata con copia `.bak`, `nginx -t` prima del reload e **rollback
   automatico** se la config non è valida.
3. **Facciate sempre aggiornate**: `/opt/withus-iam` e `/opt/withus-quoto`
   seguono `main` dei rispettivi repo — esattamente come facevano le GitHub
   Pages, ma sotto un solo dominio.

Log di tutto: `journalctl -u withus-autopull.service` e
`/var/lib/withus-autopull/10-dominio-unico.sh.log`.

## I due gesti che restano a Francesco

### 1. DNS su Aruba (attiva il dominio unico)

Nel pannello DNS di Aruba per `withusassicurazioni.it`:

| Azione | Record | Tipo | Valore |
|---|---|---|---|
| **Eliminare** | `iam` | CNAME | `francescotp93.github.io` (quello attuale) |
| **Creare** | `iam` | **A** | `51.254.142.199` |

TTL: il più basso disponibile (300–3600 s). Entro pochi minuti dal cambio il
VPS se ne accorge, ottiene il certificato e accende l'HTTPS da solo.

⚠️ **Quando farlo:** solo DOPO che il pacchetto è attivo sul VPS e verificato
(vedi "Sequenza di attivazione"). Nell'intervallo tra il cambio DNS e il
certificato (1–2 minuti) il sito può mostrare un avviso HTTPS: è atteso.

**Rientro immediato (rollback):** rimettere il CNAME `iam →
francescotp93.github.io` su Aruba. GitHub Pages è ancora lì con tutto: si
torna alla situazione di oggi in un tempo pari al TTL.

### 2. Chiave SSH nei secret (automatizza Claude sul VPS)

Nell'ambiente Claude Code (Impostazioni → ambiente → variabili/secret):

- `VPS_HOST` = `51.254.142.199`
- `VPS_USER` = l'utente SSH (es. `root` o `debian`)
- `VPS_SSH_KEY` = la **chiave privata** di un utente abilitato (meglio se una
  chiave dedicata, revocabile: `ssh-keygen -t ed25519 -C claude-code`, la
  pubblica in `~/.ssh/authorized_keys` del VPS)

Mai la chiave in chiaro nel repo (regola 5). Con questi tre valori Claude può
fare diagnosi dal vivo (stato servizi, log, porte) e il primo sopralluogo
prima dell'attivazione.

## Sequenza di attivazione (ordine vincolante)

1. ✅ Pacchetto pronto e collaudato sul branch di lavoro (39/39 + 9/9).
2. ⏳ Secret SSH configurati → **sopralluogo sul VPS**: chi tiene le porte
   80/443, dove sta il checkout, stato servizi. Si adatta il piano se serve.
3. ⏳ Il pacchetto arriva sul branch che il VPS segue (oggi
   `claude/vibrant-tesla-o0glfd`) → l'autopull fa il primo impianto e resta
   "in attesa del DNS". Verifica: `http://51.254.142.199/` con intestazione
   `Host: iam.withusassicurazioni.it` deve rispondere la facciata IAM.
4. ⏳ Francesco cambia il DNS su Aruba (tabella sopra).
5. ⏳ Il VPS ottiene il certificato da solo → prova completa in produzione:
   login unico, `/nuovo-preventivo/` con QUOTO, collaudi verdi.
6. ⏳ Solo a quel punto: percorsi relativi nel codice (`QUOTO_URL`,
   `withus-one.js`) e, verificata la sessione condivisa in produzione,
   rimozione del passaggio token nell'hash. Il `CNAME` di GitHub Pages si
   toglie per ultimo.

## Cosa NON fa questo pacchetto (di proposito)

- Non tocca il backend né gli scraper (`/opt/withus-backend` resta com'è).
- Non fonde i branch (`main` ↔ `claude/vibrant-tesla-o0glfd` divergono di
  centinaia di commit: si affronta a parte, diff alla mano).
- Non rimuove il passaggio dei token `#at/#rt` (vietato finché il dominio
  unico non è verificato in produzione).
- Non tocca `quoto.withusassicurazioni.it`: resta com'è finché tutto il
  resto non è a regime.
