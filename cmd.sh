set +e
echo "== autopull (30s) =="; sleep 30
sudo systemctl restart axa-scraper.service 2>&1; echo "axa rc=$?"
echo "== il SITO LIVE ha le mie modifiche frontend di oggi? =="
HTML=$(curl -s --max-time 20 https://quoto.withusassicurazioni.it/index.html)
echo "  bytes: $(echo "$HTML" | wc -c)"
echo "  Lead nav (nav-lead):        $(echo "$HTML" | grep -c 'nav-lead')"
echo "  lista confronto (awRowShell): $(echo "$HTML" | grep -c 'awRowShell')"
echo "  stampa confronto (stampaConfrontoAuto): $(echo "$HTML" | grep -c 'stampaConfrontoAuto')"
echo "  Tutela vita privata (tlVitaPrivata): $(echo "$HTML" | grep -c 'tlVitaPrivata')"
echo "  Photon geoloc:              $(echo "$HTML" | grep -c 'photon.komoot')"
echo "== commit servito (se presente un marker data) =="
echo "== confronto con vibrant-tesla (atteso: tutti >=1) =="
echo "---fine---"
