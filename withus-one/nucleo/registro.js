/* ═══════════════════════════════════════════════════════════════════════════
   REGISTRO — l'elenco dei moduli e il menu
   ───────────────────────────────────────────────────────────────────────────
   Perché un elenco separato invece di leggere `meta` da ogni modulo: per
   disegnare il menu servirebbe importarli TUTTI all'avvio, e allora tanto
   varrebbe tornare al file unico. Qui c'è solo la riga di menu; il modulo si
   scarica quando lo si apre.

   Il prezzo è che questo elenco può divergere dal `meta` del modulo: lo
   impedisce la prova `verifica/registro.test.mjs`, che confronta riga per riga.
   ═══════════════════════════════════════════════════════════════════════════ */

/* L'ordine delle aree è quello del menu: si va dal lavoro di oggi, alle cose
   che si vendono, a quelle che si gestiscono, ai soldi, alle richieste. */
export const AREE = [
  { nome: 'Scrivania',      icona: 'ti-layout-dashboard' },
  { nome: 'Preventivi',     icona: 'ti-calculator' },
  { nome: 'Portafoglio',    icona: 'ti-briefcase' },
  { nome: 'Contabilità',    icona: 'ti-cash' },
  { nome: 'Richieste',      icona: 'ti-lifebuoy' },
  { nome: 'Amministrazione', icona: 'ti-settings' }
];

export const MODULI = [
  { chiave: 'scrivania',   titolo: 'Scrivania',       sottotitolo: 'Il lavoro di oggi',                       icona: 'ti-home',          area: 'Scrivania',       permesso: null },

  { chiave: 'prodotti',    titolo: 'Prodotti',        sottotitolo: 'Catalogo e compagnie',                    icona: 'ti-package',       area: 'Preventivi',      permesso: null },
  { chiave: 'preventivi',  titolo: 'Preventivi',      sottotitolo: 'Le quotazioni salvate',                   icona: 'ti-file-text',     area: 'Preventivi',      permesso: null },

  { chiave: 'clienti',     titolo: 'Clienti',         sottotitolo: 'Anagrafiche e storia',                    icona: 'ti-users',         area: 'Portafoglio',     permesso: null },
  { chiave: 'polizze',     titolo: 'Polizze',         sottotitolo: 'Il portafoglio contratti',                icona: 'ti-shield-check',  area: 'Portafoglio',     permesso: null },
  { chiave: 'scadenzario', titolo: 'Scadenzario',     sottotitolo: 'Chi scade, e quando',                     icona: 'ti-calendar-event', area: 'Portafoglio',    permesso: null },
  { chiave: 'sinistri',    titolo: 'Sinistri',        sottotitolo: 'Denunce e liquidazioni',                  icona: 'ti-alert-triangle', area: 'Portafoglio',    permesso: null },

  { chiave: 'titoli',      titolo: 'Titoli',          sottotitolo: 'Rate, quietanze e insoluti',              icona: 'ti-receipt',       area: 'Contabilità',     permesso: null },

  { chiave: 'richieste',   titolo: 'Richieste',       sottotitolo: 'La coda verso l\'ufficio',                icona: 'ti-message-2',     area: 'Richieste',       permesso: null },

  { chiave: 'utenti',      titolo: 'Collaboratori',   sottotitolo: 'Chi lavora in agenzia',                   icona: 'ti-id-badge-2',    area: 'Amministrazione', permesso: 'admin' }
];

/* Un modulo si vede se il permesso è soddisfatto. Attenzione: questo NASCONDE
   la voce, non protegge il dato — chi conosce l'indirizzo può scriverlo a mano.
   La protezione vera è la riservatezza del database (RLS), non questa riga. */
export function visibile(voce, utente) {
  if (!voce.permesso) return true;
  if (voce.permesso === 'admin') return !!(utente && utente.admin);
  if (voce.permesso === 'staff') return !!(utente && utente.staff);
  return false;
}

export function trova(chiave) {
  return MODULI.find(m => m.chiave === chiave) || null;
}

/* Le aree nell'ordine dichiarato, ognuna con i suoi moduli visibili.
   Un'area senza moduli visibili non compare: un titolo di menu che non apre
   niente è solo una promessa non mantenuta. */
export function menu(utente) {
  return AREE
    .map(a => ({ ...a, voci: MODULI.filter(m => m.area === a.nome && visibile(m, utente)) }))
    .filter(a => a.voci.length);
}

export default { AREE, MODULI, menu, trova, visibile };
