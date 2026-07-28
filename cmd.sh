#!/usr/bin/env bash
# RC POLIZZA — carrellata sezioni (read-only): naviga e cattura le API /api/v1/*
set -u
D=/opt/withus-backend/scraper/italiana
cat > "$D/rc-map.mjs" <<'JS'
import crypto from 'crypto'; import fs from 'fs';
import { chromium } from 'playwright';
const SECRET=process.env.FONTI_SECRET||'';
const KEY=crypto.createHash('sha256').update(SECRET).digest();
const dec=b=>{try{const r=Buffer.from(String(b).slice(3),'base64');const d=crypto.createDecipheriv('aes-256-gcm',KEY,r.subarray(0,12));d.setAuthTag(r.subarray(12,28));return Buffer.concat([d.update(r.subarray(28)),d.final()]).toString('utf8');}catch{return null;}};
const s=JSON.parse(fs.readFileSync('/opt/withus-backend/server/fonti.store.json','utf8'));
const f={...s,...(s.__custom||{})}['c-rc-polizza'];
const u=dec(f.username),p=dec(f.password);
const b=await chromium.launch({args:['--no-sandbox']});
const pg=await (await b.newContext()).newPage();
const API=new Set();
pg.on('request',r=>{const url=r.url();if(/\/api\//.test(url))API.add(r.method()+' '+url.replace('https://crm.rcpolizza.it','').split('?')[0]);});
await pg.goto('https://crm.rcpolizza.it/login',{waitUntil:'domcontentloaded',timeout:45000});
await pg.fill('input[name=username]',u); await pg.fill('input[type=password]',p);
await pg.keyboard.press('Enter'); await pg.waitForTimeout(6000);
console.log('loggato:',!/login/i.test(pg.url()));
// menu principale (voci di navigazione, non le notizie)
const nav=await pg.evaluate(()=>[...document.querySelectorAll('nav a[href], .sidebar a[href], aside a[href], .menu a[href]')].map(a=>((a.innerText||'').trim().replace(/\s+/g,' ').slice(0,30))+' -> '+a.getAttribute('href')).filter(x=>!/#|browser-update|sharepoint/.test(x)).slice(0,40));
console.log('=== NAV ==='); [...new Set(nav)].forEach(x=>console.log('  '+x));
// sezioni da esplorare
const SEZ=['/anagrafiche-cli','/polizze','/preventivi','/scadenze','/contabilita','/collaboratori','/rinnovi','/sinistri','/estratto-conto','/statistiche','/utenti','/provvigioni'];
for(const s of SEZ){
  API.clear();
  const r=await pg.goto('https://crm.rcpolizza.it'+s,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>null);
  await pg.waitForTimeout(2500);
  const st=r?r.status():0;
  const fin=pg.url().replace('https://crm.rcpolizza.it','');
  console.log('── '+s+'  http='+st+'  →  '+fin);
  if(st===200&&!/login/.test(fin)){ [...API].slice(0,8).forEach(a=>console.log('     api: '+a)); }
}
await b.close();
JS
bash -c 'set -a; . /opt/withus-backend/server/.env 2>/dev/null; set +a; exec node "$0"' "$D/rc-map.mjs" 2>&1 | tail -80
echo "FINE."
