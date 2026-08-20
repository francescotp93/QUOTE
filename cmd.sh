#!/usr/bin/env bash
# Accesso guidato VERO su due compagnie, come lo farebbe il Pannello Fonti.
# Autorizzato da Francesco il 20/08/2026. Nessun segreto viene stampato: solo
# il passo e il messaggio che il servizio scrive per l'operatore.
set -u

passo() {
  printf '%s' "$1" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception:
    print('  (risposta non leggibile)'); raise SystemExit
print('  passo=%s  running=%s  loggato=%s' % (d.get('step'), d.get('running'), d.get('loggato')))
m=(d.get('msg') or d.get('login_msg') or '').strip()
if m: print('  dice: ' + m[:200])
" 2>/dev/null || echo "  (risposta non leggibile)"
}

prova() {
  nome="$1"; porta="$2"
  echo "════════ $nome (porta $porta) ════════"
  echo "-- prima di toccare niente --"
  passo "$(curl -s -m 8 "http://127.0.0.1:$porta/loginstate" 2>/dev/null)"

  echo "-- premo Accedi --"
  avvio=$(curl -s -m 30 "http://127.0.0.1:$porta/accedi" 2>/dev/null)
  if [ -z "$avvio" ]; then
    echo "  (nessuna risposta entro 30s: il login e' partito ma e' lento, guardo lo stato)"
  else
    passo "$avvio"
  fi

  echo "-- come va, di 10 secondi in 10 secondi --"
  for i in 1 2 3 4 5 6 7 8; do
    sleep 10
    st=$(curl -s -m 8 "http://127.0.0.1:$porta/loginstate" 2>/dev/null)
    printf '  [%02ds] ' $((i*10))
    printf '%s' "$st" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception:
    print('(non leggibile)'); raise SystemExit
m=(d.get('msg') or '').strip()
print('%s%s' % (d.get('step'), ('  ·  ' + m[:120]) if m else ''))
" 2>/dev/null || echo "(non leggibile)"
    # finito? esco dall'attesa
    case "$st" in
      *'"loggato"'*|*'attesa_otp'*|*'non_loggato'*|*'senza_credenziali'*|*'"errore"'*|*'"error"'*) break ;;
    esac
  done

  echo "-- come sta adesso --"
  passo "$(curl -s -m 8 "http://127.0.0.1:$porta/loginstate" 2>/dev/null)"
  echo "-- e cosa dice di se' --"
  curl -s -m 8 "http://127.0.0.1:$porta/status" 2>/dev/null | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception: raise SystemExit
for k in ('loggato','ha_credenziali','ha_totp','url','freno'):
    if k in d: print('  %s: %s' % (k, str(d[k])[:120]))
" 2>/dev/null
  echo
}

prova groupama 4500
prova prima 4600
