#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Fotografa le DUE schermate del login Allianz per capire dove si ferma.
#
# Di ogni campo esce SOLO la struttura — tag, id, name, type — e mai il
# contenuto. Il nome utente e' meta' di una credenziale e non deve finire su un
# ramo git nemmeno per una diagnosi, quindi qui i valori si buttano via prima
# che escano dalla macchina, in aggiunta alla ripulitura gia' fatta dal codice.
#
# /logindump naviga soltanto: non manda credenziali.
# /otpdump compila l'utente e avanza: e' il gesto che porta alla seconda
# schermata, ed e' anche l'unico che fa scattare una notifica del portale. Una.
# ─────────────────────────────────────────────────────────────────────────────

echo "### IL RILASCIO E' ARRIVATO? ###"
cd /opt/withus-backend 2>/dev/null && {
  echo "commit: $(git log -1 --format='%h %s' 2>/dev/null)"
  echo "ripulitura attiva: $(grep -c 'ripulisciDump(await page.evaluate' scraper/allianz/quote-service.mjs)"
}

# Tiene solo la struttura dei campi: nessun testo, nessun valore.
solo_struttura() {
  node -e '
    let s = "";
    process.stdin.on("data", d => s += d);
    process.stdin.on("end", () => {
      let j; try { j = JSON.parse(s); } catch { console.log("(risposta non JSON, " + s.length + " byte)"); return; }
      console.log("url:", (j.url || "").slice(0, 160));
      console.log("ripulito dal codice:", j.ripulito === true);
      const c = j.ctrls || [];
      console.log("campi:", c.length);
      for (const x of c) {
        const parti = [x.tag, x.type && ("type=" + x.type), x.id && ("id=" + x.id), x.name && ("name=" + x.name)];
        console.log("  " + parti.filter(Boolean).join("  "));
      }
    });
  '
}

echo; echo "### SCHERMATA 1 — la pagina di login ###"
curl -s -m 90 http://127.0.0.1:4200/logindump | solo_struttura

echo; echo "### SCHERMATA 2 — dove si ferma (dopo l'utente) ###"
curl -s -m 120 http://127.0.0.1:4200/otpdump | node -e '
  let s = "";
  process.stdin.on("data", d => s += d);
  process.stdin.on("end", () => {
    let j; try { j = JSON.parse(s); } catch { console.log("(risposta non JSON, " + s.length + " byte)"); return; }
    console.log("prima: ", (j.before || "").slice(0, 160));
    console.log("dopo:  ", (j.after || "").slice(0, 160));
    const d = j.dump || {};
    console.log("ripulito dal codice:", d.ripulito === true);
    const c = d.ctrls || [];
    console.log("campi:", c.length);
    for (const x of c) {
      const parti = [x.tag, x.type && ("type=" + x.type), x.id && ("id=" + x.id), x.name && ("name=" + x.name)];
      console.log("  " + parti.filter(Boolean).join("  "));
    }
  });
'

echo; echo "### COSA DICE IL LOG SUBITO DOPO ###"
journalctl -u allianz-scraper --since '-4 min' --no-pager 2>/dev/null | tail -12
