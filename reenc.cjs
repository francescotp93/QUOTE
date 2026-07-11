const crypto=require("crypto"),fs=require("fs");
const OLD=process.env.OLD_SECRET, NEW=process.env.NEW_SECRET, P=process.argv[2];
const kOld=crypto.createHash("sha256").update(OLD).digest();
const kNew=crypto.createHash("sha256").update(NEW).digest();
function dec(b,K){ if(!b||!String(b).startsWith("v1:"))return null; const r=Buffer.from(String(b).slice(3),"base64"); const d=crypto.createDecipheriv("aes-256-gcm",K,r.subarray(0,12)); d.setAuthTag(r.subarray(12,28)); return Buffer.concat([d.update(r.subarray(28)),d.final()]).toString("utf8"); }
function enc(p,K){ const iv=crypto.randomBytes(12); const c=crypto.createCipheriv("aes-256-gcm",K,iv); const ct=Buffer.concat([c.update(String(p),"utf8"),c.final()]); return "v1:"+Buffer.concat([iv,c.getAuthTag(),ct]).toString("base64"); }
let store; try{ store=JSON.parse(fs.readFileSync(P,"utf8")); }catch(e){ console.error("store illeggibile: "+e.message); process.exit(1); }
let n=0, fail=0;
function walk(o){ for(const k in o){ const v=o[k]; if(typeof v==="string"&&v.startsWith("v1:")){ let plain; try{plain=dec(v,kOld);}catch(e){plain=null;} if(plain===null){fail++;continue;} const nb=enc(plain,kNew); let rt; try{rt=dec(nb,kNew);}catch(e){rt=null;} if(rt!==plain){fail++;continue;} o[k]=nb; n++; } else if(v&&typeof v==="object"){ walk(v);} } }
walk(store);
if(fail>0){ console.error("ABORT: "+fail+" voci non ri-cifrabili (chiave OLD errata?)"); process.exit(1); }
fs.writeFileSync(P+".new", JSON.stringify(store,null,2), {mode:0o600});
console.log("re-encrypted "+n+" valori, 0 errori");
