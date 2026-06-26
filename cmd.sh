B=http://127.0.0.1:4100
echo "status: $(curl -s -m 8 $B/status)"
echo "=== /flowmap raw ==="
curl -s -m 180 "$B/flowmap?targa=FA85248&nascita=19/05/1995" > /tmp/fm.json
echo "bytes: $(wc -c < /tmp/fm.json)"
head -c 2500 /tmp/fm.json
