# API Preventivi QUOTO — Edge Function `preventivo`

Calcola il premio di ogni prodotto quotabile. Una sola funzione, un solo indirizzo,
si sceglie il prodotto con il campo `prodotto`.

## Come pubblicarla (dal browser, anche da iPad)

1. Supabase → progetto IAM → menù **Edge Functions** → **Deploy a new function** (o "Create function").
2. Nome funzione: **`preventivo`**.
3. Incolla tutto il contenuto di `index.ts`.
4. **Importante:** disattiva **"Verify JWT"** (così il sito può chiamarla senza login).
5. **Deploy**.

L'indirizzo sarà:
```
https://ekjxrnsfqxnfxzrthdcf.supabase.co/functions/v1/preventivo
```

## Come si usa

`POST` con corpo JSON. Header consigliati:
```
Content-Type: application/json
apikey: <ANON KEY del progetto>
```

Risposta tipica:
```json
{
  "ok": true,
  "modulo": "salute",
  "compagnia": "Aglea Salus",
  "prodotto": "Aglea Salus · Attiva Plus (Singolo)",
  "premio_annuo": 1460,
  "frazionamento": "mensile",
  "numero_rate": 12,
  "rata": 121.67,
  "garanzie": ["..."]
}
```
In caso di errore: `{ "ok": false, "errore": "Età non ammessa: 72 anni (massimo 60)." }`

Per l'elenco dei prodotti: invia `{ "prodotto": "_catalogo" }`.

## Prodotti e parametri

| `prodotto` | Parametri principali |
|---|---|
| `salute` | `tipo` (attiva\|protezione\|ltc), `livello` (base\|plus\|plat), `comp` (single\|nucleo), `ltc` (150\|200\|350), `fraz` (annuale\|semestrale\|trimestrale\|mensile), `dob`, `dataEffetto` |
| `rc_vita_privata` | nessuno (premio fisso 144) |
| `inf_circolazione` | nessuno (premio fisso 60) |
| `animali` | `pacchetto` (silver\|gold\|platinum\|diamond), `tipo` (cane\|gatto\|coniglio), `rc` (true/false), `dob_animale` |
| `viaggio` | `dest` (italia\|europa\|mondo_ex\|mondo_incl), `dataPartenza`, `dataRientro` (o `giorni`), `livello` (Small\|Medium\|Large), `nAssicurati` |
| `catastrofali` | `cap`, `valore`, `terrCont`, `alluFabb`, `alluCont`, `frazionamento` (Annuale\|Semestrale) |
| `albergo` / `lidi` | `attivita` (alb_somm\|alb_res\|alb_camp\|balneari), `massimale`, `fatturato`, `rco`, `estensioni` [..] |
| `furto_incendio` | `provincia` (sigla), `valore`, `garanzie` [vandalici\|eventi\|cristalli\|kasco\|collisione], `assistenza` |
| `tutela_legale` | `prodotto_tl` (mydrive\|myway\|utenze) + relativi (`massimale`, `intestatario`, `mdTarga`, `mdQuintali`, `sconto15`, `mwFormula`, `mwPerdite`, `utFormula`) |
| `rc_professionale` | `categoria`, `sotto` (indice), `massimale` (etichetta), `fatturato` |
| `rc_non_regolamentate` | `professione` (o `categoria`), `massimale` (etichetta), `fatturato` |

## Esempio da incollare nel sito (HTML + JS)

```html
<script>
async function preventivoSalute() {
  const r = await fetch("https://ekjxrnsfqxnfxzrthdcf.supabase.co/functions/v1/preventivo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": "LA_TUA_ANON_KEY"
    },
    body: JSON.stringify({
      prodotto: "salute", tipo: "attiva", livello: "plus",
      comp: "single", fraz: "mensile", dob: "1985-04-12"
    })
  });
  const q = await r.json();
  if (q.ok) alert(q.prodotto + " → " + q.rata + " €/mese (" + q.premio_annuo + " €/anno)");
  else alert("Errore: " + q.errore);
}
</script>
<button onclick="preventivoSalute()">Calcola preventivo Salute</button>
```

## Nota
Le tariffe sono estratte dal codice di QUOTO; quelle catastrofali e RC professionali
vengono lette dai file pubblici in `tariffe/`. Se aggiorni una tariffa nell'app,
aggiorna anche qui (o, in futuro, facciamo puntare l'app a questa stessa funzione
così la fonte è una sola).
