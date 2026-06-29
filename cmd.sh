curl -s --max-time 20 http://127.0.0.1:4400/shot >/dev/null 2>&1
F=/opt/withus-backend/scraper/hdi/shots/current.png
SZ=$(stat -c%s "$F" 2>/dev/null || echo 0)
echo "png_bytes:$SZ url:$(curl -s --max-time 10 http://127.0.0.1:4400/status|python3 -c 'import sys,json;print(json.load(sys.stdin).get("url","")[:80])' 2>/dev/null)"
if [ "$SZ" -gt 100 ] && [ "$SZ" -lt 70000 ]; then echo "B64:"; base64 -w0 "$F"; else
  # troppo grande: riconverto in jpeg piccolo se c'è imagemagick, altrimenti riporto solo la dimensione
  command -v convert >/dev/null && convert "$F" -resize 1000x -quality 35 /tmp/hdi.jpg 2>/dev/null && J=$(stat -c%s /tmp/hdi.jpg) && [ "$J" -lt 70000 ] && { echo "JPG_B64:"; base64 -w0 /tmp/hdi.jpg; } || echo "NO_IMG (png=$SZ)"
fi
