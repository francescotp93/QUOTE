#!/usr/bin/env bash
# RC POLIZZA — trova l'API PRODOTTI/PREMI pilotando il wizard (read-only, nessun invio)
set -u
D=/opt/withus-backend/scraper/italiana
cat > "$D/rc-prod.mjs" <<'JS'
import crypto from 'crypto'; import fs from 'fs';
import { chromium } from 'playwright';
const KEY=crypto.createHash('sha256').update(process.env.FONTI_SECRET||'').digest();
const dec=b=>{try{const r=Buffer.from(String(b).slice(3),'base64');const d=crypto.createDecipheriv('aes-256-gcm',KEY,r.subarray(0,12));d.setAuthTag(r.subarray(12,28));return Buffer.concat([d.update(r.subarray(28)),d.final()]).toString('utf8');}catch{return null;}};
const s=JSON.parse(fs.readFileSync('/opt/withus-backend/server/fonti.store.json','utf8'));
const f={...s,...(s.__custom||{})}['c-rc-polizza'];
const b=await chromium.launch({args:['--no-sandbox']});
const pg=await (await b.newContext()).newPage();
const CALLS=[];
pg.on('response',async r=>{const u=r.url();if(/\/api\/v1\//.test(u)&&!/dashboard|aggiornaRichieste/.test(u)){let t='';try{t=(await r.text()).slice(0,260);}catch{} CALLS.push(r.request().method()+' '+u.replace('https://crm.rcpolizza.it','')+'  →  '+t.replace(/\s+/g,' '));}});
await pg.goto('https://crm.rcpolizza.it/login',{waitUntil:'domcontentloaded',timeout:45000});
await pg.fill('input[name=username]',dec(f.username)); await pg.fill('input[type=password]',dec(f.password));
await pg.keyboard.press('Enter'); await pg.waitForTimeout(6000);
await pg.goto('https://crm.rcpolizza.it/preventivi/nuovo',{waitUntil:'networkidle',timeout:40000}).catch(()=>{});
await pg.waitForTimeout(2500);
CALLS.length=0;
// 1) ramo
await pg.evaluate(()=>{const s=[...document.querySelectorAll('select')].find(x=>/id_ramo_url/.test(x.name||x.id||''));const o=[...s.options].find(o=>/RC PROFESSIONALE/i.test(o.text));s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));});
await pg.waitForTimeout(3000);
console.log('── dopo RAMO: chiamate'); CALLS.slice(0,4).forEach(c=>console.log('   '+c.slice(0,300))); CALLS.length=0;
// 2) categoria
const cat=await pg.evaluate(()=>{const s=[...document.querySelectorAll('select')].find(x=>/id_categoria/.test(x.name||x.id||''));if(!s)return 'no select';const o=[...s.options].find(o=>o.value&&!/selezion/i.test(o.text));if(!o)return 'no opt';s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));return o.text.trim()+' (id='+o.value+')';});
console.log('── CATEGORIA scelta: '+cat);
await pg.waitForTimeout(3500);
CALLS.slice(0,5).forEach(c=>console.log('   '+c.slice(0,340))); CALLS.length=0;
// 3) professione
const pro=await pg.evaluate(()=>{const s=[...document.querySelectorAll('select')].find(x=>/id_professione/.test(x.name||x.id||''));if(!s)return 'no select';const o=[...s.options].find(o=>o.value&&!/selezion|tutte/i.test(o.text));if(!o)return 'nessuna opzione ('+s.options.length+')';s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));return o.text.trim()+' (id='+o.value+')';});
console.log('── PROFESSIONE scelta: '+pro);
await pg.waitForTimeout(3500);
CALLS.slice(0,6).forEach(c=>console.log('   '+c.slice(0,340))); CALLS.length=0;
// 4) prodotti visibili a schermo
const prod=await pg.evaluate(()=>[...document.querySelectorAll('[class*=prodott],.card,.product,li')].map(x=>(x.innerText||'').trim().replace(/\s+/g,' ')).filter(t=>t.length>8&&t.length<90).slice(0,20));
console.log('── PRODOTTI a schermo:'); [...new Set(prod)].slice(0,14).forEach(p=>console.log('   • '+p));
await b.close();
JS
bash -c 'set -a; . /opt/withus-backend/server/.env 2>/dev/null; set +a; exec node "$0"' "$D/rc-prod.mjs" 2>&1 | tail -50
echo "FINE."
