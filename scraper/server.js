import express from 'express';
import { getBrowser, newPage, closeBrowser } from './browser.js';
import { login24h } from './login.js';
import { fillQuoteForm } from './quoteForm.js';
import { parseQuoteResult } from './parseResult.js';
import logger from './logger.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;
const CREDENTIALS = {
  username: process.env.H24_USERNAME,
  password: process.env.H24_PASSWORD,
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'quote-scraper' });
});

app.post('/scrape/rc-moto', async (req, res) => {
  const { dataNascita, targa } = req.body;
  if (!dataNascita || !targa) {
    return res.status(400).json({ error: 'dataNascita e targa obbligatori.' });
  }
  logger.info('Richiesta preventivo:', { targa, dataNascita });
  let page = null;
  try {
    page = await newPage();
    await login24h(page, CREDENTIALS);
    await fillQuoteForm(page, { dataNascita, targa });
    const result = await parseQuoteResult(page, { dataNascita, targa });
    await page.close();
    res.json(result);
  } catch (err) {
    logger.error('Errore scraping:', err.message);
    if (page) await page.close().catch(() => {});
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  logger.info('Scraper server avviato su porta ' + PORT);
});
