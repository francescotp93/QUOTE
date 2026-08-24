// ═══════════════════════════════════════════════════════════════════════════════
//  ENTRO TEMPO — chi deve rispondere subito, risponde subito
//
//  Perché esiste. Il Pannello Fonti, il guardiano automatico e la diagnosi
//  chiedono a ogni scraper `/status` di continuo: è la domanda «come stai?», e
//  una domanda del genere deve avere una risposta in pochi secondi sempre,
//  anche quando la risposta è «non lo so».
//
//  Ma cinque scraper su dieci rispondevano a `/status` chiamando `loggedIn()`,
//  che non è una lettura: è una guida del browser. Dentro c'è un
//  `page.goto(..., timeout: 45000)` più un'attesa. Quando il browser è occupato
//  o la pagina sta navigando, `/status` può metterci quasi un minuto — e chi
//  chiede ha già rinunciato da un pezzo.
//
//  IL DANNO NON È LA LENTEZZA, È LA BUGIA CHE NE VIENE. Chi chiede non riceve
//  niente, e chi non riceve niente conclude quello che gli pare: il pannello
//  scriveva «non lo dice», il guardiano — fino al 20/08/2026 — arrivava
//  addirittura a dedurre «sta bene». Una fonte verde su cui i preventivi
//  falliscono è il guasto peggiore che ci sia, perché è quello che il pannello
//  ti dice che non c'è.
//
//  Trovato il 20/08/2026 su assieasy, confrontando due letture della VPS a un
//  minuto di distanza: si contraddicevano. Non erano cambiate le compagnie, era
//  `/status` che a volte non arrivava in tempo.
//
//  QUI si mette una scadenza. Passata quella, si risponde lo stesso con il
//  ripiego — che per «sono dentro?» è `null`, cioè «non lo so», l'unica cosa
//  onesta da dire quando non si è fatto in tempo a guardare. Il lavoro lasciato
//  indietro non viene interrotto: continua per conto suo e la volta dopo la
//  risposta sarà pronta.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Aspetta `promessa` al massimo `ms`; scaduto il tempo, restituisce `ripiego`.
 * Un errore dentro la promessa vale come «non lo so», non come «no».
 */
export function entroTempo(promessa, ms, ripiego = null) {
  let finito = false;
  return Promise.race([
    Promise.resolve()
      .then(() => (typeof promessa === 'function' ? promessa() : promessa))
      .then(v => { finito = true; return v; })
      .catch(() => { finito = true; return ripiego; }),
    new Promise(r => setTimeout(() => r(finito ? undefined : ripiego), ms)),
  ]).then(v => (v === undefined ? ripiego : v));
}
