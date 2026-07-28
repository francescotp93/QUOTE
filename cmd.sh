#!/usr/bin/env bash
# RC POLIZZA — esplora API /api/v1 (read-only) usando la sessione loggata
set -u
D=/opt/withus-backend/scraper/italiana
cat > "$D/rc-api.mjs" <<'JS'
import crypto from 'crypto'; import fs from 'fs';
import { chromium } from 'playwright';
const KEY=crypto.createHash('sha256').update(process.env.FONTI_SECRET||'').digest();
const dec=b=>{try{const r=Buffer.from(String(b).slice(3),'base64');const d=crypto.createDecipheriv('aes-256-gcm',KEY,r.subarray(0,12));d.setAuthTag(r.subarray(12,28));return Buffer.concat([d.update(r.subarray(28)),d.final()]).toString('utf8');}catch{return null;}};
const s=JSON.parse(fs.readFileSync('/opt/withus-backend/server/fonti.store.json','utf8'));
const f={...s,...(s.__custom||{})}['c-rc-polizza'];
const b=await chromium.launch({args:['--no-sandbox']});
const pg=await (await b.newContext()).newPage();
await pg.goto('https://crm.rcpolizza.it/login',{waitUntil:'domcontentloaded',timeout:45000});
await pg.fill('input[name=username]',dec(f.username)); await pg.fill('input[type=password]',dec(f.password));
await pg.keyboard.press('Enter'); await pg.waitForTimeout(6000);
const get=async p=>await pg.evaluate(async(u)=>{try{const r=await fetch(u,{headers:{'Accept':'application/json','X-Requested-With':'XMLHttpRequest'}});const t=await r.text();return {s:r.status,t:t.slice(0,700)};}catch(e){return{s:0,t:String(e).slice(0,90)};}},p);
const P=['/api/v1/gruppi-rami/1','/api/v1/gruppi-rami','/api/v1/rami','/api/v1/categorie','/api/v1/professioni','/api/v1/prodotti','/api/v1/compagnie','/api/v1/preventivi','/api/v1/tariffe','/api/v1/statistiche/dashboard','/api/v1/anagrafiche','/api/v1/polizze'];
for(const p of P){ const r=await get(p); console.log('── '+p+'  ['+r.s+']'); if(r.s===200) console.log('   '+r.t.replace(/\s+/g,' ').slice(0,420)); }
await b.close();
JS
bash -c 'set -a; . /opt/withus-backend/server/.env 2>/dev/null; set +a; exec node "$0"' "$D/rc-api.mjs" 2>&1 | tail -50
echo "FINE."
