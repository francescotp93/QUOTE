curl -s --max-time 50 "http://127.0.0.1:4500/explore?goto=https://accedi.groupama.it/pda/PR_ISA" 2>&1 >/dev/null
sleep 2
echo "=== A) click Trattativa (raw, primi 400 char) ==="
curl -s --max-time 40 "http://127.0.0.1:4500/explore?click=Trattativa" 2>&1 | head -c 400; echo
sleep 1
echo "=== B) click Nuovo preventivo auto (raw, primi 700 char) ==="
curl -s --max-time 45 "http://127.0.0.1:4500/explore?click=Nuovo%20preventivo%20auto&all=1" 2>&1 | head -c 700; echo
