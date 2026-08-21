#!/usr/bin/env bash
# SOLO LETTURA: chi gestisce il DNS di withusassicurazioni.it (per sapere dove
# Francesco deve cambiare i record) e dove puntano oggi iam./quoto.
set -u
DOH() { curl -s -m 15 -H 'accept: application/dns-json' "https://dns.google/resolve?name=$1&type=$2" 2>/dev/null; }

echo "== nameserver (chi gestisce il DNS) =="
DOH withusassicurazioni.it NS | tr ',' '\n' | grep -i '"data"' | sed 's/.*"data":"/  -> /; s/"//g'
echo
echo "== iam. oggi punta a =="
DOH iam.withusassicurazioni.it CNAME | tr ',' '\n' | grep -i '"data"' | sed 's/.*"data":"/  CNAME -> /; s/"//g'
DOH iam.withusassicurazioni.it A     | tr ',' '\n' | grep -i '"data"' | sed 's/.*"data":"/  A -> /; s/"//g'
DOH iam.withusassicurazioni.it AAAA  | tr ',' '\n' | grep -i '"data"' | sed 's/.*"data":"/  AAAA -> /; s/"//g'
echo
echo "== quoto. oggi punta a =="
DOH quoto.withusassicurazioni.it CNAME | tr ',' '\n' | grep -i '"data"' | sed 's/.*"data":"/  CNAME -> /; s/"//g'
DOH quoto.withusassicurazioni.it A     | tr ',' '\n' | grep -i '"data"' | sed 's/.*"data":"/  A -> /; s/"//g'
echo
echo "== registrar (whois, se c'e') =="
command -v whois >/dev/null && whois withusassicurazioni.it 2>/dev/null | grep -iE "registrar|reseller|name server" | head -8 || echo "  (whois non installato)"
echo "(fine)"
