// ═══════════════════════════════════════════════════════════════════════════════
//  LE ROTTE DEL TELECOMANDO — «/logindump» non è «/login»
//
//  Perché esiste. I tre scraper smistano le richieste HTTP con una catena di
//  `if (u.pathname.startsWith('/nome'))`. Con `startsWith` una rotta che è
//  prefisso di un'altra se la mangia, e vince quella scritta prima:
//
//      '/logindump'.startsWith('/login')  →  true
//
//  Così `/logindump` — la rotta che serve a mappare la pagina di login quando il
//  portale cambia — non è MAI stata raggiungibile: chiamandola partiva un
//  tentativo di accesso vero. Nessuno se n'era accorto perché la risposta
//  arrivava lo stesso, solo che era la risposta di un'altra rotta.
//
//  Dal 01/08/2026 il danno era peggiore: `/login` toglie il freno sui tentativi
//  di accesso (è il gesto di una persona che ha messo un codice nuovo). Con la
//  collisione, bastava chiamare una rotta di DIAGNOSTICA per rimettere in moto
//  il ciclo di login che il freno doveva fermare.
//
//  La regola qui è una sola: una rotta si riconosce per il nome intero, non per
//  come comincia. Niente dipendenze: si prova senza avviare nulla.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * La richiesta è per questa rotta? Confronto sul nome intero.
 *
 * Accetta sia un URL già analizzato (`new URL(req.url, 'http://x')`) sia una
 * stringa, perché i tre scraper la chiamano in modi diversi. La barra finale si
 * perdona: `/status` e `/status/` sono la stessa cosa per chi chiama.
 * La riga di ricerca (`?targa=…`) non c'entra: sta fuori dal percorso.
 */
export function rottaE(urlOPercorso, nome) {
  const p = percorso(urlOPercorso);
  if (p == null) return false;
  return p === nome || p === nome + '/';
}

function percorso(x) {
  if (x == null) return null;
  if (typeof x === 'string') {
    // Se arriva un URL intero o una stringa con la riga di ricerca, tengo il percorso.
    const senzaRicerca = x.split('?')[0].split('#')[0];
    return senzaRicerca || '/';
  }
  if (typeof x.pathname === 'string') return x.pathname;
  return null;
}

/**
 * Quali rotte di questo elenco si mangiano tra loro se confrontate per prefisso.
 *
 * Non serve al programma che gira: serve alle prove, per dimostrare che il
 * difetto c'era davvero e che oggi non c'è più. Restituisce le coppie
 * [chi_mangia, chi_viene_mangiata] nell'ordine in cui sono dichiarate.
 */
export function collisioniDiPrefisso(nomi) {
  const fuori = [];
  for (let i = 0; i < nomi.length; i++) {
    for (let j = i + 1; j < nomi.length; j++) {
      if (nomi[j].startsWith(nomi[i])) fuori.push([nomi[i], nomi[j]]);
    }
  }
  return fuori;
}
