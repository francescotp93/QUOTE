cd /opt/withus-backend
echo "backend rotta AXA presente? $(grep -c preventivoAxa server/moto.js)  withus-backend: $(systemctl is-active withus-backend)"
echo "=== /premio SENZA data_acquisto (path di default usato dal frontend) ==="
curl -s --max-time 175 "http://127.0.0.1:4700/premio?targa=GY263BY&cf=DDOFNC93L17D423L&cognome=ODDO&nome=FRANCESCO&data_nascita=17%2F07%2F1993" 2>/dev/null
echo
