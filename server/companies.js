// Registry delle compagnie ("factories") del motor Quoto — M1 del piano di integrazione
// (vedi Progetto: claude/piano-integrazione-motor-quoto.md).
//
// File NUOVO e SEPARATO: NON è importato da nulla in produzione -> nessuna regressione.
// Sostituirà progressivamente le costanti env sparse in server/moto.js (ITALIANA/HDI/...).
// Da qui l'orchestratore (M4) sa QUALE scraper interrogare, con quale endpoint e per quali rami.
//
// Interfaccia comune (astratta) ispirata al modello "factories" di Quotiamo e all'
// architettura multi-compagnia (docs/ARCHITETTURA-MULTICOMPAGNIA.md).

// URL scraper: variabile d'ambiente in produzione, default localhost (identico a server/moto.js).
const url = (env, def) => process.env[env] || def;

export const COMPANIES = [
  {
    id: 'italiana',
    nome: 'Italiana Assicurazioni',
    rami: ['auto'],
    scraper: () => url('ITALIANA_SCRAPER_URL', 'http://127.0.0.1:4300'),
    mode: 'sync', // risponde in linea (nessun job start/status)
    isHub: true, // fa anche da hub dati: veicolo + anagrafica + situazione (Plurima)
    endpoints: { premio: '/preventivo', hub: '/hub', veicolo: '/hubveicolo' },
    capabilities: { veicolo: true, situazione: true, anagrafica: true, premio: true, bersani: true },
  },
  {
    id: 'hdi',
    nome: 'HDI Assicurazioni',
    rami: ['auto', 'moto', 'autocarro', 'casa', 'tcm'],
    scraper: () => url('HDI_SCRAPER_URL', 'http://127.0.0.1:4400'),
    mode: 'async', // via diretta /premio-motor con ripiego browser /premio
    endpoints: { premio: '/premio-motor', premioBrowser: '/premio', casa: '/premio-casa', tcm: '/premio-tcm' },
    capabilities: { veicolo: true, situazione: true, anagrafica: false, premio: true, bersani: false },
  },
  {
    id: 'allianz',
    nome: 'Allianz',
    rami: ['auto', 'moto', 'autocarro'],
    scraper: () => url('ALLIANZ_SCRAPER_URL', 'http://127.0.0.1:4200'),
    mode: 'async',
    isAniaSource: true, // /lookup interroga la banca dati ANIA centrale (qualsiasi targa)
    endpoints: { premio: '/premio', lookup: '/lookup' },
    capabilities: { veicolo: true, situazione: true, anagrafica: true, premio: true, bersani: true },
  },
  {
    id: 'groupama',
    nome: 'Groupama',
    rami: ['auto'],
    scraper: () => url('GROUPAMA_SCRAPER_URL', 'http://127.0.0.1:4500'),
    mode: 'async',
    endpoints: { premio: '/premio' },
    capabilities: { veicolo: true, situazione: false, anagrafica: false, premio: true, bersani: false },
  },
  {
    id: 'axa',
    nome: 'AXA',
    rami: ['auto', 'autocarro', 'moto'],
    scraper: () => url('AXA_SCRAPER_URL', 'http://127.0.0.1:4700'),
    mode: 'async',
    endpoints: { premio: '/premio' },
    capabilities: { veicolo: false, situazione: false, anagrafica: false, premio: true, bersani: false },
  },
  {
    id: 'moto24h',
    nome: 'Moto Platinum',
    rami: ['moto'],
    scraper: () => url('MOTO_SCRAPER_URL', 'http://127.0.0.1:4100'),
    mode: 'async',
    endpoints: { premio: '/quote', lookup: '/lookup' },
    capabilities: { veicolo: true, situazione: false, anagrafica: false, premio: true, bersani: false },
  },
];

// Recupera una compagnia per id.
export function getCompany(id) {
  return COMPANIES.find((c) => c.id === id) || null;
}

// Compagnie che sanno quotare un dato ramo (base del fan-out dell'orchestratore).
export function companiesForRamo(ramo) {
  return COMPANIES.filter((c) => c.capabilities.premio && c.rami.includes(ramo));
}

// L'hub dati del ramo (oggi Italiana per auto): da cui recuperare veicolo/anagrafica/situazione.
export function hubForRamo(ramo) {
  return COMPANIES.find((c) => c.isHub && c.rami.includes(ramo)) || null;
}

export default COMPANIES;
