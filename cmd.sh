#!/usr/bin/env bash
# RC POLIZZA — liste complete rami/compagnie + statistiche + preventivazione autonoma (read-only)
set -u
D=/opt/withus-backend/scraper/italiana
cat > "$D/rc-tar2.mjs" <<'JS'
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

console.log('════ A) RAMI completi ════');
await pg.goto('https://crm.rcpolizza.it/preventivi/nuovo',{waitUntil:'networkidle',timeout:40000}).catch(()=>{});
await pg.waitForTimeout(2500);
const rami=await pg.evaluate(()=>{const s=document.querySelector('select[name=id_ramo_url],#id_ramo_url');return s?[...s.options].map(o=>(o.text||'').trim()).filter(x=>x&&!/selezion/i.test(x)):[];});
console.log('  totale rami:',rami.length); console.log('  '+rami.join(' · '));

console.log('════ B) COMPAGNIE (da filtro preventivi) ════');
await pg.goto('https://crm.rcpolizza.it/preventivi',{waitUntil:'networkidle',timeout:40000}).catch(()=>{});
await pg.waitForTimeout(2500);
const comp=await pg.evaluate(()=>{const s=document.querySelector('select[name=id_compagnia],#id_compagnia');return s?[...s.options].map(o=>(o.text||'').trim()).filter(x=>x&&!/selezion|nessuna/i.test(x)):[];});
console.log('  totale compagnie:',comp.length); console.log('  '+comp.slice(0,60).join(' · '));

console.log('════ C) STATISTICHE produzione ════');
for(const u of ['/statistiche/produzione/preventivi','/statistiche/produzione','/statistiche/produzione/polizze']){
  const r=await pg.goto('https://crm.rcpolizza.it'+u,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>null);
  await pg.waitForTimeout(1800);
  const fin=pg.url().replace('https://crm.rcpolizza.it','');
  console.log('  '+u+' → '+fin+(/404/.test(fin)?' (404)':' ✓'));
  if(!/404/.test(fin)){
    const cols=await pg.evaluate(()=>{const t=document.querySelector('table');return t?[...t.querySelectorAll('thead th')].map(x=>(x.innerText||'').trim()).filter(Boolean).slice(0,12):[];});
    if(cols.length) console.log('     colonne: '+cols.join(' | '));
  }
}

console.log('════ D) PREVENTIVAZIONE AUTONOMA (guide compagnie) ════');
await pg.goto('https://crm.rcpolizza.it/gestione-documentazione?dir=GUIDE/COMPAGNIE - Accesso alla preventivazione autonoma',{waitUntil:'domcontentloaded',timeout:35000}).catch(()=>{});
await pg.waitForTimeout(2500);
const file=await pg.evaluate(()=>{const t=document.querySelector('table');return t?[...t.querySelectorAll('tbody tr')].slice(0,30).map(tr=>(tr.querySelector('td')||{}).innerText||'').map(x=>x.trim().replace(/\s+/g,' ').slice(0,60)).filter(Boolean):[];});
console.log('  documenti ('+file.length+'):'); file.forEach(x=>console.log('    '+x));
await b.close();
JS
bash -c 'set -a; . /opt/withus-backend/server/.env 2>/dev/null; set +a; exec node "$0"' "$D/rc-tar2.mjs" 2>&1 | tail -60
echo "FINE."
