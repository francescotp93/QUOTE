set +e
echo "== attendo rebuild Pages (100s) =="; sleep 100
HTML=$(curl -s --max-time 20 "https://quoto.withusassicurazioni.it/index.html?cb=$(date +%s)")
echo "  bytes: $(echo "$HTML" | wc -c)"
echo "  nav-lead: $(echo "$HTML" | grep -c 'nav-lead')  awRowShell: $(echo "$HTML" | grep -c 'awRowShell')  stampaConfronto: $(echo "$HTML" | grep -c 'stampaConfrontoAuto')  photon: $(echo "$HTML" | grep -c 'photon.komoot')"
echo "---fine---"
