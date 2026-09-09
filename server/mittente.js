// ═══════════════════════════════════════════════════════════════════════════════
//  IL MITTENTE — un nome solo, in un posto solo
//
//  «Le email risultano inviate da Francesco Oddo, ma devono essere inviate da
//  With Us Assicurazioni.» — «Tutte le mail devono arrivare da With Us
//  Assicurazioni.» (Francesco, 09/09/2026)
//
//  Il nome che il destinatario legge accanto all'indirizzo veniva deciso in
//  SETTE punti diversi del programma, e diceva sette cose diverse: il nome e
//  cognome di chi stava scrivendo dalla casella dell'agenzia, «QUOTO», «QUOTO
//  Shop», «QUOTO Lead», «withus», il nome registrato su Brevo per quell'indi-
//  rizzo, e in tre file la variabile giusta. Chi riceve non vede un'agenzia:
//  vede una persona che non conosce, o il nome di un programma interno di cui
//  non ha mai sentito parlare — e quello e' il nome su cui decide se aprire.
//
//  LA DIFFERENZA CHE CONTA, ed e' la ragione per cui questo file puo' esistere:
//  su Brevo l'INDIRIZZO va verificato, il NOME che gli sta accanto e' testo
//  libero che scegliamo a ogni invio. Per questo il nome registrato su Brevo
//  non conta e non deve contare: si decide qui.
//
//  L'INDIRIZZO INVECE NON SI TOCCA. Le caselle restano quelle che sono
//  (noreply@, amministrazione@, intermediari@): cambiarle vuol dire toccare
//  verifiche SPF/DKIM e reputazione, ed e' un'altra cosa da questa.
//
//  Resta una variabile sola, NOTIFY_NAME, perche' il giorno in cui cambia la
//  ragione sociale non si debbano toccare nove file.
// ═══════════════════════════════════════════════════════════════════════════════
export const MITTENTE_NOME = process.env.NOTIFY_NAME || 'With Us Assicurazioni';

/* La forma che vuole la posta vera (SMTP): «Nome» <indirizzo>. Le virgolette
   servono: un nome con una virgola dentro, senza, verrebbe letto come due
   destinatari. */
export function mittenteRfc(email) {
  return '"' + String(MITTENTE_NOME).replace(/"/g, '') + '" <' + email + '>';
}
