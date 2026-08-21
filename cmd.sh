#!/usr/bin/env bash
# L'ESPERIMENTO CHE DECIDE. Cloudflare blocca la PAGINA di login dal nostro
# server. Ma l'API GraphQL potrebbe avere regole diverse: se da qui si arriva
# all'applicazione (401/400 dell'app) invece che al muro di Cloudflare, allora
# basta procurarsi i cookie UNA volta e il server puo' lavorare da solo.
# Nessuna credenziale, nessun cookie: si guarda solo CHI risponde.
set -u
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

vedi() {
  nome="$1"; shift
  echo "── $nome"
  code=$(curl -s -o /tmp/p.out -w '%{http_code}' -m 25 "$@" 2>/dev/null || echo 000)
  echo "   http $code  ·  $(wc -c < /tmp/p.out 2>/dev/null || echo 0) byte"
  if grep -qi "attention required\|you have been blocked\|just a moment\|cf-error\|cloudflare" /tmp/p.out 2>/dev/null; then
    echo "   CHI RISPONDE: Cloudflare (muro)"
  elif grep -qi '"errors"\|"data"\|unauthorized\|unauthenticated\|invalid token\|forbidden' /tmp/p.out 2>/dev/null; then
    echo "   CHI RISPONDE: l'applicazione Prima  <<< QUESTO E' QUELLO CHE CERCHIAMO"
    head -c 220 /tmp/p.out; echo
  else
    echo "   CHI RISPONDE: incerto"
    head -c 220 /tmp/p.out; echo
  fi
  rm -f /tmp/p.out
  echo
}

echo "=== 1. la pagina di login (sappiamo gia' che e' murata) ==="
vedi "GET /preventivi" -A "$UA" https://intermediari.prima.it/preventivi

echo "=== 2. l'API GraphQL del portafoglio ==="
vedi "POST /api/graphql" -A "$UA" -H 'content-type: application/json' \
  -X POST --data '{"query":"{ __typename }"}' https://intermediari.prima.it/api/graphql

echo "=== 3. l'API delle garanzie e dei prezzi ==="
vedi "POST /mfe/covers-api/graphql" -A "$UA" -H 'content-type: application/json' \
  -X POST --data '{"query":"{ __typename }"}' https://intermediari.prima.it/mfe/covers-api/graphql

echo "=== 4. un file statico qualunque, per capire se e' tutto il dominio ==="
vedi "GET /favicon.ico" -A "$UA" https://intermediari.prima.it/favicon.ico

echo "=== 5. e il sito pubblico di Prima? ==="
vedi "GET www.prima.it" -A "$UA" https://www.prima.it/
