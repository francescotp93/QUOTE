#!/usr/bin/env bash
# RC POLIZZA — cosa c'è davvero nel portafoglio (read-only): forza ricerca/filtri
set -u
D=/opt/withus-backend/scraper/italiana
cat > "$D/rc-dati.mjs" <<'JS'
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
for(const [nome,url] of [['polizze','/polizze'],['rinnovi','/rinnovi'],['sinistri','/sinistri/visualizza'],['preventivi','/preventivi'],['anagrafiche','/anagrafiche-cli']]){
  await pg.goto('https://crm.rcpolizza.it'+url,{waitUntil:'networkidle',timeout:40000}).catch(()=>{});
  await pg.waitForTimeout(2000);
  // prova a premere un bottone "Cerca"/"Filtra" se c'è
  const btn=await pg.evaluate(()=>{const b=[...document.querySelectorAll('button,input[type=submit],a')].find(x=>/^(cerca|filtra|visualizza|ricerca)$/i.test((x.innerText||x.value||'').trim()));if(b){b.click();return (b.innerText||b.value||'').trim();}return null;});
  await pg.waitForTimeout(3500);
  const d=await pg.evaluate(()=>{
    const ts=[...document.querySelectorAll('table')];
    const t=ts.find(x=>x.querySelectorAll('tbody tr').length>0)||ts[0];
    const testo=document.body.innerText;
    const vuoto=/nessun (risultato|record|dato)|non ci sono|no data|empty/i.test(testo);
    return {tab:ts.length, righe:t?t.querySelectorAll('tbody tr').length:0,
            head:t?[...t.querySelectorAll('thead th')].map(x=>(x.innerText||'').trim()).filter(Boolean).slice(0,10):[],
            vuoto, hint:(testo.match(/[^.\n]{0,60}(nessun|non ci sono)[^.\n]{0,60}/i)||[''])[0].trim().slice(0,90)};
  });
  console.log('══ '+nome+'  (bottone: '+(btn||'nessuno')+')');
  console.log('   tabelle:'+d.tab+'  righe:'+d.righe+(d.vuoto?'  → VUOTO':''));
  if(d.head.length) console.log('   colonne: '+d.head.join(' | '));
  if(d.hint) console.log('   messaggio: '+d.hint);
}
await b.close();
JS
bash -c 'set -a; . /opt/withus-backend/server/.env 2>/dev/null; set +a; exec node "$0"' "$D/rc-dati.mjs" 2>&1 | tail -40
echo "FINE."
