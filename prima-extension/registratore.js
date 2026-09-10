// ─────────────────────────────────────────────────────────────────────────────
//  WITH US · CONNETTORE — LA PARTE CHE SI PUO' PROVARE SENZA CHROME
//
//  PERCHE' QUESTO FILE ESISTE.
//  Registrare le chiamate di un portale e' facile; registrarle BENE vuol dire
//  tre cose che si possono sbagliare in silenzio:
//    1. registrare SOLO i portali che ci interessano — «solo i domini che ci
//       servono» (Francesco, 10/09/2026) — e non il resto della navigazione;
//    2. buttare via il rumore (immagini, font, tracciatori) che riempirebbe la
//       cattura senza dire niente della logica del portale;
//    3. NON portarsi a casa password, cookie e token: la cattura serve a capire
//       come parla il portale, non a poterci rientrare al posto dell'agente.
//  Sono tre regole di puro testo: stanno qui, in un file senza browser, e le
//  prove in verifica/registratore.test.mjs le tengono ferme.
//
//  Gira in due mondi: nella pagina (window.__WU_REG) e in Node (module.exports).
// ─────────────────────────────────────────────────────────────────────────────
(function (radice) {
  'use strict';

  /* GLI OTTO PORTALI. Sono quelli gia' presenti in IAM, e sono gli unici su cui
     l'estensione gira: il manifest li dichiara uno per uno e Chrome non la fa
     partire altrove. L'elenco qui serve a dire A QUALE portale appartiene una
     chiamata (le API stanno spesso su un sottodominio diverso dalla pagina). */
  var PORTALI = [
    { id: 'italiana', nome: 'Italiana (Plurima)',        domini: ['plurima.net'] },
    { id: 'hdi',      nome: 'HDI',                        domini: ['hdia.it', 'hdi.it'] },
    { id: 'allianz',  nome: 'Allianz',                    domini: ['allianz.it'] },
    { id: 'prima',    nome: 'Prima',                      domini: ['prima.it'] },
    { id: 'groupama', nome: 'Groupama',                   domini: ['groupama.it'] },
    { id: 'axa',      nome: 'AXA',                        domini: ['axa-italia.it', 'axa.it'] },
    { id: 'sara',     nome: 'Sara Assicurazioni',         domini: ['sara.it'] },
    { id: '24h',      nome: '24H Assistance (Moto Platinum)', domini: ['24hassistance.com'] },
  ];

  function hostDi(url, base) {
    try { return new URL(String(url), base || 'https://x.invalid').hostname.toLowerCase(); } catch (e) { return ''; }
  }
  /* A quale portale appartiene un host: «api.groupama.it» → groupama.
     Si confronta per suffisso con il punto davanti, cosi' «notprima.it» non
     passa per Prima. */
  function portaleDi(host) {
    var h = String(host || '').toLowerCase();
    for (var i = 0; i < PORTALI.length; i++) {
      var d = PORTALI[i].domini;
      for (var k = 0; k < d.length; k++) if (h === d[k] || h.slice(-(d[k].length + 1)) === '.' + d[k]) return PORTALI[i].id;
    }
    return null;
  }
  function nomePortale(id) {
    for (var i = 0; i < PORTALI.length; i++) if (PORTALI[i].id === id) return PORTALI[i].nome;
    return id || '';
  }

  /* IL RUMORE: quello che non dice niente della logica del portale. */
  var RUMORE = /googletagmanager|google-analytics|googleapis\.com\/(?!.*json)|gstatic|recaptcha|doubleclick|hotjar|fullstory|mouseflow|clarity\.ms|optimizely|segment\.(io|com)|facebook\.(com|net)|fbcdn|onetrust|cookielaw|quantserve|scorecardresearch|newrelic|nr-data|sentry\.io|datadoghq|cloudflareinsights|\.(png|jpe?g|gif|svg|webp|ico|css|woff2?|ttf|eot|otf|map|mp4|mp3)(\?|$)/i;
  function eRumore(url) { return RUMORE.test(String(url || '')); }

  /* Una chiamata si tiene se: non e' rumore, e appartiene al portale che si
     sta registrando oppure alla stessa origine della pagina. Il resto della
     navigazione dell'agente non ci riguarda. */
  function daTenere(url, portale, originePagina) {
    if (!url || eRumore(url)) return false;
    var h = hostDi(url, originePagina);
    if (!h) return false;
    if (portale && portaleDi(h) === portale) return true;
    try { return !!originePagina && new URL(originePagina).hostname.toLowerCase() === h; } catch (e) { return false; }
  }

  /* I SEGRETI. Le intestazioni che portano una sessione si tengono per NOME
     (si vuole sapere che il portale usa un Bearer) ma non per valore. */
  var INTESTAZIONI_SEGRETE = /^(authorization|cookie|set-cookie|x-api-key|x-auth[-\w]*|x-csrf[-\w]*|x-xsrf[-\w]*|proxy-authorization)$|token|secret|session/i;
  var CHIAVI_SEGRETE = /pass(w(or)?d)?|pwd|secret|otp|pin\b|token|csrf|xsrf|session|authorization|api[_-]?key/i;
  var MASCHERA = '«mascherato»';

  function mascheraIntestazioni(h) {
    var out = {};
    if (!h) return out;
    var k;
    for (k in h) if (Object.prototype.hasOwnProperty.call(h, k)) out[k] = INTESTAZIONI_SEGRETE.test(k) ? MASCHERA : String(h[k]);
    return out;
  }

  /* Il corpo si maschera per CHIAVE: «"password":"abc"» diventa
     «"password":"«mascherato»"», e lo stesso in forma x-www-form-urlencoded
     («passwd=abc»). Il resto del corpo resta com'e': targhe, codici fiscali e
     date servono a capire DOVE il portale li vuole. */
  function mascheraCorpo(txt) {
    var s = String(txt == null ? '' : txt);
    if (!s) return s;
    s = s.replace(/("([^"\\]|\\.)*")\s*:\s*"([^"\\]|\\.)*"/g, function (tutto, chiave) {
      return CHIAVI_SEGRETE.test(chiave) ? chiave + ':"' + MASCHERA + '"' : tutto;
    });
    s = s.replace(/(^|[&?])([^=&?#]+)=([^&#]*)/g, function (tutto, sep, chiave, valore) {
      var nome = ''; try { nome = decodeURIComponent(chiave); } catch (e) { nome = chiave; }
      return CHIAVI_SEGRETE.test(nome) ? sep + chiave + '=' + MASCHERA : tutto;
    });
    return s;
  }

  function ritaglia(txt, max) {
    var s = String(txt == null ? '' : txt);
    max = max || 20000;
    return s.length > max ? s.slice(0, max) + '\n…[ritagliato: ' + s.length + ' caratteri]' : s;
  }

  /* Una chiamata come la si salva: sempre la stessa forma, gia' mascherata e
     gia' ritagliata, cosi' chi la legge dopo non deve chiedersi cosa manca. */
  function nuovaChiamata(c) {
    c = c || {};
    return {
      t: typeof c.t === 'number' ? c.t : 0,
      via: c.via || 'fetch',
      metodo: String(c.metodo || 'GET').toUpperCase(),
      url: String(c.url || ''),
      portale: portaleDi(hostDi(c.url)),
      richiesta: { intestazioni: mascheraIntestazioni(c.intestazioni), corpo: ritaglia(mascheraCorpo(c.corpo), 4000) },
      stato: typeof c.stato === 'number' ? c.stato : null,
      tipo: String(c.tipo || ''),
      risposta: ritaglia(mascheraCorpo(c.risposta), 20000),
      ms: typeof c.ms === 'number' ? c.ms : null,
      pagina: String(c.pagina || ''),
    };
  }

  function riassunto(chiamate) {
    var r = { n: 0, portali: {}, metodi: {}, stati: {}, byte: 0 };
    for (var i = 0; i < (chiamate || []).length; i++) {
      var c = chiamate[i]; if (!c) continue;
      r.n++;
      var p = c.portale || 'altro'; r.portali[p] = (r.portali[p] || 0) + 1;
      var m = c.metodo || '?'; r.metodi[m] = (r.metodi[m] || 0) + 1;
      var s = c.stato == null ? 'senza risposta' : String(c.stato); r.stati[s] = (r.stati[s] || 0) + 1;
      r.byte += (c.risposta || '').length + ((c.richiesta && c.richiesta.corpo) || '').length;
    }
    return r;
  }

  var api = { PORTALI: PORTALI, MASCHERA: MASCHERA, hostDi: hostDi, portaleDi: portaleDi, nomePortale: nomePortale, eRumore: eRumore, daTenere: daTenere,
    mascheraIntestazioni: mascheraIntestazioni, mascheraCorpo: mascheraCorpo, ritaglia: ritaglia, nuovaChiamata: nuovaChiamata, riassunto: riassunto };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (radice) radice.__WU_REG = api;
})(typeof window !== 'undefined' ? window : null);
