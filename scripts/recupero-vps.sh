#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  RECUPERO CODICE VPS → repository QUOTE
#
#  Da eseguire SUL VPS (dove girano withus-backend e gli scraper motor).
#  Copia il codice vivo di /opt/withus-backend nel repo GitHub francescotp93/QUOTE,
#  nella cartella vps/ di un branch dedicato, ESCLUDENDO ogni segreto
#  (credenziali, sessioni browser, .env). Non tocca in alcun modo i file
#  originali né i servizi in esecuzione: fa solo una copia.
#
#  Uso:
#     GITHUB_TOKEN=ghp_xxx bash recupero-vps.sh
#  (in alternativa, se sul VPS c'è `gh` già autenticato, il token non serve)
#
#  Variabili opzionali:
#     SRC=/opt/withus-backend     cartella sorgente da recuperare
#     BRANCH=vps-backend-import   branch di destinazione
#     NONINTERACTIVE=1            salta la conferma finale prima del push
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SRC="${SRC:-/opt/withus-backend}"
REPO="francescotp93/QUOTE"
BRANCH="${BRANCH:-vps-backend-import}"
WORK="$(mktemp -d /tmp/recupero-vps.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

echo "══ Recupero codice VPS → $REPO ($BRANCH) ══"
[ -d "$SRC" ] || { echo "ERRORE: $SRC non esiste. Imposta SRC=/percorso/giusto"; exit 1; }

# ── 1. Copia del codice SENZA segreti ──────────────────────────────────────────
#  Esclusi: credenziali cifrate, profili/sessioni browser, .env, log, node_modules,
#  screenshot e dump. Le dipendenze si reinstallano da package.json.
echo "── Copio $SRC (senza segreti)…"
mkdir -p "$WORK/vps/backend"
(cd "$SRC" && tar cf - \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.env' --exclude='.env.*' --exclude='*.env' \
  --exclude='fonti.store.json' \
  --exclude='userdata' --exclude='userdata.*' \
  --exclude='auth.json' --exclude='storageState*.json' --exclude='cookies*' --exclude='Cookies*' \
  --exclude='shots' --exclude='*.png' --exclude='*.jpg' \
  --exclude='*.log' --exclude='logs' \
  .) | tar xf - -C "$WORK/vps/backend"

# ── 2. Nomi (NON valori) delle variabili d'ambiente dei servizi ────────────────
echo "── Estraggo i NOMI delle variabili d'ambiente dei servizi…"
mkdir -p "$WORK/vps/systemd"
{
  echo "# Variabili d'ambiente richieste dai servizi (SOLO I NOMI, i valori restano sul VPS)"
  for unit in $(systemctl list-units --type=service --all --no-legend 2>/dev/null \
                | awk '{print $1}' | grep -Ei 'withus|scraper|moto|allianz|italiana|axa|groupama|hdi' || true); do
    echo; echo "## $unit"
    systemctl show -p Environment --value "$unit" 2>/dev/null \
      | tr ' ' '\n' | sed 's/=.*/=***/' | grep -v '^$' || echo "(nessuna)"
  done
} > "$WORK/vps/systemd/ENV-VARS.md"

# ── 3. Unit systemd dei servizi (i file .service non contengono segreti se le
#      Environment= sono su file esterni; se contengono valori, vengono mascherati) ─
echo "── Copio le unit systemd…"
for f in /etc/systemd/system/*{withus,scraper,moto,allianz,italiana,axa,groupama,hdi}*.service; do
  [ -f "$f" ] || continue
  sed -E 's/^(Environment=[A-Z_]+)=.*/\1=***RIMOSSO***/' "$f" > "$WORK/vps/systemd/$(basename "$f")"
done 2>/dev/null || true

# ── 4. Config nginx/caddy per api.withusassicurazioni.it (se presente) ─────────
for f in /etc/nginx/sites-available/* /etc/nginx/conf.d/*.conf /etc/caddy/Caddyfile; do
  [ -f "$f" ] || continue
  if grep -q "withusassicurazioni" "$f" 2>/dev/null; then
    mkdir -p "$WORK/vps/proxy"; cp "$f" "$WORK/vps/proxy/$(basename "$f")"
  fi
done 2>/dev/null || true

# ── 5. Controllo di sicurezza: possibili segreti sfuggiti ──────────────────────
echo "── Controllo anti-segreti…"
SOSPETTI=$(grep -rElsi '(password|passwd|secret|api[_-]?key|token)[\"'"'"' ]*[:=][\"'"'"' ]*[A-Za-z0-9]{8,}' \
  "$WORK/vps" --include='*.js' --include='*.mjs' --include='*.json' --include='*.sh' 2>/dev/null | head -20 || true)
if [ -n "$SOSPETTI" ]; then
  echo "⚠️  ATTENZIONE: questi file contengono stringhe che SEMBRANO segreti in chiaro:"
  echo "$SOSPETTI" | sed 's/^/     /'
  echo "   Verificali prima di confermare il push (o rimuovili e rilancia)."
fi

# ── 6. Clone del repo e push sul branch dedicato ───────────────────────────────
echo "── Clono $REPO…"
cd "$WORK"
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh repo clone "$REPO" repo -- --depth 1
else
  [ -n "${GITHUB_TOKEN:-}" ] || { echo "ERRORE: serve GITHUB_TOKEN=ghp_xxx (o gh autenticato)"; exit 1; }
  git clone --depth 1 "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git" repo
fi
cd repo
git checkout -B "$BRANCH"
rm -rf vps && mkdir -p vps && cp -a "$WORK/vps/." vps/
cat > vps/README.md <<'EOF'
# Codice di produzione del VPS (importato)

Contenuto importato da /opt/withus-backend con scripts/recupero-vps.sh.
- `backend/`  — withus-backend live (api.withusassicurazioni.it) + scraper motor
- `systemd/`  — unit dei servizi e NOMI delle variabili d'ambiente (valori esclusi)
- `proxy/`    — eventuale config nginx/caddy

I SEGRETI NON SONO QUI: .env, fonti.store.json, sessioni browser (userdata/)
restano solo sul VPS. Data import: vedere il commit.
EOF
git add -A
git -c user.name="Recupero VPS" -c user.email="vps@withusassicurazioni.it" \
    commit -m "VPS: import codice di produzione (backend + scraper motor, senza segreti)"

echo
echo "══ RIEPILOGO ══"
git show --stat --oneline HEAD | head -40
echo
if [ -z "${NONINTERACTIVE:-}" ]; then
  read -r -p "Confermi il push su $REPO ($BRANCH)? [s/N] " OKPUSH
  case "$OKPUSH" in s|S|si|SI|sì) ;; *) echo "Annullato: nessun push eseguito."; exit 0;; esac
fi
git push -u origin "$BRANCH"
echo "✓ Fatto: il codice del VPS è sul branch '$BRANCH' di $REPO."
echo "  Ora Leo può leggerlo, sistemare login persistenti AXA/Groupama, HDI e Allianz."
