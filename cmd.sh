echo "vecchio host: $(hostname)"
echo "IPv4 pubblico: $(curl -s --max-time 8 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
