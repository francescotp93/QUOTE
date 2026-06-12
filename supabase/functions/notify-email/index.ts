// ============================================================================
//  QUOTO — Edge Function "notify-email"
//  Invia email automatiche sugli eventi del flusso preventivo/polizza.
//  Provider: Resend (https://resend.com). Deploy: supabase functions deploy notify-email
//  Secrets richiesti: RESEND_API_KEY  (e opzionali EMAIL_FROM, APP_URL)
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL    = Deno.env.get("APP_URL")    || "https://francescotp93.github.io/QUOTE/";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "QUOTO <onboarding@resend.dev>";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";

function wrap(title: string, body: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e6e8f0;border-radius:14px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#3b5bfd,#2a45e0);color:#fff;padding:18px 22px;font-size:18px;font-weight:700">⚡ QUOTO</div>
    <div style="padding:22px 24px;color:#2b3346;font-size:15px;line-height:1.55">
      <h2 style="margin:0 0 12px;font-size:18px;color:#1d2740">${title}</h2>
      ${body}
      <div style="margin-top:22px"><a href="${APP_URL}" style="display:inline-block;background:#3b5bfd;color:#fff;text-decoration:none;padding:11px 22px;border-radius:10px;font-weight:700">Apri QUOTO</a></div>
    </div>
    <div style="padding:14px 24px;background:#f8f9fc;color:#8b93a7;font-size:12px">Notifica automatica del portale QUOTO. Non rispondere a questa email.</div>
  </div>`;
}

async function sendEmail(to: string[], subject: string, html: string) {
  if (!RESEND_KEY) throw new Error("RESEND_API_KEY non configurata");
  const recipients = [...new Set(to.filter(Boolean))];
  if (!recipients.length) return { skipped: true };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: recipients, subject, html }),
  });
  if (!res.ok) throw new Error("Resend: " + (await res.text()));
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { event, preventivoId } = await req.json();
    if (!event || !preventivoId) throw new Error("event e preventivoId obbligatori");

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: prev } = await db.from("quote_preventivi")
      .select("id, prodotto, cliente, premio, creato_da, creato_nome").eq("id", preventivoId).single();
    if (!prev) throw new Error("preventivo non trovato");

    const prodotto = prev.prodotto || "Preventivo";
    const cliente  = prev.cliente || "—";
    const riga = `<p><b>Prodotto:</b> ${prodotto}<br><b>Cliente:</b> ${cliente}${prev.premio != null ? `<br><b>Premio:</b> € ${Number(prev.premio).toFixed(2)}` : ""}</p>`;

    let to: string[] = [];
    let subject = "";
    let html = "";

    if (event === "nuova_richiesta") {
      const { data: admins } = await db.from("quote_utenti").select("email").eq("ruolo", "admin").eq("attivo", true);
      to = (admins || []).map((a: any) => a.email);
      subject = "Nuova richiesta di preventivo — " + prodotto;
      html = wrap("Nuova richiesta di preventivo", `<p>Il collaboratore <b>${prev.creato_nome || "—"}</b> ha inviato una nuova richiesta da esaminare.</p>${riga}`);
    } else if (event === "quotato") {
      const { data: u } = await db.from("quote_utenti").select("email").eq("id", prev.creato_da).single();
      to = u?.email ? [u.email] : [];
      subject = "La tua proposta è pronta — " + prodotto;
      html = wrap("Proposta pronta da emettere", `<p>L'operatore ha allegato la proposta con quotazione per la tua richiesta. Puoi procedere con l'emissione dallo Storico.</p>${riga}`);
    } else if (event === "emessa") {
      const { data: admins } = await db.from("quote_utenti").select("email").eq("ruolo", "admin").eq("attivo", true);
      to = (admins || []).map((a: any) => a.email);
      subject = "Polizza emessa — " + prodotto;
      html = wrap("Polizza emessa", `<p><b>${prev.creato_nome || "—"}</b> ha emesso la polizza.</p>${riga}`);
    } else {
      throw new Error("evento sconosciuto: " + event);
    }

    const result = await sendEmail(to, subject, html);
    return new Response(JSON.stringify({ ok: true, result }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
