# Consegna di lavoro per Codex — Withus Assicurazioni

> Documento di consegna. Chi arriva su questo progetto legge **questo file
> prima di toccare qualsiasi cosa**. Tutto ciò che c'è scritto qui è stato
> verificato sul codice il 01/08/2026, non ricostruito a memoria.
>
> Se una cosa che ti serve non è scritta qui, **non inventarla: chiedila a
> Francesco.** Vale soprattutto per soglie, tariffe, percentuali provvigionali
> e durate di prodotto.

---

## 1. Che cosa sono queste applicazioni

**Il sistema è uno solo e si chiama IAM** — *Insurance Agency Management*.
Vedi `IAM.md`, che è la fonte unica sul nome e sul perimetro. Quella che segue è
la sua costruzione interna: due basi di codice che stanno diventando una sola.

| pezzo | Che cos'è | Dove vive | Online su |
|---|---|---|---|
| **il preventivatore** | le 49 schermate prodotto | `francescotp93/QUOTE` → `index.html` | `quoto.withusassicurazioni.it` |
| **il gestionale** | clienti, portafoglio, contabilità, rete | `francescotp93/Agente-sospesi` → `index.html` | `iam.withusassicurazioni.it` |
| **la scocca** | le 3 barre comuni (intestazione, menu, titolo) | `Agente-sospesi/withus-one.js` + `.css` | dentro il gestionale |
| **la scocca a moduli** | riscrittura in parallelo, non ancora pubblicata | `QUOTE/withus-one/` | — |

> I nomi di file `withus-one.*` restano come sono: sono nomi interni, e
> rinominarli tocca centinaia di riferimenti senza che nessun utente se ne
> accorga (`IAM.md` §2).

Oggi IAM apre QUOTO **dentro un riquadro** (iframe), con la sessione condivisa.
La direzione decisa da Francesco è di **smontare il riquadro** e far diventare
il preventivatore un insieme di moduli dentro la scocca. Quel lavoro è in mano
a Claude: vedi la spartizione al punto 5.

Dati e sessioni: **Supabase** (progetto `ekjxrnsfqxnfxzrthdcf`). Le regole di
visibilità stanno nel database (RLS), non nel browser: `quote_vede(owner)`,
`iam_is_staff()`, `iam_is_admin()`, `iam_mio_ruolo()`.

Un pezzo di backend gira su **VPS OVH** (`api.withusassicurazioni.it`): scraper
delle compagnie, credenziali cifrate, incassi.

---

## 2. La mappa vera (attenzione: alcuni file citati in giro non esistono)

Verificato nella storia git, non a occhio. Se ti passano un brief che nomina
questi file, sappi che:

| File spesso citato | Realtà verificata |
|---|---|
| `withus-premium.css` (IAM o QUOTE) | **non esiste e non è mai esistito** |
| `scrivania-operativa-preview.html` | **non esiste e non è mai esistito** |
| `ecosistema-completo-preview.html` | **non esiste e non è mai esistito** |
| `QUOTE/preventivatore.html` | esiste **solo** sul ramo `claude/vibrant-tesla-o0glfd`, non su `main` |

Il foglio di stile «premium» **esiste già, con un altro nome**:

- `QUOTE/withus-one-tokens.css` — la fonte unica di colori, raggi e misure.
  Verde marchio `#02984e`, raggio 4px, testo 13px. **Non scrivere mai un colore
  a mano: usa `var(--w1-…)`.**
- `QUOTE/withus-one-skin.css` — la pelle costruita su quei token.

Nota importante non risolta: `deploy/autopull.sh:32` segue il ramo
`claude/vibrant-tesla-o0glfd`, che **non è** il ramo su cui si lavora. Finché la
VPS è spenta non è dimostrabile quale codice giri davvero in produzione. Non
dare per scontato che il codice che leggi sia quello vivo.

---

## 3. Come si prova quello che fai

Ci sono tre banchi di prova, tutti senza npm install e tutti da tenere verdi.

**QUOTO — 157 prove su browser vero (Playwright).**
Serve un server locale, altrimenti fallisce con `ERR_CONNECTION_REFUSED`:

```bash
cd QUOTE
npx --yes http-server -p 8077 -s &     # il collaudo si aspetta la porta 8077
node ui-test.mjs                        # atteso: 157/157
```

Chromium è già installato in `/opt/pw-browsers/chromium`. **Non lanciare
`playwright install`.**

**IAM — 14 file di prove (nessun browser, gira in una stanza chiusa).**

```bash
cd agente-sospesi
node controlla-tutto.mjs                # atteso: tutte le prove superate
```

**IAM nuovo — 290 controlli.**

```bash
cd QUOTE
node withus-one/verifica/controlla.mjs  # atteso: 14 file, 290 controlli, tutti verdi
```

### La controprova è obbligatoria

Una prova verde da sola **non dimostra niente**: potrebbe essere passata anche
prima della tua correzione. Prima di dire che hai finito, rigira la stessa prova
sul codice di prima e verifica che **fallisse**:

```bash
git worktree add /tmp/prima HEAD
cp verifica/la-tua-prova.test.mjs /tmp/prima/verifica/
cd /tmp/prima && node verifica/la-tua-prova.test.mjs   # DEVE fallire
git worktree remove /tmp/prima --force
```

Nel messaggio di commit scrivi il risultato della controprova, in chiaro
(esempio reale: «Controprova sul codice di prima: 0 su 9 passavano»).

---

## 4. Le regole che non si discutono

1. **Backup prima di ogni modifica**: commit-checkpoint oppure copia `.bak`.
   Non iniziare a modificare con l'albero sporco.
2. **Mai `push` su `main`.** Da `main` parte il deploy in produzione. Si lavora
   su un ramo tuo (`codex/…`) e si consegna lì.
3. **Niente dati inventati.** Se manca una soglia, una tariffa, una percentuale
   o una durata, il campo resta vuoto e mostra «da confermare». In contabilità
   questa regola non ha eccezioni.
4. **Non toccare login, pagamenti o segreti** senza richiesta esplicita.
5. **Niente credenziali in chiaro**, mai, nemmeno nei commenti o nelle prove.
6. **Privacy**: dati di clienti e collaboratori non finiscono in ricerche web,
   in servizi esterni o nei messaggi di commit.
7. **Niente invii esterni senza conferma** (email, campagne, SMS): sempre bozza
   → conferma di Francesco → invio.
8. **Italiano ovunque**: nomi di funzioni, variabili, commenti, testi a schermo.
9. **I commenti spiegano il perché**, non il cosa. Se una scelta è discutibile,
   il commento dice perché è stata fatta così.
10. **Nessuna emoji** nell'interfaccia: solo icone Tabler (`<i class="ti ti-…">`).
11. **Mai il colore da solo**: ogni stato ha un'etichetta o una spiegazione al
    passaggio del mouse. Un pallino senza legenda non è informazione.

### La regola specifica dei file monolitici

`QUOTE/index.html` è **1,3 MB** e `agente-sospesi/index.html` è **736 KB**.
Non sono file normali.

- **Non usare `.replace()` su stringhe comuni** dentro questi file: colpisce
  occorrenze che non hai visto. Inserisci per numero di riga, e **ricontrolla
  il conteggio delle righe dopo ogni modifica**.
- Prima di sostituire, `grep -n` per contare le occorrenze. Se sono più di una,
  guardale tutte prima di decidere.

---

## 5. La spartizione del lavoro (per non pestarvi i piedi)

La divisione è **per file**, perché è quello che conta quando si uniscono i rami.

| Area | Chi ci lavora |
|---|---|
| `agente-sospesi/index.html` | **Claude** — non toccare |
| `agente-sospesi/withus-one.js` · `withus-one.css` | **Claude** — non toccare |
| `QUOTE/withus-one/**` (il sistema nuovo a moduli) | **Claude** — non toccare |
| `QUOTE/index.html` | **Codex** |
| `QUOTE/withus-one-tokens.css` · `withus-one-skin.css` | **Codex** |
| `QUOTE/ui-test.mjs` e le prove di QUOTO | **Codex** |
| `QUOTE/landing.html`, `firma.html`, `widget.html` | **Codex** |

I token grafici sono l'unico file che tocca a Codex ma che serve anche a Claude:
se cambi un valore lì dentro, **scrivilo nel messaggio di commit in modo
evidente**, perché si ripercuote sulla scocca di IAM.

---

## 6. I pacchetti di lavoro

### P1 — Un solo prodotto per schermata

**Il problema, verificato.** Nel mega-menu del preventivatore ci sono voci
diverse che aprono **la stessa identica schermata generica**:

- `RC Auto`, `Moto e ciclomotori`, `Autocarri`, `Voltura e recupero classe`
  → tutte e quattro aprono `page-rca`, che è la griglia «seleziona la categoria
  veicolo». Chi clicca «Autocarri» dal menu deve poi cliccare *ancora*
  «Autocarri» nella griglia.
- `Polizza medici` → apre la Multirischio impresa generica.
- Tre voci impacchettano due prodotti nel nome: `CVT e ARD`, `Vita e TCM`,
  `Infortuni famiglia e LTC`.

Francesco vuole: **una voce di menu, un prodotto, una schermata.**

**Quello che devi fare, dentro `QUOTE/index.html`.** La buona notizia è che le
funzioni di apertura mirata **esistono già**: `openAuto('Motociclo')`,
`openAuto('Autocarro')`, `openAuto('Imbarcazione')`, `openSaraVintage()`,
`openImpresa(chiave, attivo)`.

Serve renderle raggiungibili **dall'esterno**, perché il menu vive nell'altra
applicazione. Il contratto da rispettare — Claude si aggancerà a questo:

```js
// showPage() accetta un secondo argomento facoltativo: il prodotto specifico.
// showPage('rca')                 → la griglia di prima, invariata
// showPage('rca', 'Motociclo')    → apre direttamente il preventivo Moto
// showPage('impresa', 'medici')   → apre direttamente Polizza medici
showPage(nome, prodotto)
```

Regole di accettazione:
1. `showPage(nome)` senza secondo argomento **si comporta esattamente come
   oggi**. Non è negoziabile: è la porta da cui entrano tutte le altre
   chiamate già esistenti.
2. Ogni prodotto raggiungibile dal menu arriva alla **sua** schermata, senza
   passaggi intermedi.
3. La briciola in alto nomina il prodotto vero («Autocarri»), non la categoria.
4. Prove nuove in `ui-test.mjs`, una per prodotto, con la controprova.

### P2 — Estetica premium su QUOTO

Direzione: premium, minimale, solido, **operativo e non promozionale**.

- Base bianco / grigio chiarissimo, verde With Us come accento principale,
  rosso e ambra **solo** per allarmi e urgenze. Niente viola, niente gradienti
  pesanti, niente cruscotti arcobaleno.
- Raggio **massimo 8px** (i token stanno a 4px: usali).
- Meno card decorative, più ordine e spaziatura coerente. Bottoni sobri.
- **Niente hero, niente sezioni di marketing, niente testi descrittivi inutili
  dentro l'applicazione.** Non è una landing.

Il lavoro concreto è far leggere a `QUOTE/index.html` i token di
`withus-one-tokens.css` dove oggi ci sono colori e misure scritti a mano.
Procedi **a zone**, non tutto insieme, e dopo ogni zona rigira le 157 prove.

Badge di stato da rendere chiari e uniformi: `calcola`, `richiedi`, `pronto`,
`manca documento`, `da firmare`.

### P3 — Rifiniture e responsive

Punti rimasti aperti dal collaudo esterno del 30/07/2026, tutti lato QUOTO:

- overflow orizzontale a **1024px** e a **400px**;
- il widget della chat si sovrappone a comandi cliccabili;
- l'impaginazione degli elenchi;
- pannelli che restano sporchi quando li chiudi e li riapri;
- campi data che si vedono male su alcuni browser;
- il riempimento automatico del login.

Regola di accettazione comune: **nessun errore in console** e **nessuno
scorrimento orizzontale della pagina**. Se una tabella o un blocco di codice è
largo, deve scorrere dentro il suo contenitore, non trascinarsi dietro tutta la
pagina.

---

## 7. Che cosa è bloccato, e perché

**La VPS OVH è spenta.** `api.withusassicurazioni.it` non risponde; `iam` e
`quoto` rispondono 200. Finché resta giù non funzionano — e **non è colpa del
codice**:

- il preventivo **moto multi-compagnia** (24H Moto Platinum);
- i **collegamenti alle compagnie** (Allianz, Italiana) e la verifica credenziali;
- la **ricerca targa** sulla banca dati ANIA;
- gli **incassi**.

Non provare a «sistemarli» nel codice: la macchina deve tornare su. Deve farlo
Francesco dal pannello OVH.

Restano in attesa di Francesco anche: le **provvigioni** (percentuali e regole
di rendicontazione), l'elenco dei **documenti che perfezionano una polizza**, e
le **durate dei prodotti vita** (TCM, Vita/Risparmio). Senza quei dati i campi
relativi restano vuoti con la scritta «da confermare» — non si riempiono a
intuito.

---

## 8. Come si consegna

- Ramo `codex/<argomento-breve>`, mai `main`.
- Un commit per cosa fatta, messaggio in italiano che dice **il perché**, non
  l'elenco dei file.
- Nel messaggio: il risultato del banco di prova **e della controprova**.
- Prima di consegnare, i tre banchi devono essere verdi insieme, non uno alla
  volta.
