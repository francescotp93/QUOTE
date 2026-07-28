#!/usr/bin/env bash
# RC POLIZZA — copia PROCEDIMENTO: flusso "nuovo preventivo" per ramo (read-only, niente invii)
set -u
D=/opt/withus-backend/scraper/italiana
cat > "$D/rc-flow.mjs" <<'JS'
import crypto from 'crypto'; import fs from 'fs';
import { chromium } from 'playwright';
const KEY=crypto.createHash('sha256').update(process.env.FONTI_SECRET||'').digest();
const dec=b=>{try{const r=Buffer.from(String(b).slice(3),'base64');const d=crypto.createDecipheriv('aes-256-gcm',KEY,r.subarray(0,12));d.setAuthTag(r.subarray(12,28));return Buffer.concat([d.update(r.subarray(28)),d.final()]).toString('utf8');}catch{return null;}};
const s=JSON.parse(fs.readFileSync('/opt/withus-backend/server/fonti.store.json','utf8'));
const f={...s,...(s.__custom||{})}['c-rc-polizza'];
const b=await chromium.launch({args:['--no-sandbox']});
const pg=await (await b.newContext()).newPage();
const API=new Set();
pg.on('request',r=>{const u=r.url();if(/\/api\/|preventiv|ramo|prodott|tariff|questionar|calcol|quot/i.test(u)&&!/aggiornaRichieste/.test(u))API.add(r.method()+' '+u.replace('https://crm.rcpolizza.it','').split('?')[0]);});
await pg.goto('https://crm.rcpolizza.it/login',{waitUntil:'domcontentloaded',timeout:45000});
await pg.fill('input[name=username]',dec(f.username)); await pg.fill('input[type=password]',dec(f.password));
await pg.keyboard.press('Enter'); await pg.waitForTimeout(6000);

console.log('════ NUOVO PREVENTIVO: struttura del wizard ════');
await pg.goto('https://crm.rcpolizza.it/preventivi/nuovo',{waitUntil:'networkidle',timeout:40000}).catch(()=>{});
await pg.waitForTimeout(3000);
const w=await pg.evaluate(()=>{
  const steps=[...document.querySelectorAll('.step,.wizard-step,.nav-tabs li,[class*=step]')].map(x=>(x.innerText||'').trim().replace(/\s+/g,' ').slice(0,30)).filter(Boolean).slice(0,12);
  const labels=[...document.querySelectorAll('label')].map(x=>(x.innerText||'').trim().replace(/\s+/g,' ').slice(0,32)).filter(Boolean).slice(0,30);
  const selects=[...document.querySelectorAll('select')].map(s=>(s.name||s.id||'').slice(0,26)).filter(Boolean);
  const btns=[...document.querySelectorAll('button,a.btn,input[type=submit]')].map(x=>(x.innerText||x.value||'').trim().slice(0,22)).filter(Boolean).slice(0,15);
  return {steps:[...new Set(steps)],labels:[...new Set(labels)],selects:[...new Set(selects)],btns:[...new Set(btns)]};
});
console.log('  STEP:', w.steps.join(' → ')||'(nessuno visibile)');
console.log('  SELECT:', w.selects.join(', '));
console.log('  LABEL:', w.labels.join(' · '));
console.log('  BOTTONI:', w.btns.join(' | '));

console.log('════ Scelta RAMO = RC PROFESSIONALE (senza inviare) ════');
const scelto=await pg.evaluate(()=>{
  const s=[...document.querySelectorAll('select')].find(x=>/ramo/i.test(x.name||x.id||''));
  if(!s)return 'nessun select ramo';
  const opt=[...s.options].find(o=>/RC PROFESSIONALE/i.test(o.text||''));
  if(!opt)return 'ramo RC PROF non trovato';
  s.value=opt.value; s.dispatchEvent(new Event('change',{bubbles:true}));
  return 'selezionato: '+opt.text.trim()+' (val='+opt.value+')';
});
console.log('  '+scelto);
await pg.waitForTimeout(3500);
const after=await pg.evaluate(()=>{
  const sel=[...document.querySelectorAll('select')].map(s=>({n:(s.name||s.id||'').slice(0,24),opts:[...s.options].slice(0,8).map(o=>(o.text||'').trim().slice(0,22))}));
  const lab=[...document.querySelectorAll('label')].map(x=>(x.innerText||'').trim().slice(0,30)).filter(Boolean).slice(0,20);
  return {sel,lab:[...new Set(lab)]};
});
console.log('  dopo scelta ramo — select:');
after.sel.slice(0,10).forEach(s=>console.log('    ['+s.n+'] '+s.opts.join(', ').slice(0,120)));
console.log('  campi comparsi:', after.lab.join(' · ').slice(0,300));

console.log('════ API osservate nel flusso ════');
[...API].slice(0,20).forEach(a=>console.log('  '+a));
await b.close();
JS
bash -c 'set -a; . /opt/withus-backend/server/.env 2>/dev/null; set +a; exec node "$0"' "$D/rc-flow.mjs" 2>&1 | tail -55
echo "FINE."
