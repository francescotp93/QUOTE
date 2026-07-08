#!/usr/bin/env bash
# ============================================================================
#  WithUs — BOOTSTRAP nuovo server (Ubuntu 24.04 / 26.04). Esegui come ROOT.
#  Installa: Node 22, Caddy, Xvfb/fluxbox/x11vnc, browser Playwright, backend,
#  TUTTI gli scraper, l'autopull e il canale di comando (cmd-runner).
#
#  Uso (come root, col TUO token GitHub):
#     export GH_TOKEN=ghp_xxxxxxxx        # lo trovi sul vecchio server: cat /root/.withus-gh-token
#     bash bootstrap.sh
#
#  Dopo: copia i 2 segreti dal vecchio server (.env + fonti.store.json) via scp,
#  poi riavvia. Le istruzioni esatte le stampa lo script alla fine.
# ============================================================================
set -euo pipefail

: "${GH_TOKEN:?Devi impostare GH_TOKEN col token GitHub. Sul vecchio server: cat /root/.withus-gh-token}"
APP=/opt/withus-backend
BR=claude/vibrant-tesla-o0glfd
SECRET=withus-fonti-vps-v1          # chiave che decifra le credenziali del Pannello Fonti (verificata)
DOMAIN=api.withusassicurazioni.it
SCRAPERS="italiana hdi groupama moto axa"   # attivi (prima/allianz disabilitati)

echo "==> [1/9] Pacchetti di sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ca-certificates gnupg util-linux \
  xvfb fluxbox x11vnc fonts-liberation fonts-noto-color-emoji

echo "==> [2/9] Node.js 22"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> [3/9] Caddy (reverse proxy + HTTPS automatico)"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "==> [4/9] Utente 'withus' + token GitHub + credenziali git"
id withus >/dev/null 2>&1 || useradd -m -s /bin/bash withus
printf '%s' "$GH_TOKEN" > /root/.withus-gh-token; chmod 600 /root/.withus-gh-token
git config --system credential.helper store || git config --global credential.helper store
printf 'https://x-access-token:%s@github.com\n' "$GH_TOKEN" > /root/.git-credentials; chmod 600 /root/.git-credentials
git config --global --add safe.directory "$APP" || true
git config --system --add safe.directory "$APP" || true

echo "==> [5/9] Clono il repo (branch $BR)"
if [ ! -d "$APP/.git" ]; then
  git clone "https://x-access-token:${GH_TOKEN}@github.com/francescotp93/QUOTE.git" "$APP"
fi
git -C "$APP" remote set-url origin https://github.com/francescotp93/QUOTE.git
git -C "$APP" fetch origin "$BR"
git -C "$APP" checkout -B "$BR" "origin/$BR"

echo "==> [6/9] Dipendenze backend + scraper + browser (può richiedere qualche minuto)"
( cd "$APP/server" && npm install --no-audit --no-fund )
for d in "$APP"/scraper/*/; do c=$(basename "$d"); case "$c" in _*) continue;; esac; [ -f "$d/package.json" ] && ( cd "$d" && npm install --no-audit --no-fund ) || true; done
( cd "$APP/scraper/axa" && npx --yes playwright install chromium )
npx --yes playwright install-deps chromium 2>/dev/null || true

echo "==> [7/9] FONTI_SECRET (per backend e scraper) + permessi"
touch "$APP/server/.env"
grep -q '^FONTI_SECRET=' "$APP/server/.env" || echo "FONTI_SECRET=$SECRET" >> "$APP/server/.env"
# Forzo la stessa chiave anche sugli scraper (girano da root, NON leggono server/.env) via drop-in systemd,
# così decifrano le credenziali a prescindere dall'hostname del nuovo server.
for c in $SCRAPERS prima allianz; do
  mkdir -p "/etc/systemd/system/${c}-scraper.service.d"
  printf '[Service]\nEnvironment=FONTI_SECRET=%s\n' "$SECRET" > "/etc/systemd/system/${c}-scraper.service.d/secret.conf"
done
chmod +x "$APP"/scraper/*/start-service.sh 2>/dev/null || true
chmod +x "$APP"/deploy/*.sh 2>/dev/null || true
chown -R withus:withus "$APP"

echo "==> [8/9] Caddy ($DOMAIN -> localhost:3000)"
if [ -f "$APP/server/deploy/Caddyfile" ]; then cp "$APP/server/deploy/Caddyfile" /etc/caddy/Caddyfile; else printf '%s {\n    reverse_proxy localhost:3000\n}\n' "$DOMAIN" > /etc/caddy/Caddyfile; fi
sed -i "s/api.withusassicurazioni.it/$DOMAIN/g" /etc/caddy/Caddyfile
systemctl restart caddy || true

echo "==> [9/9] Servizi systemd (backend, autopull, canale comandi, scraper)"
cp "$APP/server/deploy/withus-backend.service" /etc/systemd/system/
cp "$APP/deploy/withus-autopull.service" "$APP/deploy/withus-autopull.timer" /etc/systemd/system/
cp "$APP/deploy/cmd-runner.service" "$APP/deploy/cmd-runner.timer" /etc/systemd/system/
for svc in "$APP"/scraper/*/deploy/*.service; do case "$svc" in *_template*) continue;; esac; cp "$svc" /etc/systemd/system/; done
systemctl daemon-reload
systemctl enable --now withus-backend || true
systemctl enable --now withus-autopull.timer cmd-runner.timer || true
for c in $SCRAPERS; do systemctl enable --now "${c}-scraper" 2>/dev/null || true; done

echo ""
echo "============================================================"
echo "✅ BOOTSTRAP COMPLETATO."
echo ""
echo "MANCANO SOLO I 2 SEGRETI, da copiare dal VECCHIO server (server-a-server, sicuri):"
echo "   scp root@VECCHIO_IP:/opt/withus-backend/server/.env $APP/server/.env"
echo "   scp root@VECCHIO_IP:/opt/withus-backend/server/fonti.store.json $APP/server/fonti.store.json"
echo "   chown withus:withus $APP/server/.env $APP/server/fonti.store.json"
echo "   systemctl restart withus-backend italiana-scraper hdi-scraper groupama-scraper moto-scraper axa-scraper"
echo ""
echo "Poi avvisa Claude: da qui in poi gestisce tutto lui dal canale comandi."
echo "============================================================"
