#!/usr/bin/env bash
# RC POLIZZA — caccia alle TARIFFE (read-only): prodotti, flusso preventivo, premi negli elenchi
set -u
D=/opt/withus-backend/scraper/italiana
cat > "$D/rc-tar.mjs" <<'JS'
import crypto from 'crypto'; import fs from 'fs';
import { chromium } from 'playwright';
const KEY=crypto.createHash('sha256').update(process.env.FONTI_SECRET||'').digest();
const dec=b=>{try{const r=Buffer.from(String(b).slice(3),'base64');const d=crypto.createDecipheriv('aes-256-gcm',KEY,r.subarray(0,12));d.setAuthTag(r.subarray(12,28));return Buffer.concat([d.update(r.subarray(28)),d.final()]).toString('utf8');}catch{return null;}};
const s=JSON.parse(fs.readFileSync('/opt/withus-backend/server/fonti.store.json','utf8'));
const f={...s,...(s.__custom||{})}['c-rc-polizza'];
const b=await chromium.launch({args:['--no-sandbox']});
const pg=await (await b.newContext()).newPage();
const API=new Set();
pg.on('request',r=>{const u=r.url();if(/\/api\/|tariff|premi|calcol|quot/i.test(u)&&!/notifiche\/aggiorna/.test(u))API.add(r.method()+' '+u.replace('https://crm.rcpolizza.it','').split('?')[0]);});
await pg.goto('https://crm.rcpolizza.it/login',{waitUntil:'domcontentloaded',timeout:45000});
await pg.fill('input[name=username]',dec(f.username)); await pg.fill('input[type=password]',dec(f.password));
await pg.keyboard.press('Enter'); await pg.waitForTimeout(6000);

console.log('════════ A) PREVENTIVI: elenco e premi ════════');
await pg.goto('https://crm.rcpolizza.it/preventivi',{waitUntil:'networkidle',timeout:40000}).catch(()=>{});
await pg.waitForTimeout(3000);
const prev=await pg.evaluate(()=>{
  const t=document.querySelector('table');
  const head=t?[...t.querySelectorAll('thead th')].map(x=>(x.innerText||'').trim()).filter(Boolean):[];
  const rows=t?[...t.querySelectorAll('tbody tr')].slice(0,3).map(tr=>[...tr.querySelectorAll('td')].map(td=>(td.innerText||'').trim().replace(/\s+/g,' ').slice(0,22))):[];
  const sel=[...document.querySelectorAll('select')].slice(0,6).map(s=>({id:s.id||s.name||'',opts:[...s.options].slice(0,10).map(o=>(o.text||'').trim().slice(0,26))}));
  return {head,rows,sel};
});
console.log('  colonne:', prev.head.join(' | ')||'(nessuna)');
prev.rows.forEach((r,i)=>console.log('  riga'+i+':', r.join(' | ').slice(0,180)));
prev.sel.forEach(s=>console.log('  select['+s.id+']:', s.opts.join(', ').slice(0,200)));

console.log('════════ B) NUOVO PREVENTIVO: prodotti/compagnie ════════');
await pg.goto('https://crm.rcpolizza.it/preventivi/nuovo',{waitUntil:'networkidle',timeout:40000}).catch(()=>{});
await pg.waitForTimeout(3000);
const nuovo=await pg.evaluate(()=>{
  const sel=[...document.querySelectorAll('select')].slice(0,8).map(s=>({id:s.id||s.name||'',opts:[...s.options].slice(0,25).map(o=>(o.text||'').trim().slice(0,30))}));
  const link=[...document.querySelectorAll('a[href*="prodott"],a[href*="preventiv"],a[href*="ramo"]')].slice(0,25).map(a=>((a.innerText||'').trim().slice(0,32))+' -> '+a.getAttribute('href'));
  const card=[...document.querySelectorAll('.card,.box,.prodotto,[class*=product]')].slice(0,15).map(c=>(c.innerText||'').trim().replace(/\s+/g,' ').slice(0,50));
  return {sel,link,card};
});
nuovo.sel.forEach(s=>console.log('  select['+s.id+']:', s.opts.join(' · ').slice(0,300)));
[...new Set(nuovo.link)].forEach(l=>console.log('  link:', l));
nuovo.card.filter(Boolean).slice(0,10).forEach(c=>console.log('  card:', c));

console.log('════════ C) POLIZZE: colonne e premi ════════');
await pg.goto('https://crm.rcpolizza.it/polizze',{waitUntil:'networkidle',timeout:40000}).catch(()=>{});
await pg.waitForTimeout(3000);
const pol=await pg.evaluate(()=>{
  const t=document.querySelector('table');
  return {head:t?[...t.querySelectorAll('thead th')].map(x=>(x.innerText||'').trim()).filter(Boolean):[],
          row:t?[...t.querySelectorAll('tbody tr')].slice(0,2).map(tr=>[...tr.querySelectorAll('td')].map(td=>(td.innerText||'').trim().replace(/\s+/g,' ').slice(0,20))):[]};
});
console.log('  colonne:', pol.head.join(' | ')||'(nessuna)');
pol.row.forEach((r,i)=>console.log('  riga'+i+':', r.join(' | ').slice(0,180)));

console.log('════════ D) API/tariffe intercettate ════════');
[...API].slice(0,20).forEach(a=>console.log('  '+a));
await b.close();
JS
bash -c 'set -a; . /opt/withus-backend/server/.env 2>/dev/null; set +a; exec node "$0"' "$D/rc-tar.mjs" 2>&1 | tail -80
echo "FINE."
