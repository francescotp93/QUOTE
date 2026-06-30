echo "=== Tunnel HDI esistente: come si collega al vecchio server? ==="
echo "--- hdi-tunnel.service:"
sudo cat /etc/systemd/system/hdi-tunnel.service 2>/dev/null || cat /etc/systemd/system/hdi-tunnel.service 2>/dev/null
echo "--- servizi *tunnel*/*ssh*:"
systemctl list-units --type=service --all 2>/dev/null | grep -iE "tunnel|ssh|socks|prima" | head
echo "--- chiavi SSH disponibili (root/ubuntu):"
ls -la /root/.ssh/ 2>/dev/null | head; ls -la /home/ubuntu/.ssh/ 2>/dev/null | head
echo "--- processi ssh -L/-D attivi:"
ps aux 2>/dev/null | grep -E "ssh .*-[LDR]" | grep -v grep | head
