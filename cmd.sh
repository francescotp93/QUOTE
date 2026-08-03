#!/usr/bin/env bash
# INTERRUTTORE GENERALE della posta in uscita.
# Rinomino le chiavi dei servizi di spedizione: il valore resta nel file (non lo
# leggo mai), ma il codice non lo trova piu' e non puo' spedire NULLA, da
# nessun componente. Si riattiva rimettendo il nome originale.
E=/opt/withus-backend/server/.env
[ -f "$E" ] || { echo "ERRORE: manca $E"; exit 1; }
cp -n "$E" "$E.prima-di-sospendere-posta" 2>/dev/null

for K in BREVO_API_KEY SMTP_PASS SMTP_HOST RESEND_API_KEY SENDGRID_API_KEY; do
  if grep -q "^$K=" "$E"; then
    sed -i "s/^$K=/${K}_SOSPESA=/" "$E"
    echo "  sospesa: $K"
  fi
done

echo "chiavi di spedizione ancora attive: $(grep -cE '^(BREVO_API_KEY|SMTP_PASS|RESEND_API_KEY|SENDGRID_API_KEY)=' "$E")"
systemctl restart withus-backend
sleep 4
echo "backend: $(systemctl is-active withus-backend)"
echo
echo "### PROVA: il backend riesce ancora a spedire? ###"
journalctl -u withus-backend --since '-2 min' --no-pager 2>/dev/null | grep -iE "brevo|mail|vigilanza" | tail -6
