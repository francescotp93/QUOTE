// ═══════════════════════════════════════════════════════════════════════════════
//  LO SCHEMA NON REGALA IL PORTAFOGLIO
//
//  `prima_preventivi` contiene il portafoglio preventivi dell'agenzia: nome del
//  contraente, premio, e per il ramo Motor la TARGA — che è un dato personale.
//  Chi lo legge non è un dettaglio tecnico, è una decisione.
//
//  Il pacchetto arrivato il 20/08/2026 aveva due punti da correggere, e sono
//  esattamente i due che questa prova sorveglia:
//
//  1. LE VISTE SCAVALCAVANO LA RLS. In Postgres una vista gira con i permessi
//     di CHI L'HA CREATA, non di chi legge, a meno che non sia dichiarata
//     `security_invoker`. Le tabelle avevano la RLS accesa e le viste no:
//     attraverso PostgREST si leggeva tutto lo stesso.
//     Non è un'ipotesi — la stessa falla era già stata introdotta e corretta il
//     29/07/2026 su `quote_scadenzario`, e l'aveva trovata il controllo di
//     sicurezza di Supabase.
//     Verificato sul database vero: con la vista com'era nel pacchetto, un
//     collaboratore leggeva anche il preventivo intestato a un altro.
//
//  2. LA LETTURA ERA `using (true)`. Cioè: chiunque sia entrato vede tutto.
//     Nel resto del sistema non è così — si passa da iam_mio_ruolo() e
//     quote_vede(). Adesso lo staff vede tutto e il collaboratore vede il suo.
//
//  Questa prova guarda il FILE, non il database: è il file che si riesegue su
//  un altro ambiente, ed è lì che una regola tolta passerebbe inosservata.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const QUI = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sql = fs.readFileSync(path.join(QUI, 'sql', '001_schema.sql'), 'utf8');
/* I commenti spiegano il guasto e ne nominano i pezzi: se la prova leggesse
   anche quelli, si accuserebbe da sola. */
const codice = sql.replace(/^\s*--.*$/gm, '');

const esiti = [];
const prova = (nome, fn) => { try { fn(); esiti.push([true, nome, '']); }
                              catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

const viste = [...codice.matchAll(/create\s+or\s+replace\s+view\s+public\.(\w+)/gi)].map(m => m[1]);
const tabelle = [...codice.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.(\w+)/gi)].map(m => m[1]);

prova('ogni vista applica la RLS di chi legge, non di chi l\'ha creata', () => {
  deve(viste.length > 0, 'non trovo nessuna vista: la prova starebbe sorvegliando il nulla');
  for (const v of viste) {
    const re = new RegExp('alter\\s+view\\s+public\\.' + v + '\\s+set\\s*\\(\\s*security_invoker\\s*=\\s*true', 'i');
    deve(re.test(codice),
      'la vista ' + v + ' non ha security_invoker: attraverso PostgREST si leggerebbe tutto il portafoglio, targhe comprese');
  }
});

prova('la RLS è accesa su tutte le tabelle', () => {
  deve(tabelle.length >= 2, 'mi aspettavo almeno due tabelle, ne trovo ' + tabelle.length);
  for (const t of tabelle) {
    const re = new RegExp('alter\\s+table\\s+public\\.' + t + '\\s+enable\\s+row\\s+level\\s+security', 'i');
    deve(re.test(codice), 'la tabella ' + t + ' non ha la RLS accesa');
  }
});

prova('nessuna politica dice «tutti vedono tutto»', () => {
  /* `using (true)` su una tabella di clienti vuol dire che l'ultimo
     collaboratore aggiunto legge il portafoglio intero. */
  const politiche = [...codice.matchAll(/create\s+policy\s+(\w+)[\s\S]*?;/gi)].map(m => m[0]);
  deve(politiche.length >= 2, 'trovo solo ' + politiche.length + ' politiche');
  for (const p of politiche) {
    const nome = (p.match(/create\s+policy\s+(\w+)/i) || [])[1];
    deve(!/using\s*\(\s*true\s*\)/i.test(p),
      'la politica ' + nome + ' apre a chiunque sia entrato: usa i ruoli, come il resto del sistema');
  }
});

prova('il portafoglio si filtra per chi lo ha fatto, e lo staff vede tutto', () => {
  const p = (codice.match(/create\s+policy\s+prima_preventivi_read[\s\S]*?;/i) || [''])[0];
  deve(p, 'manca la politica di lettura sui preventivi');
  deve(/iam_is_staff\(\)/.test(p), 'lo staff non ha una via: vedrebbe solo i preventivi intestati a se stesso');
  deve(/mail_intermediario/.test(p), 'il collaboratore non viene filtrato sui suoi preventivi');
});

prova('il log tecnico delle run resta allo staff', () => {
  /* Non contiene dati di clienti, ma dice quando e quanto giriamo sul portale
     di una compagnia. */
  const p = (codice.match(/create\s+policy\s+prima_scrape_runs_read[\s\S]*?;/i) || [''])[0];
  deve(p && /iam_is_staff\(\)/.test(p), 'il registro delle esecuzioni e\' leggibile da chiunque');
});

prova('l\'email di chi chiede si prende dalla tabella, non dal token', () => {
  /* Un token resta valido fino alla scadenza anche dopo che l'utenza e' stata
     cambiata: leggere l'email da li' vorrebbe dire dare accesso a chi non ce
     l'ha piu'. */
  const f = (codice.match(/create\s+or\s+replace\s+function\s+public\.iam_mia_email[\s\S]*?\$\$;/i) || [''])[0];
  deve(f, 'manca la funzione iam_mia_email');
  deve(/from\s+public\.iam_utenti/i.test(f), 'l\'email non viene dalla tabella');
  deve(/security\s+definer/i.test(f),
    'senza SECURITY DEFINER la politica che interroga iam_utenti rientrerebbe in se stessa');
  deve(/set\s+search_path/i.test(f), 'senza search_path fissato la funzione e\' aggirabile');
});

prova('lo schema si puo\' rieseguire senza rompere niente', () => {
  const creazioni = [...codice.matchAll(/create\s+(table|index)\s+(if\s+not\s+exists\s+)?/gi)];
  const senzaGuardia = creazioni.filter(m => !m[2]);
  deve(senzaGuardia.length === 0,
    senzaGuardia.length + ' create senza «if not exists»: rieseguire lo schema darebbe errore a meta\' strada');
});

let ko = 0;
console.log('\nSCHEMA PRIMA — non regala il portafoglio');
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n : '  X   ' + n + '\n      ' + m); if (!ok) ko++; }
console.log(`\nSCHEMA PRIMA: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
