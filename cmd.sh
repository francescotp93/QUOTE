#!/usr/bin/env bash
# api.prima.it RISPONDE DAL NOSTRO SERVER (200), mentre intermediari.prima.it e'
# murato. Se quella porta parla lo stesso linguaggio del portale — fastQuote,
# authorizeSalesFlow, la covers-api — allora Prima si puo' quotare dal server
# senza estensione e senza proxy.
# Solo INTROSPEZIONE dello schema: nessuna credenziale, nessun preventivo creato.
set -u
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
G() { curl -s -m 25 -A "$UA" -H 'content-type: application/json' -X POST --data "$2" "$1"; }

echo "== 1. che cosa c'e' dietro api.prima.it =="
curl -s -o /tmp/a.out -w '  GET /  http %{http_code}  ·  %{size_download} byte  ·  %{content_type}\n' -m 20 -A "$UA" https://api.prima.it/
head -c 400 /tmp/a.out; echo; echo

echo "== 2. e' un GraphQL? =="
echo "  -- /graphql  { __typename } --"
G https://api.prima.it/graphql '{"query":"{ __typename }"}' | head -c 400; echo
echo "  -- / (radice)  { __typename } --"
G https://api.prima.it/ '{"query":"{ __typename }"}' | head -c 400; echo
echo

echo "== 3. conosce le operazioni del portale intermediari? =="
for campo in fastQuote authorizeSalesFlow quote cities; do
  echo "  -- $campo --"
  G https://api.prima.it/graphql "{\"query\":\"{ __type(name: \\\"Query\\\") { fields { name } } }\"}" \
    | tr ',' '\n' | grep -i "\"$campo\"" | head -3
  G https://api.prima.it/graphql "{\"query\":\"{ __type(name: \\\"Mutation\\\") { fields { name } } }\"}" \
    | tr ',' '\n' | grep -i "\"$campo\"" | head -3
done
echo

echo "== 4. l'elenco completo delle operazioni (primi 60) =="
G https://api.prima.it/graphql '{"query":"{ __schema { queryType { fields { name } } mutationType { fields { name } } } }"}' \
  | tr '{},' '\n' | grep '"name"' | head -60
