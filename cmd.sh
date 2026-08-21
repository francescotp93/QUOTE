#!/usr/bin/env bash
# api.prima.it E' UN GRAPHQL VIVO E DAL NOSTRO SERVER RISPONDE (nessun muro).
# La radice si chiama RootQueryType, non Query: per questo l'introspezione di
# prima non ha trovato niente. Qui si guarda per bene CHE COSA sa fare.
# Solo lettura dello schema e messaggi d'errore: nessuna credenziale, nessun
# preventivo creato, nessun dato di cliente.
set -u
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
G() { curl -s -m 30 -A "$UA" -H 'content-type: application/json' -X POST --data "$1" https://api.prima.it/graphql; }

echo "== 1. come si chiamano radice e mutazioni =="
G '{"query":"{ __schema { queryType { name } mutationType { name } } }"}' | head -c 600; echo; echo

echo "== 2. i campi della radice =="
G '{"query":"{ __type(name: \"RootQueryType\") { fields { name } } }"}' | tr ',' '\n' | grep -o '"name":"[^"]*"' | head -80
echo

echo "== 3. i campi delle mutazioni =="
G '{"query":"{ __schema { mutationType { fields { name } } } }"}' | tr ',' '\n' | grep -o '"name":"[^"]*"' | head -80
echo

echo "== 4. se l'introspezione e' chiusa, lo chiedo agli errori =="
# Un GraphQL dice se un campo NON esiste ("Cannot query field X") oppure se
# esiste ma gli mancano gli argomenti: due messaggi diversi, e bastano.
for f in fastQuote quote cities authorizeSalesFlow vehicle quotation price; do
  printf '  %-20s ' "$f"
  G "{\"query\":\"{ $f }\"}" | head -c 220; echo
done
echo

echo "== 5. altre porte non murate? =="
for h in covers-api.prima.it mfe.prima.it graphql.prima.it api.intermediari.prima.it; do
  c=$(curl -s -o /dev/null -w '%{http_code}' -m 15 -A "$UA" "https://$h/" 2>/dev/null || echo 000)
  printf '  %-32s http %s\n' "$h" "$c"
done
