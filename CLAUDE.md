# QUOTO — Note per Claude Code

Quotatore multi-compagnia di Withus Assicurazioni (RC auto/moto, casa,
salute, infortuni, ...). App monolite `index.html` (Vanilla JS + HTML/CSS),
backend Node su VPS (`server/`, `scraper/`), Supabase (dati + Edge
Functions). Deploy frontend: GitHub Pages da `main`
(quoto.withusassicurazioni.it).

## ⭐ Regole fisse di Francesco (valgono SEMPRE, per ogni agente/sessione)

1. **Backup PRIMA di ogni modifica.** Non toccare un file senza prima
   mettere al sicuro lo stato attuale: commit-checkpoint su git **oppure**
   una copia `.bak` del file. Deve essere sempre possibile tornare
   indietro in un attimo. Vale anche per le sessioni notturne autonome.
2. **Chiedi prima di costruire.** Per una modifica o un nuovo programma,
   PRIMA fai a Francesco le domande necessarie (dati mancanti, casi
   limite, comportamento atteso) e arriva a un risultato *certo*. Se manca
   un dato ufficiale (una tariffa, una soglia, una % reale) NON inventarlo:
   chiedilo. Meglio una domanda in più che una modifica sbagliata.

## Collaudo

Ogni modifica al frontend va verificata con la suite dello scratchpad
(`static-server.js` + `ui-test.mjs`): deve restare **49/49** e zero errori
JS prima di considerarla pronta.

## Sicurezza

- Mai push su `main` senza collaudo verde (il deploy parte da `main`).
- Mai toccare login, pagamenti o segreti senza richiesta esplicita.
- Niente credenziali/chiavi in chiaro: solo nei secrets (VPS `.env`,
  Supabase, GitHub).
