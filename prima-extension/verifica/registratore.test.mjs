// ═══════════════════════════════════════════════════════════════════════════════
//  IL REGISTRATORE — cosa si tiene, cosa si butta, cosa si maschera
//
//  Sono le tre regole di registratore.js, provate senza Chrome: se una salta,
//  la cattura o e' piena di rumore, o registra la navigazione dell'agente fuori
//  dai portali, o si porta a casa una password. Nessuna delle tre si vede a
//  occhio guardando il popup.
//
//      node prima-extension/verifica/registratore.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const R = createRequire(import.meta.url)(path.join(QUI, '..', 'registratore.js'));

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

prova('gli otto portali sono quelli di IAM, e ognuno si riconosce dal suo dominio', () => {
  const ids = R.PORTALI.map(p => p.id).sort().join(',');
  deve(ids === '24h,allianz,axa,groupama,hdi,italiana,prima,sara', 'i portali non sono gli otto chiesti: ' + ids);
  const casi = [['intermediari.prima.it', 'prima'], ['covers-api.prima.it', 'prima'], ['accedi.groupama.it', 'groupama'], ['portale.plurima.net', 'italiana'],
    ['access.hdia.it', 'hdi'], ['amlogin.allianz.it', 'allianz'], ['portaleagenzie.allianz.it', 'allianz'], ['ais.axa-italia.it', 'axa'],
    ['www.24hassistance.com', '24h'], ['login.24hassistance.com', '24h'], ['www.sara.it', 'sara']];
  for (const [h, id] of casi) deve(R.portaleDi(h) === id, h + ' → ' + R.portaleDi(h) + ', atteso ' + id);
  return casi.length + ' host riconosciuti';
});

prova('un dominio che somiglia non passa: «notprima.it» non e\' Prima', () => {
  for (const h of ['notprima.it', 'prima.it.evil.com', 'google.com', 'withusassicurazioni.it', ''])
    deve(R.portaleDi(h) === null, h + ' viene scambiato per un portale');
  return 'cinque estranei restano estranei';
});

prova('si tiene la chiamata del portale registrato, non il resto della navigazione', () => {
  const pagina = 'https://intermediari.prima.it/preventivi';
  deve(R.daTenere('https://intermediari.prima.it/api/graphql', 'prima', pagina), 'la chiamata API del portale non si tiene');
  deve(R.daTenere('/api/graphql', 'prima', pagina), 'un indirizzo relativo non si tiene');
  deve(R.daTenere('https://covers-api.prima.it/graphql', 'prima', pagina), 'il sottodominio delle API non si tiene');
  deve(!R.daTenere('https://www.google-analytics.com/collect', 'prima', pagina), 'il tracciatore entra nella cattura');
  deve(!R.daTenere('https://intermediari.prima.it/logo.png', 'prima', pagina), 'un\'immagine entra nella cattura');
  deve(!R.daTenere('https://accedi.groupama.it/x', 'prima', pagina), 'registrando Prima si tiene una chiamata a Groupama');
  deve(!R.daTenere('https://mail.google.com/x', 'prima', pagina), 'la posta dell\'agente entra nella cattura');
  return 'portale si\', rumore e altri no';
});

prova('password, token e cookie non partono mai in chiaro', () => {
  const h = R.mascheraIntestazioni({ 'Authorization': 'Bearer abc.def.ghi', 'Cookie': 'ci_session=xyz', 'Content-Type': 'application/json', 'X-Api-Key': 'k1', 'X-CSRF-Token': 't' });
  deve(h['Authorization'] === R.MASCHERA, 'il Bearer parte in chiaro');
  deve(h['Cookie'] === R.MASCHERA, 'il cookie parte in chiaro');
  deve(h['X-Api-Key'] === R.MASCHERA && h['X-CSRF-Token'] === R.MASCHERA, 'una chiave API o un CSRF parte in chiaro');
  deve(h['Content-Type'] === 'application/json', 'ha mascherato anche il content-type, che serve a leggere la cattura');
  const j = R.mascheraCorpo('{"username":"DIGITALE","password":"segreta!","otp":"123456","targa":"GY263BY"}');
  deve(!/segreta!/.test(j) && !/123456/.test(j), 'password o OTP in chiaro nel JSON: ' + j);
  deve(/"targa":"GY263BY"/.test(j) && /"username":"DIGITALE"/.test(j), 'ha mascherato anche targa o utente, che servono a capire il portale: ' + j);
  const f = R.mascheraCorpo('user=DIGITALE.WITHUS&passwd=abc123&ci_csrf_token=zzz&targa=GY263BY');
  deve(!/abc123/.test(f) && !/zzz/.test(f), 'password o CSRF in chiaro nel form: ' + f);
  deve(/targa=GY263BY/.test(f), 'ha mascherato la targa nel form: ' + f);
  return 'segreti mascherati, dati del preventivo intatti';
});

prova('una chiamata salvata ha sempre la stessa forma, gia\' mascherata e ritagliata', () => {
  const c = R.nuovaChiamata({ t: 12, via: 'xhr', metodo: 'post', url: 'https://accedi.groupama.it/pda/login', intestazioni: { Cookie: 'a=b' },
    corpo: 'user=x&password=y', stato: 200, tipo: 'application/json', risposta: '{"token":"t0k","ok":true}' + 'x'.repeat(30000), ms: 80, pagina: 'https://accedi.groupama.it/' });
  deve(c.metodo === 'POST' && c.portale === 'groupama', 'metodo o portale non normalizzati');
  deve(c.richiesta.intestazioni.Cookie === R.MASCHERA, 'il cookie e\' passato');
  deve(/password=«mascherato»/.test(c.richiesta.corpo), 'la password e\' passata nel corpo');
  deve(/"token":"«mascherato»"/.test(c.risposta), 'il token nella risposta e\' passato');
  deve(/ritagliato: 3\d{4} caratteri/.test(c.risposta) && c.risposta.length < 21000, 'la risposta non e\' stata ritagliata');
  const vuota = R.nuovaChiamata({});
  deve(vuota.metodo === 'GET' && vuota.stato === null && vuota.portale === null, 'una chiamata senza dati non ha valori di riserva sicuri');
  return 'forma fissa, ritaglio a 20k';
});

prova('il riassunto conta per portale, metodo e stato', () => {
  const r = R.riassunto([R.nuovaChiamata({ url: 'https://a.prima.it/x', metodo: 'GET', stato: 200 }), R.nuovaChiamata({ url: 'https://a.prima.it/y', metodo: 'POST', stato: 500 }), null]);
  deve(r.n === 2 && r.portali.prima === 2 && r.metodi.GET === 1 && r.metodi.POST === 1 && r.stati['500'] === 1, 'riassunto sbagliato: ' + JSON.stringify(r));
  return '2 chiamate, contate giuste';
});

let ko = 0;
console.log('\nREGISTRATORE — cosa si tiene e cosa si maschera');
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n + (m ? ' — ' + m : '') : '  X   ' + n + '\n      ' + m); if (!ok) ko++; }
console.log(`\nREGISTRATORE: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
