// ═══════════════════════════════════════════════════════════════════════════════
//  ANALISI DEI BISOGNI — gli inviti al cliente
//
//  Un invito e' un link che il cliente apre da casa per compilare la sua
//  analisi. Dentro c'e' un codice casuale e basta: niente nome, niente email,
//  niente identificativo interno.
//
//  Il perche' e' concreto. Un link finisce in una chat di WhatsApp, resta nella
//  cronologia del browser, viene inoltrato per sbaglio. Se contenesse l'id del
//  cliente, chiunque potrebbe provare a cambiarlo di una cifra e aprire la
//  pratica di qualcun altro. Un codice casuale da 256 bit non si indovina.
//
//  Nel database va solo l'IMPRONTA del codice, mai il codice. Cosi' chi legge
//  il database — un backup finito nel posto sbagliato, un accesso di troppo —
//  non puo' aprire le analisi dei clienti. E' la stessa ragione per cui non si
//  salvano le password.
//
//  Adattato da docs/analisi-bisogni/reference/inviti-sicuri.mjs (nel repository
//  IAM), che e' la specifica.
// ═══════════════════════════════════════════════════════════════════════════════
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SCADENZE_AMMESSE = [24, 72, 168];   // un giorno, tre giorni, una settimana

/* 32 byte = 256 bit. La specifica ne chiede almeno 128; costano uguale e
   tolgono ogni dubbio. base64url perche' il codice finisce dentro un URL e
   non deve avere caratteri da codificare. */
export function generaToken(byte = 32) {
  if (!Number.isInteger(byte) || byte < 16) throw new TypeError('La lunghezza del token deve essere di almeno 16 byte.');
  return randomBytes(byte).toString('base64url');
}

export function hashToken(token) {
  if (typeof token !== 'string' || token.length < 20) throw new TypeError('Token non valido.');
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/* Confronto a tempo costante. Con un confronto normale il tempo di risposta
   cambia a seconda di quanti caratteri iniziali coincidono, e da fuori si puo'
   ricostruire l'impronta un pezzo per volta. Qui il tempo non dipende dal
   contenuto. */
export function tokenCorrisponde(token, hashAtteso) {
  if (typeof hashAtteso !== 'string' || !/^[a-f0-9]{64}$/.test(hashAtteso)) return false;
  let calcolato;
  try { calcolato = hashToken(token); } catch { return false; }
  return timingSafeEqual(Buffer.from(calcolato, 'hex'), Buffer.from(hashAtteso, 'hex'));
}

export function calcolaScadenza(ore, da = new Date()) {
  if (!Number.isFinite(ore) || ore <= 0 || ore > 24 * 30) {
    throw new RangeError("La scadenza deve essere compresa tra un'ora e 30 giorni.");
  }
  return new Date(da.getTime() + ore * 60 * 60 * 1000);
}

/* Un invito serve finche' non e' stato revocato, non e' stato completato e non
   e' scaduto. Il completamento chiude il link: dopo la firma l'analisi non si
   tocca piu', e lasciare aperta la porta vorrebbe dire poter cambiare le
   risposte sotto a una firma gia' data. */
export function invitoUtilizzabile(invito, ora = new Date()) {
  if (!invito) return false;
  if (invito.revocato_il || invito.completato_il) return false;
  const scadenza = new Date(invito.scade_il);
  return !Number.isNaN(scadenza.getTime()) && scadenza > ora;
}

/* Perche' un invito non va bene, in parole che il cliente possa usare.
   Il messaggio e' lo STESSO per «non esiste» e per «revocato»: distinguerli
   direbbe a un estraneo che quel codice e' esistito davvero, e con qualche
   tentativo si scoprirebbe quali clienti hanno un'analisi in corso. */
export function perchePorteChiuse(invito, ora = new Date()) {
  if (!invito || invito.revocato_il) {
    return 'Questo link non è più valido. Chiedi al tuo consulente With Us un nuovo invito.';
  }
  if (invito.completato_il) {
    return 'Questa analisi è già stata completata e firmata. Per rivederla, contatta il tuo consulente With Us.';
  }
  if (new Date(invito.scade_il) <= ora) {
    return 'Questo link è scaduto. Chiedi al tuo consulente With Us un nuovo invito.';
  }
  return null;
}

/* Il recapito che compare nelle ricevute e negli eventi: mai per intero.
   Serve a dire DOVE e' andato il codice a chi legge un registro, senza
   spargere indirizzi e numeri in posti che non li devono conservare. */
export function mascheraRecapito(recapito) {
  const v = String(recapito || '').trim();
  if (!v) return '';
  if (v.includes('@')) {
    const [nome, dominio] = v.split('@');
    const testa = nome.slice(0, 1);
    return testa + '***@' + (dominio || '');
  }
  const cifre = v.replace(/\D/g, '');
  return cifre.length >= 4 ? '*** ' + cifre.slice(-4) : '***';
}

/* Quante volte si puo' sbagliare prima che il link si chiuda. Non e' una
   difesa dal cliente distratto — sono dieci tentativi, non tre — ma da chi
   prova codici a raffica. */
export const TENTATIVI_MASSIMI = 10;

export function troppiTentativi(invito) {
  return Boolean(invito) && (invito.tentativi_falliti || 0) >= TENTATIVI_MASSIMI;
}
