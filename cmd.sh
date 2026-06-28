for i in 1 2 3 4 5 6; do
  S=$(curl -s --max-time 10 http://127.0.0.1:4700/status 2>/dev/null)
  echo "  $i: ${S:0:150}"
  echo "$S" | grep -q '"loggato":true' && { echo ">>> AXA VERDE: loggato=true"; break; }
  echo "$S" | grep -q '"login_step":"loggato"' && { echo ">>> step loggato"; break; }
  sleep 6
done
