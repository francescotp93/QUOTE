import 'dotenv/config';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/* UNA COPIA IN MENO DI UN SEGRETO SULLA STESSA MACCHINA.
   Sulla VPS le chiavi Supabase ci sono gia': stanno nel .env del backend, che
   e' l'unico posto dove sono state messe. Chiederle una seconda volta qui
   vorrebbe dire due file da tenere allineati e due file da proteggere — e il
   giorno che se ne ruota una, una delle due copie resta indietro senza che
   nessuno se ne accorga.
   Quindi: se non sono nel .env di questo pacchetto, si leggono da li'.
   In sviluppo quel file non c'e' e non succede niente. (20/08/2026) */
const ENV_BACKEND = process.env.WITHUS_ENV || '/opt/withus-backend/server/.env';
if ((!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) && fs.existsSync(ENV_BACKEND)) {
  dotenv.config({ path: ENV_BACKEND });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const STATE_FILE = path.join(ROOT, 'storage', 'state.json');

export const PRIMA = {
  base: 'https://intermediari.prima.it',
  graphql: 'https://intermediari.prima.it/api/graphql',
  loginUrl: 'https://intermediari.prima.it/preventivi',
  email: process.env.PRIMA_EMAIL,
  password: process.env.PRIMA_PASSWORD,
  limit: Number(process.env.PRIMA_LIMIT || 800),
  timeoutMs: Number(process.env.PRIMA_TIMEOUT_MS || 180000),
  delayMs: Number(process.env.PRIMA_DELAY_MS || 2000),
  headless: process.env.PRIMA_HEADLESS !== '0',
};

export const SUPABASE = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

// Segmentazione: l'API va in timeout su dataset grandi, quindi non chiediamo
// mai "tutto insieme" ma una coppia (status, productType) alla volta.
export const STATUSES = ['PURCHASABLE', 'PURCHASED', 'EXPIRED', 'DOCUMENTS_REQUIRED'];
export const PRODUCT_TYPES = ['MOTOR', 'HOME'];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}
