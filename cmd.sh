echo "=== /loginstate ora (a riposo, dopo l'/accedi precedente) ==="
curl -s --max-time 8 http://127.0.0.1:4200/loginstate 2>/dev/null; echo
echo "=== nuovo /accedi e seguo lo stato per ~25s ==="
curl -s --max-time 60 -X POST http://127.0.0.1:4200/accedi >/dev/null 2>&1
for i in 1 2 3 4 5 6 7 8; do sleep 3; echo "[$((i*3))s] $(curl -s --max-time 6 http://127.0.0.1:4200/loginstate 2>/dev/null)"; done
