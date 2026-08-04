#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# RIACCENSIONE: posta in uscita + vigilanza fonti.
#
# La vigilanza si riaccende SOLO ADESSO, dopo che il guardiano ha imparato a
# dire una cosa sola una volta sola (rilascio del 04/08/2026). Prima ripeteva
# lo stesso allarme ogni cinque minuti: era il motivo per cui era stata spenta.
# ─────────────────────────────────────────────────────────────────────────────
E=/opt/withus-backend/server/.env
[ -f "$E" ] || { echo "ERRORE: manca $E"; exit 1; }
cp "$E" "$E.prima-di-riaccendere-$(date +%Y%m%d-%H%M%S)"

echo "### 1. La correzione del guardiano e' arrivata? ###"
cd /opt/withus-backend
echo "ramo: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
grep -c "dettoSalute" server/fontiWatchdog.js | sed 's/^/  «dettoSalute» presente: /'
grep -c "FONTI_VIGILANZA_STORE" server/fontiWatchdog.js | sed 's/^/  memoria su disco:      /'

echo
echo "### 2. Riaccendo la posta ###"
for K in BREVO_API_KEY SMTP_PASS SMTP_HOST RESEND_API_KEY SENDGRID_API_KEY; do
  if grep -q "^${K}_SOSPESA=" "$E"; then
    sed -i "s/^${K}_SOSPESA=/${K}=/" "$E"
    echo "  riaccesa: $K"
  fi
done
echo "  chiavi di spedizione attive: $(grep -cE '^(BREVO_API_KEY|SMTP_PASS|RESEND_API_KEY|SENDGRID_API_KEY)=' "$E")"

echo
echo "### 3. Riaccendo la vigilanza ###"
# FONTI_VIGILANZA=0 la teneva spenta. La tolgo: il valore predefinito e' accesa.
if grep -q "^FONTI_VIGILANZA=0" "$E"; then
  sed -i "/^FONTI_VIGILANZA=0$/d" "$E"
  echo "  tolto FONTI_VIGILANZA=0"
else
  echo "  FONTI_VIGILANZA=0 non c'era (gia' accesa)"
fi
# Due conferme prima di annunciare: e' il valore predefinito, lo scrivo esplicito
# cosi' si vede nel file che cosa governa il silenzio.
grep -q "^FONTI_VIGILANZA_CONFERME=" "$E" || echo "FONTI_VIGILANZA_CONFERME=2" >> "$E"

echo
echo "### 4. Riavvio ###"
systemctl restart withus-backend
sleep 6
echo "backend: $(systemctl is-active withus-backend)"

echo
echo "### 5. Che cosa dice il guardiano ###"
journalctl -u withus-backend --since '-2 min' --no-pager 2>/dev/null | grep -i "vigilanza" | tail -8
echo
echo "### 6. Memoria della vigilanza su disco ###"
ls -la /opt/withus-backend/server/fontiWatchdog.store.json 2>/dev/null || echo "  (non ancora creata: nasce al primo giro, fra ~30 secondi)"
