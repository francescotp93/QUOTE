#!/usr/bin/env bash
# RC POLIZZA — estrae ALBERO COMPLETO ramo→categoria→professione (read-only)
set -u
D=/opt/withus-backend/scraper/italiana
cat > "$D/rc-albero.mjs" <<'JS'
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
await pg.goto('https://crm.rcpolizza.it/preventivi/nuovo',{waitUntil:'networkidle',timeout:40000}).catch(()=>{});
await pg.waitForTimeout(2000);
const J=async u=>await pg.evaluate(async(x)=>{try{const r=await fetch(x,{headers:{'Accept':'application/json','X-Requested-With':'XMLHttpRequest'}});return await r.json();}catch(e){return null;}},u);
const albero=[];
for(let ramo=1; ramo<=52; ramo++){
  const g=await J('/api/v1/gruppi-rami/'+ramo);
  const cats=g&&g.results?Object.values(g.results):[];
  if(!cats.length) continue;
  const nodo={ramo, categorie:[]};
  for(const c of cats){
    const p=await J('/api/v1/professioni/?id_gruppo='+c.id+'&id_ramo='+ramo);
    const prof=(p&&p.professioni)?p.professioni.map(x=>({id:x.id,nome:x.nome,url:x.id_url})):[];
    nodo.categorie.push({id:c.id,nome:c.nome_gruppo,professioni:prof});
  }
  albero.push(nodo);
  console.error('ramo '+ramo+': '+nodo.categorie.length+' categorie');
}
console.log('###ALBERO###');
console.log(JSON.stringify(albero));
console.log('###FINE###');
const tot=albero.reduce((a,r)=>a+r.categorie.length,0);
const totp=albero.reduce((a,r)=>a+r.categorie.reduce((x,c)=>x+c.professioni.length,0),0);
console.log('RIEPILOGO: rami con categorie='+albero.length+' categorie='+tot+' professioni='+totp);
await b.close();
JS
bash -c 'set -a; . /opt/withus-backend/server/.env 2>/dev/null; set +a; exec node "$0"' "$D/rc-albero.mjs" 2>/dev/null | tail -6
echo "FINE."
