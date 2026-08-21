#!/usr/bin/env bash
# LA DOMANDA DECISIVA su api.prima.it: e' il flusso INTERMEDIARI (prezzi agenzia)
# o l'API PUBBLICA (prezzi consumer)? Il portale intermediari fa
# fastQuote -> authorizeSalesFlow -> quote. Se api.prima.it NON ha fastQuote
# fra le MUTAZIONI e non ha authorizeSalesFlow, e' l'API pubblica: da li' non
# escono i prezzi che vende l'agenzia, e non serve.
# Solo validazione dello schema: nessun preventivo creato, nessun dato.
set -u
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
G() { curl -s -m 30 -A "$UA" -H 'content-type: application/json' -X POST --data "$1" https://api.prima.it/graphql; }

echo "== c'e' fastQuote fra le MUTAZIONI? (query vuota -> l'errore dice se il campo esiste) =="
for f in fastQuote createQuote authorizeSalesFlow startSalesFlow saveQuote; do
  printf '  mutation %-20s ' "$f"
  G "{\"query\":\"mutation { $f }\"}" | head -c 200; echo
done
echo
echo "== e come QUERY? =="
for f in salesFlow authorize product products vehicleByPlate policy contract intermediary agency broker network agent =; do
  [ "$f" = "=" ] && continue
  printf '  query %-20s ' "$f"
  G "{\"query\":\"{ $f }\"}" | head -c 160; echo
done
echo
echo "== quote(id) su un uuid a caso: chiede autenticazione o dice solo 'non trovato'? =="
# Se risponde 'unauthorized/forbidden' e' protetto; se dice 'not found' e' aperto.
G '{"query":"query($id: Uuid!){ quote(id: $id){ __typename } }","variables":{"id":"00000000-0000-0000-0000-000000000000"}}' | head -c 400; echo
