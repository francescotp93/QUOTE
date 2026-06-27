set -u
echo "=== attendo installazione+avvio scraper Groupama (porta 4500) ==="
UP=""
for i in $(seq 1 20); do
  ST=$(curl -s --max-time 8 "http://127.0.0.1:4500/status" 2>/dev/null)
  if [ -n "$ST" ]; then echo "[$i] $ST"; UP="$ST"; 
    # se ha già passato lo step credenziali (attesa_otp o loggato) mi fermo
    echo "$ST" | grep -q "attesa_otp\|loggato\|invio_otp" && break
  else echo "[$i] non ancora su (installazione in corso?)"; fi
  sleep 15
done
echo "=== /loginstate finale ==="
curl -s --max-time 8 "http://127.0.0.1:4500/loginstate" 2>/dev/null; echo
echo "=== service installato? ==="
systemctl is-active groupama-scraper 2>/dev/null || echo "(non ancora installato)"
