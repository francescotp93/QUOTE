echo "=== vado alla schermata Fast auto di ISA ==="
curl -s --max-time 50 "http://127.0.0.1:4500/explore?goto=https://accedi.groupama.it/pda/PR_ISA/%23/trattativa/quotazione/nuova" 2>&1 >/dev/null
sleep 3
echo "=== apro il menu Tipo veicolo (clicco 'Autovettura') e dump opzioni ==="
curl -s --max-time 40 "http://127.0.0.1:4500/explore?click=Autovettura&all=1" 2>&1 > /tmp/tv.json
grep "\"text\"" /tmp/tv.json | head -1 | cut -c1-600
echo "--- voci visibili (cerco moto/autocarro/ciclo/furgone) ---"
grep -iE "\"t\":|motoci|autocarr|ciclo|furgon|veicoli commerciali|rimorchio" /tmp/tv.json | head -30
