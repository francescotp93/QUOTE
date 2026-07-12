STORE=/opt/withus-backend/server/fonti.store.json
echo "== fonti.store.json esiste? =="
ls -la "$STORE" 2>/dev/null || echo "(assente)"
echo "== chiavi di primo livello nello store (niente valori/segreti) =="
node -e "try{const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(Object.keys(d).join(', '));const m=d.__caselle_mail||{};console.log('caselle mail nel pannello:', Object.keys(m).join(', ')||'(nessuna)');}catch(e){console.log('errore lettura:',e.message)}" "$STORE" 2>/dev/null
echo "== eventuali indirizzi email tra le chiavi/sub-chiavi (mascherati dopo @) =="
grep -oiE '[a-z0-9._-]+@[a-z0-9.-]+' "$STORE" 2>/dev/null | sort -u | sed -E 's/@.*/@.../' | head
echo "== altri file env/backup con MAIL_USER (oltre al .env principale) =="
grep -rIl 'MAIL_USER' /opt/withus-backend 2>/dev/null | grep -v node_modules | head
