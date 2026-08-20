// PONTE IAM -> QUOTO  (il lato server di IAM)
//
// Perche' esiste. IAM e' un sito statico su GitHub Pages: gira tutto nel
// browser, e nel browser un segreto non e' un segreto. L'API di QUOTO si apre
// con una chiave interna, quindi IAM non puo' chiamarla da solo. Questa
// funzione e' il pezzo di server dalla parte di IAM: riceve la chiamata
// dell'operatore (con la sua sessione IAM, gia' verificata da Supabase), ci
// mette la chiave interna e la gira a QUOTO.
//
// La chiave NON sta qui dentro: sta in ponte_segreti, la stessa riga che legge
// il backend di QUOTO. Nessuno la digita, nessuno la incolla.
//
// CHI HA PREMUTO. Le rotte che toccano le credenziali dei portali vogliono
// X-Operatore. La scrive QUESTA funzione, dal token gia' verificato, non il
// browser: una firma scritta dal browser la falsifica chiunque.
//
// CHI PUO' FARE COSA. Quotare e' il mestiere di tutti: basta un utente IAM
// attivo. Il Pannello Fonti no: e' roba da top_master, come in QUOTO. Il ruolo
// si legge da iam_utenti, non dal token: un ruolo scritto nel token resterebbe
// valido fino alla scadenza anche dopo aver tolto i permessi a qualcuno.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const QUOTO = (Deno.env.get("QUOTO_API_BASE") || "https://api.withusassicurazioni.it").replace(/\/+$/, "");
const SB_URL = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

/* IAM sta su un altro dominio: senza questi il browser non parte nemmeno. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const ERRORI = ["PROVIDER_UNAVAILABLE", "INVALID_INPUT", "TIMEOUT", "AUTH_FAILED", "NOT_FOUND", "FORBIDDEN"];

function ko(stato: number, codice: string, messaggio: string) {
  return new Response(JSON.stringify({
    success: false,
    error_code: ERRORI.includes(codice) ? codice : "PROVIDER_UNAVAILABLE",
    message: messaggio,
    provider: null,
    generato_il: new Date().toISOString(),
  }), { status: stato, headers: { ...CORS, "Content-Type": "application/json" } });
}

/* Le rotte che toccano le credenziali dei portali. Elencate una per una e non
   dedotte dal metodo: POST /fonti/:id/accedi e' una POST ma non scrive niente. */
function eScrittura(metodo: string, p: string): boolean {
  const m = String(metodo || "").toUpperCase();
  if (!p.startsWith("/fonti")) return false;
  const coda = p.slice("/fonti".length) || "/";
  if (m === "POST" && (coda === "/" || coda === "")) return true;
  if ((m === "PUT" || m === "DELETE") && /^\/[^/]+$/.test(coda)) return true;
  if ((m === "POST" || m === "DELETE") && /^\/[^/]+\/credenziali$/.test(coda)) return true;
  return false;
}

/* TUTTI I CONTROLLI GUARDANO LA FORMA NORMALIZZATA, MAI QUELLA GREZZA.
   Il 20/08/2026 una revisione avversariale ha trovato che «/Fonti» con la
   maiuscola saltava il controllo del ruolo (startsWith e' sensibile alle
   maiuscole) e «/fonti/x/credenziali/» con la barra finale saltava
   X-Operatore. Le due cose insieme: un utente IAM qualunque arrivava al
   Pannello Fonti e ci scriveva dentro una password senza lasciare un nome.
   Da qui in poi si decide su questa, e si inoltra l'originale. */
function normalizza(p: string): string {
  const s = String(p || "").toLowerCase();
  return s.length > 1 ? (s.replace(/\/+$/, "") || "/") : s;
}

/* Il segreto del ponte: si legge con il service_role, che questa funzione ha
   per costruzione. Si tiene da parte per qualche minuto: chiederlo a ogni
   chiamata aggiungerebbe un viaggio di rete a ogni preventivo. */
let chiave = "";
let letta = 0;
/* Il si'/no del semaforo per chi non e' un utente vero, tenuto da parte mezzo
   minuto: vedi la rotta /_ponte. */
let ULTIMO_PONTE: { quando: number; pronto: boolean } | null = null;
async function chiaveInterna(): Promise<string> {
  if (chiave && Date.now() - letta < 5 * 60 * 1000) return chiave;
  const r = await fetch(SB_URL + "/rest/v1/ponte_segreti?select=valore&nome=eq.internal_api_key", {
    headers: { apikey: SB_SERVICE, Authorization: "Bearer " + SB_SERVICE, Accept: "application/json" },
  });
  if (!r.ok) throw new Error("ponte_segreti: HTTP " + r.status);
  const righe = await r.json();
  const v = Array.isArray(righe) && righe[0] && righe[0].valore;
  if (!v) throw new Error("la chiave del ponte non c'e' in ponte_segreti");
  chiave = String(v); letta = Date.now();
  return chiave;
}

async function impronta(k: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(k)));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

/* Chi sta chiamando. Il token l'ha gia' verificato il portone di Supabase
   (verify_jwt), quindi qui basta leggerlo; il ruolo pero' si va a prendere in
   tabella, che e' l'unico posto aggiornato. */
async function chiChiama(auth: string) {
  const pezzo = (auth || "").replace(/^Bearer\s+/i, "").split(".")[1];
  if (!pezzo) return null;
  let dati: Record<string, unknown>;
  try {
    dati = JSON.parse(atob(pezzo.replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return null; }
  const id = String(dati.sub || "");
  if (!id) return null;
  const r = await fetch(SB_URL + "/rest/v1/iam_utenti?select=id,email,nome,cognome,ruolo,attivo,accesso_iam&id=eq." + encodeURIComponent(id), {
    headers: { apikey: SB_SERVICE, Authorization: "Bearer " + SB_SERVICE, Accept: "application/json" },
  });
  if (!r.ok) return null;
  const righe = await r.json();
  return (Array.isArray(righe) && righe[0]) || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  /* Il percorso arriva come /quoto/<resto>: si toglie il nome della funzione e
     quello che resta e' la rotta dell'API v1. */
  const url = new URL(req.url);
  const percorso = url.pathname.replace(/^\/+/, "").split("/").slice(1).join("/");
  const p = "/" + percorso;
  const pn = normalizza(p);   // su questa si decide; p si inoltra

  if (!SB_URL || !SB_SERVICE) return ko(500, "PROVIDER_UNAVAILABLE", "Il ponte non e' configurato.");

  /* Chi chiama lo si guarda PRIMA, anche per il semaforo "il ponte e' aperto?":
     quanto quella rotta racconta dipende da chi la sta guardando. */
  const utente = await chiChiama(req.headers.get("Authorization") || "");
  const attivo = !!utente && utente.attivo !== false && utente.accesso_iam !== false;

  if (pn === "/_ponte") {
    /* Senza una persona dietro si risponde SOLO si'/no. La chiave anon di IAM
       e' pubblica — sta in config.js, che chiunque puo' leggere — quindi tutto
       cio' che questa rotta racconta a chi non e' un utente vero e' materiale
       regalato: quante fonti abbiamo, quanto costa una polizza, l'impronta
       della chiave. Il si'/no invece non dice niente che non si veda gia'
       provando a usare il programma, e serve a sapere da fuori se il ponte e'
       in piedi. Tenuto da parte mezzo minuto, cosi' non diventa un modo di far
       lavorare QUOTO a raffica. (20/08/2026) */
    if (!attivo) {
      const adesso = Date.now();
      if (!ULTIMO_PONTE || adesso - ULTIMO_PONTE.quando > 30 * 1000) {
        let su = false;
        try {
          const k = await chiaveInterna();
          const r = await fetch(QUOTO + "/api/v1/products", {
            headers: { "X-Internal-Key": k }, signal: AbortSignal.timeout(15000),
          });
          su = r.ok;
        } catch { su = false; }
        ULTIMO_PONTE = { quando: adesso, pronto: su };
      }
      return new Response(JSON.stringify({ success: true, pronto: ULTIMO_PONTE.pronto }),
        { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    /* La prova profonda fa una quotazione vera e legge l'elenco fonti: e' roba
       da chi il Pannello Fonti lo puo' gia' vedere. */
    if (url.searchParams.get("prova") === "1" && utente.ruolo !== "top_master") {
      return ko(403, "FORBIDDEN", "La prova profonda del ponte e' riservata.");
    }
    let imp: string | null = null, avanti: number | null = null, quanti: number | null = null, motivo = "";
    let preventivo: unknown = undefined, fonti: unknown = undefined;
    try {
      const k = await chiaveInterna();
      imp = await impronta(k);
      const r = await fetch(QUOTO + "/api/v1/products", {
        headers: { "X-Internal-Key": k }, signal: AbortSignal.timeout(15000),
      });
      avanti = r.status;
      if (r.ok) { const d = await r.json(); quanti = Array.isArray(d.prodotti) ? d.prodotti.length : null; }

      /* «Il ponte e' aperto» e «da qui esce un preventivo» sono due cose
         diverse: la prima e' una porta, la seconda e' il mestiere. Con
         ?prova=1 si fa una quotazione VERA, dall'inizio alla fine, su un
         prodotto a tariffa - nessun portale, nessuna credenziale, niente da
         disturbare - e si guarda il numero che esce. */
      if (url.searchParams.get("prova") === "1" && r.ok) {
        const intest = { "X-Internal-Key": k, "Content-Type": "application/json" };
        const via = await fetch(QUOTO + "/api/v1/quote/salute", {
          method: "POST", headers: intest,
          body: JSON.stringify({ tipo: "attiva", livello: "plus", comp: "single", fraz: "annuale" }),
          signal: AbortSignal.timeout(15000),
        });
        const avvio = await via.json().catch(() => ({}));
        let esito = avvio;
        for (let i = 0; i < 20 && avvio.quote_id && esito.stato === "in_corso"; i++) {
          const g = await fetch(QUOTO + "/api/v1/quote/" + avvio.quote_id, {
            headers: { "X-Internal-Key": k }, signal: AbortSignal.timeout(15000),
          });
          esito = await g.json().catch(() => ({}));
          if (esito.stato !== "in_corso") break;
          await new Promise((s) => setTimeout(s, 250));
        }
        const primo = (esito.risultati || [])[0] || {};
        preventivo = {
          avvio: via.status, stato: esito.stato || null,
          compagnia: primo.compagnia || null, premio_annuo: primo.premio_annuo ?? null,
          garanzie: Array.isArray(primo.garanzie) ? primo.garanzie.length : null,
        };

        const f = await fetch(QUOTO + "/api/v1/fonti", {
          headers: { "X-Internal-Key": k }, signal: AbortSignal.timeout(25000),
        });
        const df = await f.json().catch(() => ({}));
        fonti = { risposta: f.status, quante: Array.isArray(df.fonti) ? df.fonti.length : null };
      }
    } catch (e) { motivo = String((e as Error).message || e); }
    const p2 = preventivo as { stato?: string; premio_annuo?: number } | undefined;
    return new Response(JSON.stringify({
      success: true,
      chiave_letta: !!imp, impronta: imp,
      quoto: QUOTO, risposta_quoto: avanti, prodotti: quanti,
      pronto: avanti === 200 && (quanti || 0) > 0,
      preventivo, fonti,
      /* Con ?prova=1 il semaforo diventa piu' severo: non basta che la porta
         si apra, deve uscire un premio. */
      quota_davvero: p2 ? (p2.stato === "completo" && (p2.premio_annuo || 0) > 0) : undefined,
      motivo: motivo || undefined,
      generato_il: new Date().toISOString(),
    }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  if (!utente) return ko(401, "AUTH_FAILED", "Sessione non riconosciuta.");
  if (!attivo) return ko(403, "FORBIDDEN", "Utenza non attiva su IAM.");

  /* Il Pannello Fonti e' riservato, come in QUOTO. Il confronto va fatto sulla
     forma normalizzata: con startsWith su quella grezza, «/Fonti» passava. */
  if (pn.startsWith("/fonti") && utente.ruolo !== "top_master") {
    return ko(403, "FORBIDDEN", "Il Pannello Fonti e' riservato.");
  }

  let interna: string;
  try { interna = await chiaveInterna(); }
  catch (e) {
    console.log(JSON.stringify({ evento: "chiave_non_letta", motivo: String((e as Error).message) }));
    return ko(503, "PROVIDER_UNAVAILABLE", "Il ponte verso QUOTO non e' pronto: riprova fra un minuto.");
  }

  const intestazioni: Record<string, string> = {
    "X-Internal-Key": interna,
    "Content-Type": req.headers.get("Content-Type") || "application/json",
  };
  /* La firma di chi ha premuto: dal token verificato, mai dal browser. E si
     decide sulla forma normalizzata, altrimenti una barra finale basta a farla
     sparire. */
  if (eScrittura(req.method, pn)) {
    intestazioni["X-Operatore"] = [utente.id, utente.email].filter(Boolean).join(" ");
  }

  const corpo = ["GET", "HEAD", "OPTIONS"].includes(req.method) ? undefined : await req.text();

  try {
    const risposta = await fetch(QUOTO + "/api/v1" + p + url.search, {
      method: req.method, headers: intestazioni, body: corpo,
      signal: AbortSignal.timeout(30000),
    });
    const testo = await risposta.text();
    console.log(JSON.stringify({
      evento: "ponte", rotta: p, metodo: req.method, esito: risposta.status,
      operatore: utente.email, quando: new Date().toISOString(),
    }));
    return new Response(testo, {
      status: risposta.status,
      headers: { ...CORS, "Content-Type": risposta.headers.get("Content-Type") || "application/json" },
    });
  } catch (e) {
    const scaduto = String((e as Error).name || "").includes("Timeout");
    return ko(scaduto ? 504 : 502, scaduto ? "TIMEOUT" : "PROVIDER_UNAVAILABLE",
      scaduto ? "QUOTO non ha risposto in tempo." : "QUOTO non e' raggiungibile.");
  }
});
