// ═══════════════════════════════════════════════════════════════════════════════
//  IL FRENO DEI TENTATIVI DI ACCESSO
//
//  Perché esiste. Gli scraper delle compagnie tengono viva la sessione con un
//  giro ogni 3 minuti; se la trovano caduta, rifanno il login. Fin qui è giusto.
//  Il difetto era che non smettevano mai: con le credenziali non più valide o il
//  codice 2FA scaduto, ogni 3 minuti partiva un tentativo di accesso al portale
//  della compagnia. Venti all'ora, per giorni. Due conseguenze:
//
//   1. una notifica di accesso a Francesco a ogni tentativo (il sintomo per cui
//      ce ne siamo accorti: «continuano ad arrivare mail»);
//   2. il rischio vero — le compagnie bloccano l'utenza dopo troppi tentativi
//      falliti di fila, e a quel punto non si entra più nemmeno a mano.
//
//  Questo freno fa due cose che il ciclo di prima non faceva: aspetta sempre di
//  più tra un tentativo e l'altro, e dopo qualche fallimento di fila SMETTE.
//  Non riparte da solo: riparte quando una persona mette un codice nuovo dal
//  Pannello Fonti. Un ciclo che si sblocca da solo tornerebbe a bussare.
//
//  Non ha dipendenze e non conosce né Playwright né la rete: si prova da solo.
// ═══════════════════════════════════════════════════════════════════════════════

/** Valori di partenza, pensati per il caso peggiore (credenziali sbagliate). */
export const PREDEFINITI = {
  tentativiMax: 3,                 // fallimenti di fila dopo i quali ci si ferma
  attesaBase: 15 * 60 * 1000,      // 15 minuti dopo il primo fallimento
  attesaMax: 60 * 60 * 1000,       // e non oltre un'ora tra un tentativo e l'altro
};

/**
 * Crea un freno. Non ha stato globale: ogni compagnia ha il suo.
 *
 * L'orologio si passa da fuori (`ora`, in millisecondi) invece di leggerlo qui
 * dentro: è l'unico modo per provare le attese senza far passare davvero un'ora.
 */
export function creaFreno(opzioni = {}) {
  const conf = { ...PREDEFINITI, ...opzioni };
  if (!(conf.tentativiMax >= 1)) throw new Error('tentativiMax deve essere almeno 1');

  let fallitiDiFila = 0;
  let bloccato = false;
  let motivo = null;
  let nonPrimaDi = 0;   // istante prima del quale non si riprova

  return {
    /** Si può tentare un accesso adesso? */
    puoTentare(ora) {
      return !bloccato && ora >= nonPrimaDi;
    },

    /** Il login è andato: si riparte puliti. */
    riuscito() {
      fallitiDiFila = 0;
      bloccato = false;
      motivo = null;
      nonPrimaDi = 0;
    },

    /**
     * Il login è fallito. Allunga l'attesa; al `tentativiMax`-esimo fallimento
     * di fila si ferma e non riprova più finché non arriva `sblocca()`.
     */
    fallito(ora, perche) {
      fallitiDiFila++;
      if (perche) motivo = String(perche);
      if (fallitiDiFila >= conf.tentativiMax) {
        bloccato = true;
        nonPrimaDi = Infinity;
        return;
      }
      const attesa = Math.min(
        conf.attesaBase * Math.pow(2, fallitiDiFila - 1),
        conf.attesaMax,
      );
      nonPrimaDi = ora + attesa;
    },

    /**
     * Una persona ha messo un codice nuovo dal pannello e chiede di riprovare.
     * È l'UNICO modo di ripartire: il freno non si toglie da solo.
     */
    sblocca() {
      fallitiDiFila = 0;
      bloccato = false;
      motivo = null;
      nonPrimaDi = 0;
    },

    /** Quello che finisce in /status, e da lì nel pallino del Pannello Fonti. */
    stato() {
      return {
        bloccato,
        tentativi_falliti: fallitiDiFila,
        prossimo_tentativo: nonPrimaDi === Infinity ? null : nonPrimaDi,
        motivo,
      };
    },
  };
}
