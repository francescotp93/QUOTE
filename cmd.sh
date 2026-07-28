#!/usr/bin/env bash
# RC POLIZZA — estrazione catalogo completo + forma dati elenchi (read-only)
set -u
D=/opt/withus-backend/scraper/italiana
cat > "$D/rc-cat.mjs" <<'JS'
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

// 1) CATALOGO: compagnie + rami con i loro VALORI (id)
await pg.goto('https://crm.rcpolizza.it/preventivi',{waitUntil:'networkidle',timeout:40000}).catch(()=>{});
await pg.waitForTimeout(2500);
const cat=await pg.evaluate(()=>{
  const g=n=>{const s=document.querySelector('select[name="'+n+'"],#'+n);return s?[...s.options].map(o=>({id:o.value,n:(o.text||'').trim()})).filter(x=>x.id&&x.n&&!/selezion/i.test(x.n)):[];};
  return {compagnie:g('id_compagnia'),rami:g('id_ramo'),agenzie:g('id_agenzia'),stati:g('id_stato[]')};
});
console.log('###CATALOGO###');
console.log(JSON.stringify(cat));
console.log('###FINECAT###');
console.log('compagnie:',cat.compagnie.length,' rami:',cat.rami.length,' agenzie:',cat.agenzie.length);

// 2) FORMA DATI elenchi (colonne + 1 riga di esempio, valori troncati)
for(const [nome,url] of [['anagrafiche','/anagrafiche-cli'],['polizze','/polizze'],['rinnovi','/rinnovi'],['sinistri','/sinistri/visualizza'],['utenti','/utenti']]){
  await pg.goto('https://crm.rcpolizza.it'+url,{waitUntil:'networkidle',timeout:40000}).catch(()=>{});
  await pg.waitForTimeout(3000);
  const d=await pg.evaluate(()=>{
    const t=document.querySelector('table');
    if(!t)return{head:[],n:0};
    return {head:[...t.querySelectorAll('thead th')].map(x=>(x.innerText||'').trim()).filter(Boolean),
            n:t.querySelectorAll('tbody tr').length};
  });
  console.log('── '+nome+' ('+url+'): righe='+d.n);
  console.log('   colonne: '+(d.head.join(' | ')||'(nessuna tabella o serve filtro)'));
}
await b.close();
JS
bash -c 'set -a; . /opt/withus-backend/server/.env 2>/dev/null; set +a; exec node "$0"' "$D/rc-cat.mjs" 2>&1 | tail -40
echo "FINE."
