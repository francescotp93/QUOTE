#!/usr/bin/env bash
# Autorizza la chiave PUBBLICA SSH di Francesco (il proprietario del VPS) cosi'
# puo' entrare col suo Mac senza password, e da li' incollare il token GitHub
# senza farlo passare da chat ne' da git. Una chiave pubblica non e' un segreto.
set -eu
K='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF/MStH83Qa3f8iuLltJyvdcEXPtipu2XVY5cbvBLt+J francesco.oddo'
mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
chown -R root:root /root/.ssh
if grep -qF "$K" /root/.ssh/authorized_keys; then echo "chiave gia' presente"; else echo "$K" >> /root/.ssh/authorized_keys && echo "chiave aggiunta"; fi
echo "righe in authorized_keys: $(wc -l < /root/.ssh/authorized_keys)"
echo "-- ssh accetta il login di root con chiave? --"
grep -rhiE '^\s*PermitRootLogin' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | head || echo "  (nessuna riga PermitRootLogin: vale il default 'prohibit-password' = chiave OK)"
echo "-- ssh attivo? --"; systemctl is-active ssh 2>/dev/null || systemctl is-active sshd 2>/dev/null || echo sconosciuto
echo "(fine)"
