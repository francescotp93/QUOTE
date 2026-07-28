#!/usr/bin/env bash
# RC POLIZZA — ricognizione read-only (autorizzata da Francesco).
# Legge le credenziali che Francesco ha salvato nel Pannello Fonti. Nessun segreto stampato.
set -u
cd /opt/withus-backend/scraper/italiana || { echo "cartella scraper assente"; exit 1; }
cat > /tmp/rc-probe.mjs <<'JS'
import crypto from 'crypto'; import fs from 'fs';
import { chromium } from 'playwright';
const SECRET=process.env.FONTI_SECRET||('withus-fonti-'+(process.env.HOSTNAME||'vps')+'-v1');
const KEY=crypto.createHash('sha256').update(SECRET).digest();
const dec=b=>{ if(!b||!String(b).startsWith('v1:'))return null; try{const r=Buffer.from(String(b).slice(3),'base64');const d=crypto.createDecipheriv('aes-256-gcm',KEY,r.subarray(0,12));d.setAuthTag(r.subarray(12,28));return Buffer.concat([d.update(r.subarray(28)),d.final()]).toString('utf8');}catch{return null;} };
const s=JSON.parse(fs.readFileSync('/opt/withus-backend/server/fonti.store.json','utf8'));
const f={...s,...(s.__custom||{})}['c-rc-polizza'];
if(!f){console.log('fonte assente');process.exit(1);}
const u=dec(f.username),p=dec(f.password);
if(!u||!p){console.log('credenziali non decifrabili');process.exit(1);}
console.log('credenziali ok (utente '+u.slice(0,2)+'…)');
const LOGIN=f.url||f.loginUrl||'https://crm.rcpolizza.it/login';
const b=await chromium.launch({args:['--no-sandbox']});
const ctx=await b.newContext(); const pg=await ctx.newPage();
const api=[]; pg.on('request',r=>{ if(/xhr|fetch/.test(r.resourceType())) api.push(r.method()+' '+r.url().split('?')[0]); });
await pg.goto(LOGIN,{waitUntil:'domcontentloaded',timeout:45000});
console.log('login page:', pg.url());
const campi=await pg.evaluate(()=>[...document.querySelectorAll('input,button')].slice(0,12).map(e=>({t:e.tagName.toLowerCase(),ty:e.type||'',n:e.name||'',id:e.id||'',tx:(e.innerText||'').trim().slice(0,18)})));
console.log('campi:',JSON.stringify(campi).slice(0,500));
// compila e invia
const fill=async(sels,val)=>{for(const s of sels){const el=await pg.$(s);if(el){await el.fill(val);return s;}}return null;};
const cu=await fill(['input[type=email]','input[name*=mail i]','input[name*=user i]','input[id*=mail i]','input[id*=user i]','input[type=text]'],u);
const cp=await fill(['input[type=password]','input[name*=pass i]','input[id*=pass i]'],p);
console.log('campi compilati:',cu,cp);
await pg.keyboard.press('Enter').catch(()=>{});
await pg.waitForTimeout(6000);
console.log('DOPO LOGIN url:', pg.url());
const loggato=!/login/i.test(pg.url());
console.log('loggato:',loggato);
if(loggato){
  const menu=await pg.evaluate(()=>[...document.querySelectorAll('a[href]')].map(a=>((a.innerText||'').trim().replace(/\s+/g,' ').slice(0,32))+' -> '+a.getAttribute('href')).filter(x=>x.length>6).slice(0,45));
  console.log('=== MENU/LINK ==='); menu.forEach(m=>console.log('  '+m));
}
console.log('=== API viste al login ==='); [...new Set(api)].slice(0,15).forEach(a=>console.log('  '+a));
await b.close();
JS
env $(systemctl show withus-backend -p Environment --value 2>/dev/null) node /tmp/rc-probe.mjs 2>&1 | tail -70
echo "FINE."
