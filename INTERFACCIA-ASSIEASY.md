# Interfaccia API Assieasy (CRM) — mappa chiamate e procedure

Ricostruita dall'HAR del browser (login `DIGITALE.WITHUS`) + manuali ufficiali.
**Base URL:** `https://withus.assieasy.com/assieasy/`
**Tecnologia:** app ExtJS (Sencha) → backend PHP/CodeIgniter. Tutte le API sono `POST`
`application/x-www-form-urlencoded` con header `X-Requested-With: XMLHttpRequest` e
risposta JSON. La sessione è via cookie (CodeIgniter `ci_session`), il token CSRF è
`ci_csrf_token` (nei campioni risultava vuoto → CSRF disabilitato lato server o gestito via cookie).

> ⚠️ **Vincolo di rete:** Assieasy **blocca gli IP dei server** (verificato: sia il nuovo
> 51.254.142.199 sia il vecchio 152.228.143.149 vanno in timeout). Quindi queste chiamate
> NON possono partire dai nostri server finché Assieasy non autorizza l'IP. Vanno eseguite
> da una rete consentita (es. il browser dell'agenzia, già loggato). Vedi §6.

---

## 1. Login / sessione
```
POST session_user/login
  body: user=DIGITALE.WITHUS & passwd=<password> & ci_csrf_token=
  → 200, imposta il cookie di sessione (ci_session). Body vuoto.

GET  session_user/jsoninfo
  → {"id_utente":"12","username":"DIGITALE.WITHUS","loggato":true,"richiede_2fa":false,
     "cod_compagnia":"017","cod_agenzia":"0017","id_nodo":"1","id_societa_default":"3", ...}
GET  session_user/assimenujson        → struttura del menu (voci/funzioni)
POST session_user/assimenufavoriti    → preferiti
```
`loggato:true` + `richiede_2fa:false` = sessione valida senza 2FA. `id_nodo` e
`id_societa_default` servono come parametri in molte chiamate (qui nodo=1, società=3).

## 2. Clienti / Anagrafiche — *cuore del marketing (LAB)*
```
POST json_multi_ricerca/getDataMultiRicerca/
  body: ELEMENTO_FILTRO=<testo ricerca> & page=1 & start=0 & limit=25
  → {"data":[ { ...cliente... } ]}
```
Ogni record cliente ha **47 campi**, tra cui quelli utili al marketing:
`ID_ANAGRAFICA, NOMINATIVO, NOME, COGNOME, CODICEFISCALE, INDIRIZZO, CAP, COMUNE,
PROVINCIA, EMAIL, EMAIL2, EMAIL_PEC, TEL_CASA, TEL_CELLULARE, TEL_LAVORO, FAX,
TIPOPERSONA (PF/PG), SESSO, DATANASCITA, COMUNE_NASCITA, ID_PROFESSIONE, DESC_PROFESSIONE,
PRIVACY, PRIVACY_REVOCA, RUOLO_DESC ("Cliente attivo"), RUOLO_COD ("VIVO")`.

> `getDataMultiRicerca` è una **ricerca per testo** (serve un `ELEMENTO_FILTRO`). Per l'export
> dell'INTERA rubrica serve l'endpoint della griglia anagrafiche **oppure** le Statistiche
> Libere (§5) — vedi nota "DA CATTURARE" in §6.

### Cruscotto del singolo cliente (per ID_ANAGRAFICA)
```
POST json_anagrafica/getRecordCruscotto/            body: ID_ANAGRAFICA=1713 ...
   → dati anagrafici completi del cliente (success/error/data)
POST json_anagrafica/getDataInfoSuClienteCruscotto/ body: DATI_CLIENTE=<json cliente urlenc>
   → rating/affidabilità pagamenti, portafoglio (€), indotto, info bacheca
POST json_anagrafica/getPolizzeCruscotto/           body: ID_ANAGRAFICA=1713 & SOLO_VIVE=S & VEDI_PROPOSTE=N ...
   → polizze del cliente: ID_POLIZZA, NUMERO_POLIZZA, COD_COMPAGNIA, COD_RAMO, NETTO_RATA,
     TARGA, DATI_TECNICI, DESC_FRAZIONAMENTO ...
POST json_anagrafica/getTitoliCruscotto/            body: ID_ANAGRAFICA=1713 & SOLO_GIACENTI=N & ESCLUDI_ANNULLATI=S ...
   → titoli/quietanze: ID_TITOLO, ID_POLIZZA, DATA_EFFETTO, SCADENZA_TITOLO, RICORRENZA,
     INCASSABILE/INCASSATO, TEL_CELLULARE, EMAIL, DATI_TECNICI (targa+veicolo) ...
POST json_anagrafica/getTitoliCruscotto/ ... (scadenzario per rinnovi/solleciti)
POST json_anagrafica/getDataIndottoCliente/ , getDataAnniIncassiSinistriCruscotto/ ,
     getDataPtfPieCruscotto/ , getDataBachecaCruscotto/   (widget del cruscotto cliente)
```

## 3. Polizze / Titoli
I dati polizza/titolo arrivano dai `*Cruscotto` per cliente (§2). Campi chiave polizza:
`ID_POLIZZA, NUMERO_POLIZZA_PULITO, COD_COMPAGNIA, COD_AGENZIA, COD_RAMO, NETTO_RATA,
TARGA, BENI_POLIZZA, COD_FRAZIONAMENTO/DESC_FRAZIONAMENTO`. Titolo: `DATA_EFFETTO,
SCADENZA_TITOLO` → utile per **scadenzario e solleciti di rinnovo**.

## 4. Contabilità (manuali "Contabilità" + "Estratti Conto")
```
POST menu_switch/contabilita                          (cambio area)
POST json_movimentiliberi/getMovimenti/      body: ID_SOCIETA_FILTRO=3 & DATA_FILTRO=<ISO> & INCLUDI_ASSICURATIVI=0 & page/start/limit
POST json_movimentiliberi/getMovimento/               (singolo movimento)
POST json_movimentiliberi/getDettagliMovimento/       (righe di dettaglio)
POST json_movimentiliberi/getDataLegami/              (legami documenti)
POST json_pianodeiconti/getContabilitaTipiMovimenti/  body: ID_SOCIETA=3   → causali (AN1, RSG, ...)
POST json_pianodeiconti/getModalitaPagamento/
POST json_appuntiincassi/getAppunti/
POST json_utente_societa/getData/ , json_nodi_utenti/getData/ , json_sis_filiali/getData/ ,
     json_utente_agenzie/getData/ , json_utente_gruppiproduttori/getData/   (anagrafiche di struttura)
```

## 5. Statistiche Libere — *strumento nativo per export liste (mailing/marketing)*
```
POST menu_switch/statistica
POST stat_libere/getCriteriNodo/    → criteri/filtri salvati per archivio (ANA=anagrafiche, POL=polizze, SIN=sinistri)
POST stat_libere/getTracciatiNodo/  → "tracciati" = layout di export (es. {COD_ARCHIVIO:"POL", DESCRIZIONE:"SOLO AUTO"})
POST stat_libere/getTipiArchivio/   → archivi disponibili
```
Le **Statistiche Libere** sono il modo ufficiale di Assieasy per estrarre elenchi filtrati
(per archivio ANA/POL/SIN) secondo un tracciato → ideale per generare la lista clienti da
passare a LAB. *Manca ancora la cattura dell'endpoint che ESEGUE la statistica e restituisce/
scarica il risultato (probabilmente `stat_libere/eseguiStatistica` o simile): da catturare.*

## 6. Procedura consigliata per il marketing (LAB) — dato il blocco IP

**Obiettivo:** estrarre tutti i clienti con email/telefono + consenso privacy, e le scadenze,
da riversare in LAB. Poiché i server non raggiungono Assieasy, due strade:

**A) Estrazione lato browser (immediata, nessuna autorizzazione IP).**
Nella scheda Assieasy **già loggata**, uno script eseguito nel browser (console o estensione)
chiama le stesse API XHR e scarica un CSV. Funziona perché il browser dell'agenzia è su rete
consentita e ha già il cookie di sessione. È il percorso più rapido per il primo invio LAB.
→ Serve l'endpoint "elenco completo clienti": **DA CATTURARE** aprendo la **Rubrica/Anagrafiche
   complete** con il Network attivo (cercare la `getData...` della griglia anagrafiche), oppure
   l'esecuzione di una **Statistica Libera** su archivio ANA (§5).

**B) Sincronizzazione lato server (definitiva).** Far **autorizzare l'IP** del server
(51.254.142.199) da Assieasy: a quel punto lo scraper `scraper/assieasy` (porta 4800, già
installato) replica login + paginazione delle API e fa la sincro completa pianificata.

### Pseudo-flusso estrazione clienti
```
1) POST session_user/login (se non già loggati)        → cookie sessione
2) GET  session_user/jsoninfo                           → conferma loggato + id_nodo/id_societa
3) loop paginato sull'endpoint elenco anagrafiche (limit=200, start+=200)
   → per ogni cliente: NOMINATIVO, EMAIL/EMAIL_PEC, TEL_CELLULARE, CF, PRIVACY, RUOLO_COD
4) (opz.) per i clienti target: getPolizzeCruscotto/getTitoliCruscotto → scadenze per i solleciti
5) export CSV → import in LAB
```

> Nota privacy: filtrare su `PRIVACY`/`PRIVACY_REVOCA` e `RUOLO_COD=VIVO` per inviare marketing
> solo a chi ha dato consenso ed è cliente attivo.
