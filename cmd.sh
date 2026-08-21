#!/usr/bin/env bash
# DUE DOMANDE IN UN GIRO, tutte e due in sola lettura:
#  A) OVH puo' farlo funzionare? Il muro e' sul SOTTODOMINIO intermediari (403)
#     mentre www.prima.it risponde: forse su IPv6 la policy e' diversa. Si prova.
#  B) come si chiama davvero la fastQuote PUBBLICA (api.prima.it)? La si legge
#     dal frontend di prima.it, senza indovinare e senza creare preventivi.
set -u
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"

echo "===================== A) OVH / instradamento ====================="
echo "-- indirizzi del server --"
ip -brief addr 2>/dev/null | grep -v '^lo' || ip addr 2>/dev/null | grep -E 'inet6?' | grep -v '::1\|127.0.0'
echo
echo "-- usciamo con questo IPv4 --"; curl -s -m 12 https://api.ipify.org; echo
echo "-- abbiamo un IPv6 in uscita? --"; curl -s -m 12 https://api6.ipify.org 2>/dev/null || echo "(niente IPv6 in uscita)"; echo
echo
echo "-- intermediari.prima.it FORZANDO IPv4 --"
curl -s -o /tmp/v4 -w '   http %{http_code}  byte %{size_download}\n' -m 20 -4 -A "$UA" https://intermediari.prima.it/preventivi
grep -qi "cloudflare\|attention required\|you have been blocked" /tmp/v4 && echo "   -> muro Cloudflare"
echo "-- intermediari.prima.it FORZANDO IPv6 --"
curl -s -o /tmp/v6 -w '   http %{http_code}  byte %{size_download}\n' -m 20 -6 -A "$UA" https://intermediari.prima.it/preventivi 2>/dev/null || echo "   (IPv6 non utilizzabile)"
if [ -s /tmp/v6 ]; then
  if grep -qi "cloudflare\|attention required\|you have been blocked" /tmp/v6; then echo "   -> muro Cloudflare anche su IPv6"; else echo "   -> su IPv6 NON e' il muro. primi byte: $(head -c 120 /tmp/v6)"; fi
fi
rm -f /tmp/v4 /tmp/v6
echo
echo "-- i sotto-servizi che usa l'estensione (dal server, IPv4) --"
for u in https://intermediari.prima.it/api/graphql https://intermediari.prima.it/mfe/covers-api/graphql; do
  c=$(curl -s -o /dev/null -w '%{http_code}' -m 15 -A "$UA" -H 'content-type: application/json' -X POST --data '{"query":"{ __typename }"}' "$u")
  printf '   %-52s http %s\n' "$u" "$c"
done

echo
echo "===================== B) schema della fastQuote pubblica ====================="
echo "-- il tipo dell'argomento quote di fastQuote (dall'errore) --"
curl -s -m 25 -A "$UA" -H 'content-type: application/json' -X POST \
  --data '{"query":"mutation { fastQuote { __typename } }"}' https://api.prima.it/graphql | head -c 500; echo
echo
echo "-- cerco la mutation nel frontend di www.prima.it --"
HOME=$(curl -s -m 25 -A "$UA" https://www.prima.it/assicurazione-auto 2>/dev/null)
echo "$HOME" | grep -oE '/_next/static/[^"]+\.js' | sort -u | head -40 > /tmp/js.list
echo "   trovati $(wc -l < /tmp/js.list) bundle; cerco fastQuote e installment"
n=0
while read -r rel; do
  n=$((n+1)); [ $n -gt 25 ] && break
  B=$(curl -s -m 20 -A "$UA" "https://www.prima.it$rel" 2>/dev/null)
  if echo "$B" | grep -q "fastQuote\|installmentPrices\|CreateQuoteInput\|authorizeSalesFlow"; then
    echo "   >>> $rel"
    echo "$B" | grep -oE 'mutation [A-Za-z]*fastQuote[^\`]{0,400}' | head -c 900; echo
    echo "$B" | grep -oE '[A-Za-z]*QuoteInput[A-Za-z]*' | sort -u | head
  fi
done < /tmp/js.list
rm -f /tmp/js.list
echo "(fine)"
