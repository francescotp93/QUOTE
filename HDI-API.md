# HDI Partner API — che cosa c'è, e cosa manca per accenderla

Scritto il 04/08/2026, leggendo il file OpenAPI 3.1 scaricato dal portale HDI.

## In due righe

HDI espone **169 rotte** ufficiali. Oggi noi HDI lo interroghiamo con uno
**scraper di 2746 righe** che tiene in piedi un Chromium su un display
virtuale. Le API parlano da macchina a macchina: niente browser, niente
sessione che scade, niente persona che rientra quando si rompe.

Il collegamento è **scritto e collaudato**. È **spento**, e resta spento
finché HDI non rilascia le credenziali.

## Come si autentica

OAuth2 `client_credentials`. Nel file di HDI il campo `scopes` è **vuoto**:
non c'è niente da chiedere nella richiesta del token. I permessi sono
attaccati alla nostra utenza da HDI, sul loro server.

Conseguenza pratica: **dal file non si può sapere cosa ci è permesso**. Lo si
scopre chiamando. Per questo il modulo distingue il `403` («non abilitato»,
va chiesto a loro) da un guasto vero.

## Che cosa copre, rispetto a quello che facciamo oggi

| Nostra rotta scraper | API HDI |
|---|---|
| `/hubveicolo`, `/motor-targa` | `GET /api/v2/road/getCarDataRE?plate=` |
| `/premio-motor`, `/preventivo`, `/auto` | `v2/road`: fastQuotation → instances → quotations |
| `/premio-casa` | `v1/Home`, stessa catena |
| `/premio-tcm` | `v2/injuries` — **da verificare**: TCM è vita, «injuries» è infortuni |
| — | `v2/pmi` — non lo facciamo affatto oggi |

Oltre alla quotazione ci sono `proposals`, `issuance`, `collection`,
`signContract`, `documentation`: emissione, incasso e firma. **Non le tocchiamo**
finché HDI non conferma per iscritto che siamo autorizzati.

## Che cosa serve da HDI

1. `client_id` e `client_secret`, per collaudo **e** per produzione (separati).
2. Quali aree sono abilitate alla nostra utenza: `road`, `home`, `injuries`, `pmi`.
3. **Indirizzo base e token URL di produzione.** Nel file l'elenco `servers` è
   vuoto e l'unico host presente è `platform-cert.hdia.it`, che è il collaudo.
4. Conferma scritta su quali operazioni possiamo eseguire da programma.

## Come si accende

Nel `.env` della VPS, mai nel codice e mai in chat:

```
HDI_API_BASE=https://platform-cert.hdia.it
HDI_TOKEN_URL=https://platform-cert.hdia.it/security/idp/oauth/token
HDI_CLIENT_ID=...
HDI_CLIENT_SECRET=...
```

Poi si riavvia il backend e si controlla:

```
GET /hdi-api/stato      → dice se è configurato e SU QUALE AMBIENTE
GET /hdi-api/veicolo?targa=AB123CD
```

`/hdi-api/stato` non stampa mai il segreto: del client id mostra solo l'inizio.

## Il piano, in tre passi

1. **`getCarDataRE`** — legge e basta, nessun rischio. Si confronta con quello
   che dà lo scraper sulle stesse targhe.
2. **La catena di quotazione `road`**, in parallelo allo scraper per un periodo,
   confrontando i premi.
3. Lo scraper si spegne **solo quando i due danno lo stesso numero** su un
   campione vero.

Emissione e firma per ultime, e solo con l'autorizzazione al punto 4.

## Una cosa da non sbagliare

`platform-cert.hdia.it` è il **collaudo**: i premi che restituisce non sono
premi veri. `/hdi-api/stato` e ogni risposta dicono sempre su quale ambiente si
sta lavorando — mostrare a un cliente un premio di collaudo è il guaio peggiore
di tutta questa integrazione.
