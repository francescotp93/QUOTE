#!/usr/bin/env bash
# Fonti — quale chiave ha in mano OGNI processo in esecuzione.
# PRIVACY: non stampa mai il segreto. Solo "ce l'ha si/no" e l'impronta
# non reversibile (hash dell'hash) per confrontare le chiavi fra loro.
set -u
cd /opt/withus-backend || exit 1

echo "== impronta della chiave di ogni processo =="
node -e '
const fs=require("fs"), crypto=require("crypto"), cp=require("child_process");
const impronta = s => crypto.createHash("sha256").update(crypto.createHash("sha256").update(s).digest()).digest("hex").slice(0,12);

// riferimenti
let daEnv=null;
try { const m=fs.readFileSync("server/.env","utf8").match(/^\s*FONTI_SECRET\s*=\s*(.*)$/m); if (m) daEnv=m[1].trim().replace(/^["\x27]|["\x27]$/g,""); } catch {}
const derivataVps = "withus-fonti-vps-v1";
console.log("chiave A = quella in server/.env      -> " + (daEnv ? impronta(daEnv) : "assente"));
console.log("chiave B = derivata (HOSTNAME assente)-> " + impronta(derivataVps));
console.log("");

const servizi = cp.execSync("ls /etc/systemd/system/*scraper*.service /etc/systemd/system/withus-backend.service 2>/dev/null || true")
  .toString().trim().split("\n").filter(Boolean).map(p => p.split("/").pop());

for (const n of servizi) {
  let pid = "";
  try { pid = cp.execSync("systemctl show " + n + " -p MainPID --value 2>/dev/null").toString().trim(); } catch {}
  if (!pid || pid === "0") { console.log(n.padEnd(28) + "  (nessun processo)"); continue; }
  // Il processo principale puo essere uno script di avvio: guardo anche i figli node.
  let pids = [pid];
  try { pids = pids.concat(cp.execSync("pgrep -P " + pid + " 2>/dev/null || true").toString().trim().split("\n").filter(Boolean)); } catch {}
  let detto = false;
  for (const p of pids) {
    let env = "";
    try { env = fs.readFileSync("/proc/" + p + "/environ", "utf8"); } catch { continue; }
    let cmd = ""; try { cmd = fs.readFileSync("/proc/" + p + "/cmdline","utf8").replace(/\0/g," ").trim().slice(0,40); } catch {}
    const vars = Object.fromEntries(env.split("\0").filter(Boolean).map(x => { const i=x.indexOf("="); return [x.slice(0,i), x.slice(i+1)]; }));
    const seg = vars.FONTI_SECRET;
    const host = vars.HOSTNAME;
    const usata = seg || ("withus-fonti-" + (host || "vps") + "-v1");
    console.log(n.padEnd(28) + "  pid " + String(p).padEnd(8) +
      "FONTI_SECRET=" + (seg ? "si" : "NO") +
      "  HOSTNAME=" + (host ? "si" : "no") +
      "  impronta=" + impronta(usata) + "  [" + cmd + "]");
    detto = true;
  }
  if (!detto) console.log(n.padEnd(28) + "  (ambiente non leggibile)");
}
'

echo
echo "== drop-in systemd presenti =="
ls -d /etc/systemd/system/*scraper*.service.d /etc/systemd/system/withus-backend.service.d 2>/dev/null || echo "(nessun drop-in)"
for d in /etc/systemd/system/*.service.d; do
  [ -d "$d" ] || continue
  echo "--- $d"
  grep -rhE '^(Environment|EnvironmentFile)' "$d" 2>/dev/null | sed -E 's/(FONTI_SECRET=).*/\1<nascosto>/' | head -5
done

echo
echo "== quotiamo: che EnvironmentFile ha e contiene FONTI_SECRET? =="
grep -h '^EnvironmentFile=' /etc/systemd/system/quotiamo-scraper.service 2>/dev/null
for f in $(grep -h '^EnvironmentFile=' /etc/systemd/system/quotiamo-scraper.service 2>/dev/null | sed 's/^EnvironmentFile=-\{0,1\}//'); do
  echo "  file $f esiste? $([ -f "$f" ] && echo si || echo NO)   contiene FONTI_SECRET? $(grep -c '^FONTI_SECRET=' "$f" 2>/dev/null || echo 0)"
done
