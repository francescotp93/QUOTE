#!/usr/bin/env bash
# RC POLIZZA — mappatura profonda: API dati per sezione + menu laterale (read-only)
set -u
D=/opt/withus-backend/scraper/italiana
cat > "$D/rc-deep.mjs" <<'JS'
import crypto from 'crypto'; import fs from 'fs';
import { chromium } from 'playwright';
const KEY=crypto.createHash('sha256').update(process.env.FONTI_SECRET||'').digest();
const dec=b=>{try{const r=Buffer.from(String(b).slice(3),'base64');const d=crypto.createDecipheriv('aes-256-gcm',KEY,r.subarray(0,12));d.setAuthTag(r.subarray(12,28));return Buffer.concat([d.update(r.subarray(28)),d.final()]).toString('utf8');}catch{return null;}};
const s=JSON.parse(fs.readFileSync('/opt/withus-backend/server/fonti.store.json','utf8'));
const f={...s,...(s.__custom||{})}['c-rc-polizza'];
const b=await chromium.launch({args:['--no-sandbox']});
const pg=await (await b.newContext()).newPage();
let API=[];
pg.on('request',r=>{const u=r.url();if(/\/api\//.test(u)&&!/notifiche\/aggiorna/.test(u))API.push(r.method()+' '+u.replace('https://crm.rcpolizza.it','').split('?')[0]);});
await pg.goto('https://crm.rcpolizza.it/login',{waitUntil:'domcontentloaded',timeout:45000});
await pg.fill('input[name=username]',dec(f.username)); await pg.fill('input[type=password]',dec(f.password));
await pg.keyboard.press('Enter'); await pg.waitForTimeout(6000);
// barra laterale: voci con icone (title/aria-label)
const side=await pg.evaluate(()=>[...document.querySelectorAll('a[href]')].filter(a=>{const r=a.getBoundingClientRect();return r.left<120&&r.width<120&&r.height>20;}).map(a=>((a.getAttribute('title')||a.getAttribute('aria-label')||a.innerText||'').trim().slice(0,28))+' -> '+a.getAttribute('href')));
console.log('=== BARRA LATERALE ==='); [...new Set(side)].forEach(x=>console.log('  '+x));
const SEZ=['/anagrafiche-cli','/polizze','/preventivi','/rinnovi','/utenti','/preventivi/nuovo','/compagnie-ivass/credenziali','/gestione-documentazione'];
for(const s of SEZ){
  API=[];
  await pg.goto('https://crm.rcpolizza.it'+s,{waitUntil:'networkidle',timeout:40000}).catch(()=>{});
  await pg.waitForTimeout(3500);
  const titolo=await pg.evaluate(()=>(document.querySelector('h1,h2,.page-title')||{}).innerText||'').catch(()=>'');
  console.log('══ '+s+'  ['+(titolo||'').trim().slice(0,40)+']');
  const uniq=[...new Set(API)];
  if(uniq.length) uniq.slice(0,10).forEach(a=>console.log('     '+a)); else console.log('     (nessuna API: dati resi lato server)');
  const tab=await pg.evaluate(()=>{const t=document.querySelector('table');return t?[...t.querySelectorAll('thead th')].map(x=>(x.innerText||'').trim().slice(0,18)).filter(Boolean).slice(0,12):[];}).catch(()=>[]);
  if(tab.length) console.log('     colonne: '+tab.join(' | '));
}
await b.close();
JS
bash -c 'set -a; . /opt/withus-backend/server/.env 2>/dev/null; set +a; exec node "$0"' "$D/rc-deep.mjs" 2>&1 | tail -70
echo "FINE."
