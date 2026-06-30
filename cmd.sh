echo "=== ALLIANZ /lookup RAW + /status ==="
echo "--- /status:"; curl -s --max-time 10 "http://127.0.0.1:4200/status" 2>&1 | head -c 250; echo
echo "--- /lookup raw (1200c):"
curl -s --max-time 70 "http://127.0.0.1:4200/lookup?targa=GY263BY" 2>&1 | head -c 1200; echo
