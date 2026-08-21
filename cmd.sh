#!/usr/bin/env bash
# ESISTE UNA PORTA DI PRIMA CHE DAL NOSTRO SERVER SI APRE?
# Sappiamo che intermediari.prima.it e' murato da Cloudflare (403 anche sul
# favicon). Prima di consigliare un proxy a pagamento vale la pena guardare se
# la compagnia espone gli intermediari da un altro nome o da un'altra API.
# Nessuna credenziale, nessun cookie: si guarda solo CHI risponde.
set -u
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"

echo "== indirizzo con cui usciamo =="
curl -s -m 15 https://api.ipify.org; echo; echo

vedi() {
  u="$1"
  code=$(curl -s -o /tmp/pp.out -w '%{http_code}' -m 20 -A "$UA" "$u" 2>/dev/null || echo 000)
  chi="incerto"
  if grep -qi "attention required\|you have been blocked\|just a moment\|cf-error" /tmp/pp.out 2>/dev/null; then chi="Cloudflare (muro)"
  elif [ "$code" = "000" ]; then chi="non risolve / non risponde"
  elif grep -qi '"errors"\|"data"\|unauthorized\|unauthenticated' /tmp/pp.out 2>/dev/null; then chi="APPLICAZIONE  <<< guarda qui"
  elif [ "$code" -ge 200 ] && [ "$code" -lt 400 ]; then chi="pagina servita  <<< guarda qui"
  fi
  printf '  %-46s http %-3s  %s\n' "$u" "$code" "$chi"
  rm -f /tmp/pp.out
}

echo "== nomi possibili del portale intermediari =="
for h in intermediari.prima.it agenti.prima.it agenzie.prima.it partner.prima.it \
         broker.prima.it business.prima.it pro.prima.it b2b.prima.it \
         intermediari.prima.it.cdn.cloudflare.net; do
  vedi "https://$h/"
done

echo
echo "== e le API? =="
for u in https://api.prima.it/ https://api.prima.it/graphql \
         https://www.prima.it/api/graphql https://www.prima.it/; do
  vedi "$u"
done

echo
echo "== il muro e' su tutto il dominio o solo sul portale? =="
vedi "https://intermediari.prima.it/favicon.ico"
vedi "https://intermediari.prima.it/robots.txt"
