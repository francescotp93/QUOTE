B=http://127.0.0.1:4100
curl -s -m 10 "$B/sniff/start"; echo
echo "stato: $(curl -s -m 8 $B/sniff)"
echo "VNC 24H: 127.0.0.1:5900 (display :99) — fai un preventivo COMPLETO fino al prezzo"
