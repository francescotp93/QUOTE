mkdir -p /root/.ssh && chmod 700 /root/.ssh
[ -f /root/.ssh/hdi_tunnel ] || ssh-keygen -t ed25519 -f /root/.ssh/hdi_tunnel -N "" -C "hdi-tunnel-newserver" >/dev/null 2>&1
echo "=== CHIAVE PUBBLICA DA AGGIUNGERE AL VECCHIO SERVER ==="
cat /root/.ssh/hdi_tunnel.pub
echo "=== verifica: il vecchio HDI risponde dal vecchio server? (test rapido locale impossibile da qui) ==="
echo "autossh disponibile? $(command -v autossh || echo no)"
