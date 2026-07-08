#!/usr/bin/env bash
# ── Installazione withus-backend su Ubuntu 24.04 (Node 20 + Caddy + systemd) ──────
# Uso (come root):  curl -fsSL .../setup.sh | bash
set -euo pipefail

APP_DIR=/opt/withus-backend
REPO=https://github.com/francescotp93/QUOTE.git
DOMAIN=api.withusassicurazioni.it   # cambia se usi un altro dominio

echo "==> Aggiorno il sistema"
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git ca-certificates

echo "==> Installo Node 20"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> Installo Caddy (HTTPS automatico)"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "==> Utente di servizio"
id withus >/dev/null 2>&1 || useradd -r -m -d "$APP_DIR" -s /usr/sbin/nologin withus

echo "==> Scarico/aggiorno il codice"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull
else
  rm -rf "$APP_DIR"
  git clone --depth 1 "$REPO" "$APP_DIR"
fi

echo "==> Installo le dipendenze del backend"
cd "$APP_DIR/server"
npm install --omit=dev

echo "==> File .env (se manca, lo creo dall'esempio)"
[ -f "$APP_DIR/server/.env" ] || cp "$APP_DIR/server/deploy/.env.example" "$APP_DIR/server/.env"

echo "==> Permessi"
chown -R withus:withus "$APP_DIR"

echo "==> Servizio systemd"
cp "$APP_DIR/server/deploy/withus-backend.service" /etc/systemd/system/withus-backend.service
systemctl daemon-reload
systemctl enable withus-backend
systemctl restart withus-backend

echo "==> Caddy (reverse proxy + HTTPS)"
cp "$APP_DIR/server/deploy/Caddyfile" /etc/caddy/Caddyfile
sed -i "s/api.withusassicurazioni.it/$DOMAIN/g" /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

echo ""
echo "✅ Fatto. Ora:"
echo "   1) Modifica i segreti:  nano $APP_DIR/server/.env  &&  systemctl restart withus-backend"
echo "   2) Verifica:            https://$DOMAIN/pay/config"
