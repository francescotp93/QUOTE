#!/usr/bin/env bash
# Ricifratura fonti — QUESTA VOLTA SCRIVE. Con copia di sicurezza e controllo dopo.
set -u
cd /opt/withus-backend || exit 1

echo "== aspetto le sicurezze nuove (max 150s) =="
for i in $(seq 1 30); do
  grep -q "LASCIATI DOVE SONO" server/fontiRicifra.mjs 2>/dev/null && { echo "arrivate dopo ~$((i*5))s"; break; }
  sleep 5
done
grep -q "LASCIATI DOVE SONO" server/fontiRicifra.mjs || { echo "non ancora arrivate, non procedo"; exit 0; }
echo "commit: $(git log -1 --pretty='%h %s')"

echo
echo "== 1) le prove, qui sulla macchina =="
node server/fontiRicifra.test.mjs 2>&1 | tail -26
echo "esito prove: ${PIPESTATUS[0]}"
if ! node server/fontiRicifra.test.mjs >/dev/null 2>&1; then
  echo "PROVE ROSSE: non tocco l'archivio."
  exit 1
fi

echo
echo "== 2) impronta dell'archivio PRIMA =="
sha256sum server/fonti.store.json

echo
echo "== 3) ricifratura =="
node server/fontiRicifra.mjs --scrivi
echo "esito: $?"

echo
echo "== 4) impronta DOPO + copie di sicurezza =="
sha256sum server/fonti.store.json
ls -l server/fonti.store.json.prima-di-ricifrare-* 2>/dev/null | awk '{print "  copia:", $NF, $5, "byte"}'

echo
echo "== 5) riavvio il backend e gli scraper che devono rileggere =="
systemctl restart withus-backend && echo "  backend riavviato"
for s in allianz prima quotiamo; do
  systemctl restart "${s}-scraper" 2>/dev/null && echo "  ${s}-scraper riavviato"
done
sleep 25

echo
echo "== 6) cosa dicono adesso =="
for p in 4200 4600 5000; do
  echo "  porta $p: $(curl -s -m 10 "http://127.0.0.1:$p/status" 2>/dev/null | head -c 220)"
done
