#!/usr/bin/env bash
# RIMEDIO a un danno causato da noi: approvando l'associato abbiamo cambiato la
# password dell'utenza con cui Francesco entra in IAM. Qui gliene mettiamo una
# nuova e gliela mandiamo PER EMAIL.
#
# PRIVACY: la password NON viene stampata qui. Questo file finisce in un ramo
# del repository, e una password scritta li' resterebbe nella storia per
# sempre. Va solo alla sua casella.
set -u
cd /opt/withus-backend || exit 1

node --input-type=module -e '
import fs from "fs";
import crypto from "crypto";

const env = {};
for (const r of fs.readFileSync("server/.env", "utf8").split(/\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(r);
  if (m) env[m[1]] = m[2].trim().replace(/^["\x27]|["\x27]$/g, "");
}
const URL_SB = (env.SUPABASE_URL || "https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const BREVO = env.BREVO_API_KEY;
const EMAIL = "francesco.oddo199307@gmail.com";
if (!KEY) { console.log("  manca la chiave di servizio: non posso"); process.exit(0); }

// Stessa forma delle provvisorie: niente caratteri che si confondono.
const LET = "ABCDEFGHJKMNPQRSTUVWXYZ", CIF = "23456789", ALF = LET + CIF;
const c = Array.from(crypto.randomBytes(12)).map(b => ALF[b % ALF.length]);
const dove = n => crypto.randomBytes(1)[0] % n;
if (!c.some(x => CIF.includes(x))) c[dove(12)] = CIF[dove(CIF.length)];
if (!c.some(x => LET.includes(x))) c[dove(12)] = LET[dove(LET.length)];
const pw = c.slice(0,4).join("") + "-" + c.slice(4,8).join("") + "-" + c.slice(8,12).join("");

const h = { apikey: KEY, Authorization: "Bearer " + KEY, "content-type": "application/json" };
const r1 = await fetch(URL_SB + "/auth/v1/admin/users?filter=" + encodeURIComponent(EMAIL), { headers: h });
const d1 = await r1.json();
const u = (d1.users || d1 || []).find(x => String(x.email||"").toLowerCase() === EMAIL);
if (!u) { console.log("  utenza non trovata"); process.exit(0); }
console.log("  utenza trovata, ruolo nei metadati:", JSON.stringify((u.user_metadata||{}).ruolo || "(nessuno)"));

const r2 = await fetch(URL_SB + "/auth/v1/admin/users/" + u.id, {
  method: "PUT", headers: h, body: JSON.stringify({ password: pw }),
});
console.log("  password reimpostata:", r2.ok ? "si" : ("NO (" + r2.status + ")"));
if (!r2.ok) process.exit(0);

if (!BREVO) { console.log("  BREVO assente: non posso mandarla per email"); process.exit(0); }
const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e6e8f0;border-radius:14px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#0b1437,#1b2a6b);padding:20px;text-align:center"><img src="https://quoto.withusassicurazioni.it/withus-logo-white.png" alt="With Us" style="height:40px"></div>
  <div style="padding:24px;color:#2b3346;font-size:15px;line-height:1.6">
    <h2 style="margin:0 0 12px;font-size:19px">Accesso ripristinato</h2>
    <p>Approvando la tua iscrizione alla convenzione, il sistema ha cambiato per errore la password dell utenza con cui entri in IAM. Il difetto e stato corretto e non puo ripetersi.</p>
    <p style="margin:16px 0 6px">Ecco una password nuova per rientrare:</p>
    <div style="font-size:24px;font-weight:900;letter-spacing:2px;color:#1b2a6b;background:#eef2ff;border-radius:12px;padding:16px;text-align:center;font-family:monospace">${pw}</div>
    <p style="color:#6b7488;font-size:13.5px">Entra su <b>iam.withusassicurazioni.it</b> e cambiala subito con una tua: questa e passata da unemail.</p>
  </div>
</div>`;
const r3 = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: { "api-key": BREVO, "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify({ sender: { email: env.NOTIFY_FROM || "noreply@withusassicurazioni.it", name: "With Us Assicurazioni" }, to: [{ email: EMAIL }], subject: "Accesso IAM ripristinato", htmlContent: html }),
});
console.log("  email inviata:", r3.ok ? "si -> controlla la posta (anche lo spam)" : ("NO: " + (await r3.text()).slice(0,160)));
'
