set +e
echo "== il sito LIVE ha già la guardia + TCM? (quoto.withusassicurazioni.it) =="
H=$(curl -s --max-time 25 "https://quoto.withusassicurazioni.it/index.html?nocache=$(date +%s)")
echo "  CASA_QUOTING presente: $(echo "$H" | grep -c CASA_QUOTING)"
echo "  TCM_LOADING_HTML presente: $(echo "$H" | grep -c TCM_LOADING_HTML)"
echo "  premio-tcm presente: $(echo "$H" | grep -c 'premio-tcm')"
echo "  timeout150/guardia commit marker (frazcode 000006): $(echo "$H" | grep -c '000006')"
echo "  Last-Modified/ETag header:"; curl -sI --max-time 20 "https://quoto.withusassicurazioni.it/" | grep -iE "last-modified|etag|cache-control|age" | head -5
echo "---fine---"
