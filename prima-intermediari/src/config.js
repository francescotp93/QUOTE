import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
