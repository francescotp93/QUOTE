#!/usr/bin/env bash
# QUALI CAMPI vuole InputFastQuote della fastQuote pubblica? Due strade, tutte
# in sola lettura (nessun preventivo creato):
#   1) si manda un oggetto VUOTO: GraphQL elenca i campi obbligatori mancanti;
#   2) si legge la query vera dal frontend di www.prima.it (bundle Next.js),
#      su file, con grep sul file (mai passare l'HTML come argomento).
set -u
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
A="https://api.prima.it/graphql"
G() { curl -s -m 25 -A "$UA" -H 'content-type: application/json' -X POST --data "$1" "$A"; }

echo "== 1. fastQuote(quote:{}) -> campi obbligatori mancanti =="
G '{"query":"mutation { fastQuote(quote: {}) { __typename } }"}' | tr '{}[]' '\n' | grep -i 'message\|Expected\|required\|field' | head -60
echo
echo "== 1b. e con un vehicleType a caso, per far emergere il prossimo campo =="
G '{"query":"mutation { fastQuote(quote: {vehicleType: CAR}) { __typename } }"}' | head -c 900; echo
echo

echo "== 2. la query dal frontend =="
tmpd=$(mktemp -d)
curl -s -m 25 -A "$UA" -o "$tmpd/page.html" https://www.prima.it/assicurazione-auto
grep -oE '/_next/static/[^"]+\.js' "$tmpd/page.html" | sort -u > "$tmpd/js.list"
echo "  bundle trovati: $(wc -l < "$tmpd/js.list")"
i=0
while IFS= read -r rel; do
  i=$((i+1)); [ "$i" -gt 30 ] && break
  curl -s -m 20 -A "$UA" -o "$tmpd/b.js" "https://www.prima.it$rel" 2>/dev/null || continue
  if grep -q 'InputFastQuote\|fastQuote\|installmentPrices' "$tmpd/b.js"; then
    echo "  >>> $rel"
    grep -oE 'InputFastQuote[A-Za-z]*' "$tmpd/b.js" | sort -u | head
    # i nomi dei campi vicino a fastQuote/vehicleType, per capire la forma dell'input
    grep -oE 'vehicleType|vehiclePlateNumber|ownerBirthDate|ownerResidential[A-Za-z]*|phoneNumber|ownerLicense[A-Za-z]*|insuranceType|privacy[A-Za-z]*|installmentConfiguration|guarantees|coveragePrice|authorizeSalesFlow' "$tmpd/b.js" | sort -u | head -40
  fi
done < "$tmpd/js.list"
rm -rf "$tmpd"
echo "(fine)"
