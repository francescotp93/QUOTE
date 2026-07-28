# RC Polizza — PROCEDIMENTI da copiare (come lavorano)

Obiettivo: **non i dati, ma il metodo**. Qui c'è come RC Polizza costruisce un preventivo,
quali domande fa, in che ordine, e con quale albero di classificazione del rischio.
Tutto ricostruito in **sola lettura** (nessun preventivo creato o inviato).

---

## 1. Il procedimento del preventivo (wizard, nell'ordine reale)

**PASSO 1 — Inquadramento commerciale**
| Domanda a video | Campo | Valori |
|---|---|---|
| *"È un preventivo diretto?"* | `assicuratore` | `Diretto` · `963 - ODDO FRANCESCO` (sub-agente) |
| *"È un preventivo RCA?"* | `tipo_preventivo` | `Si` / `No` |
| *"Come si sta concludendo il contratto?"* | `vendita_online` | **Vendita a distanza** / **Vendita in presenza** |

> 💡 **Da copiare**: la domanda sulla **modalità di vendita** è una richiesta di
> conformità (distribuzione a distanza vs in presenza → obblighi informativi diversi).
> In QUOTO oggi **non c'è**: vale la pena aggiungerla.

**PASSO 2 — Soggetti**
| Domanda | Campo | Valori |
|---|---|---|
| Assicurato | `nuovo-assicurato` | `Seleziona` (esistente) / `Nuovo` |
| *"Il contraente è lo stesso?"* | `stesso_contraente` | `Si` / `No` |
| Contraente (se diverso) | `nuovo-contraente` | `Seleziona` / `Nuovo` |
| Proponente | `id_proponente` | — |

> 💡 **Da copiare**: separazione netta **assicurato ≠ contraente** con la domanda
> "è lo stesso?" che evita di ricompilare. Ricerca su liste paginate:
> `/preventivi/assicurati-lista?page=1&perPage=25|50|100|250` e `/preventivi/contraenti-lista`.

**PASSO 3 — Scelta del prodotto (imbuto a 4 livelli)**
```
RAMO  →  CATEGORIA (gruppo)  →  PROFESSIONE  →  SOTTOPROFESSIONE  →  PRODOTTO
```
| Livello | Campo | API che lo popola |
|---|---|---|
| Ramo | `id_ramo_url` | (statico, 50 rami) |
| Categoria | `id_categoria` | `GET /api/v1/gruppi-rami/{id_ramo}` |
| Professione | `id_professione` | `GET /api/v1/professioni/?id_gruppo={cat}&id_ramo={ramo}` |
| Sottoprofessione | `id_sottoprofessione` | `GET /api/v1/suggest/urlSottoprofessioni/{ramo}/?preventivatore&id_professione={id}&id_subagente={sub}` |
| Prodotto | — | lista "Prodotti in evidenza" / "Cerca un prodotto" |

> 💡 **Da copiare**: è il modo con cui **restringono il rischio prima di quotare**.
> QUOTO oggi va da prodotto → dati; RC Polizza va da **professione → prodotto**.
> Per la RC Professionale è l'approccio giusto (il premio dipende dalla professione).

---

## 2. L'albero completo (estratto e salvato)
File: `tariffe/cataloghi/rcpolizza-albero-professioni.json`
- **52 rami** con classificazione
- **129 categorie**
- **378 professioni** (con `id` e `id_url`)

Esempio (ramo 1 = RC Professionale):
- *Agenti e Commercianti* → Agente Assicurativo · Agente Finanziaria · Agente immobiliare ·
  Agenti di commercio · Agenzia viaggi · Broker Assicurativo · …
- *Dentisti, Odontoiatri e Igienisti Dentali*
- *Personale Parasanitario / Sanitario non medico*
- *Personale Sanitario*
- *Autotrasportatori*

---

## 3. Stati del preventivo (il loro workflow)
```
In attesa → Attesa documenti → Documenti ricevuti → Attesa quotazione →
Attesa pagamento → Pagamento ricevuto → Completato
(rami morti: Respinto · Annullato · In sospeso)
```
> 💡 **Da copiare**: è un **workflow di pratica**, non solo "fatto/non fatto".
> In WITH US ONE il ciclo di vita del preventivo potrebbe seguire questi stati.

---

## 4. API riutilizzabili (sessione con cookie)
```
GET /api/v1/gruppi-rami/{id_ramo}                      → categorie del ramo
GET /api/v1/professioni/?id_gruppo=&id_ramo=           → professioni
GET /api/v1/suggest/urlSottoprofessioni/{ramo}/?…      → sottoprofessioni
GET /api/v1/compagnie                                  → registro IVASS completo
                                                         (codice_ivass, codice_ania, piva,
                                                          denominazione, sede, tipo_impresa)
GET /api/v1/statistiche/dashboard                      → KPI produzione
```
Tutte rispondono `{success, token, results}`.

---

## 5. TARIFFE — stato reale
❌ **Nessuna API di tariffa** (`/api/v1/tariffe` → 404). Confermato: il premio non è
calcolato da RC Polizza, la richiesta va **in "Attesa quotazione"** e risponde la compagnia.
✅ Le uniche quotazioni autonome: **EUROPASSISTANCE** e **METLIFE** (guide dedicate).

**Conclusione:** da RC Polizza si copiano **procedimento e classificazione**, non i prezzi.
I prezzi restano quelli dei documenti di tariffa ufficiali (come già fatto per AmTrust).

---

## 6. Cosa porterei in QUOTO / WITH US ONE (proposta)
1. **Imbuto professione → prodotto** per i rami professionali (oggi manca).
2. **Domanda "vendita a distanza / in presenza"** (conformità).
3. **Assicurato ≠ contraente** con la domanda "è lo stesso?".
4. **Workflow a stati** del preventivo (Attesa quotazione, Attesa documenti…).
5. **Registro IVASS compagnie** da `/api/v1/compagnie` (dati ufficiali, utili in anagrafica).
