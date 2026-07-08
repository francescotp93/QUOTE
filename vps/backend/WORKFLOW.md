# WORKFLOW — IAM & QUOTO

Regole operative per non perdere mai più lavoro tra i due progetti.
Vale identico per `francescotp93/Agente-sospesi` (IAM) e `francescotp93/QUOTE` (QUOTO).

## 🥇 Regola d'oro
**Un repo = un solo ramo (`main`) = ciò che viene pubblicato.**
Niente più rami paralleli con lavoro vero sopra. Tutto si sviluppa e si
pubblica da `main`.

> Perché esisteva il problema: le sessioni web lavoravano su rami `claude/...`
> mentre il sito pubblicava `main`. Due "universi" scollegati → il lavoro
> sembrava sparire. Da oggi: un universo solo.

## Modello dei rami
- `main` → unico ramo di sviluppo **e** di deploy.
- `backup/...` (solo IAM) → snapshot di sicurezza, **non si tocca**.
- Eventuali rami `claude/...` o temporanei → da cancellare, non usare.

## Deploy
- Deve puntare a `main` (GitHub Pages: Settings → Pages → Branch = `main`).
- App live QUOTO: `https://francescotp93.github.io/QUOTE/` (serve l'`index.html` di root).

## Sessioni Claude su web
- Avvia la sessione **su `main`** (non su rami `claude/...`).
- Se una sessione lavora su un ramo temporaneo, **fai il merge su `main`**
  prima di considerare il lavoro salvato.
- Apri la sessione **dentro il repo** giusto per avere gli agenti specializzati
  (`.claude/agents/`): QUOTO ha `quoto-specialist`, IAM ha `iam-specialist`,
  entrambi hanno `interfaccia-quoto-iam`.

## Confine Quoto ↔ IAM
Ogni modifica che tocca il confine passa dal contratto
**`INTERFACCIA-QUOTO-IAM.md`** (fonte unica della verità). Promemoria:
- **Doppio cancello:** abilitare un utente a Quoto = impostare **sia**
  `quoto` (IAM mostra il bottone) **sia** `accesso_quoto` (QUOTO fa entrare).
- URL/parametri del redirect (`?from=iam`, `email`) si cambiano **in entrambi i repo**.
- Splash/redirect Quoto in IAM: **bloccati**, non toccare senza richiesta esplicita.

## ✅ Checklist prima di pushare
- [ ] Sto lavorando su `main` (o farò subito il merge su `main`)?
- [ ] Il login di entrambe le app funziona ancora?
- [ ] Se ho toccato il confine: ho aggiornato **entrambi** i repo e rispettato il doppio cancello?
- [ ] Il deploy pubblica `main`?
