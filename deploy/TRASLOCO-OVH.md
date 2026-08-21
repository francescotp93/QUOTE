# Trasloco dei frontend su OVH (IAM pilota, poi QUOTO)

**Perché.** Scelta di sovranità del dato: tenere tutto su un'infrastruttura
europea, un fornitore solo (OVH), controllo pieno. NON è una difesa in più
contro gli attacchi — per file statici un CDN gestito (Pages/Vercel) è di norma
più sicuro — ma riduce i fornitori esterni e riporta tutto in casa. Bonus reale:
si chiude l'esposizione del sorgente che oggi Pages lascia aperta (vedi sotto).

**Stato di partenza (21/08/2026).** Sia `iam.` sia `quoto.withusassicurazioni.it`
sono su **GitHub Pages** (DNS su **Aruba**, entrambi `CNAME → francescotp93.github.io`).
Il backend `api.withusassicurazioni.it` è già su OVH (VPS 51.254.142.199, Caddy →
`localhost:3000`).

## Già pronto (fatto, senza toccare la produzione)

- IAM copiato sul VPS in `/opt/withus-iam` (repo pubblico, allineato a `main`).
- `deploy/autopull.sh` tiene `/opt/withus-iam` allineato al suo `main` ogni minuto
  (blocco in fondo allo script, usa `git -C`, agisce solo se la cartella esiste).

## CUTOVER IAM — da fare INSIEME (io Caddy, Francesco DNS)

Ordine consigliato: prima Caddy (così il VPS è pronto), poi il DNS.

### 1) Caddy (sul VPS — lo faccio io via canale, con rete di sicurezza)
```
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%s)   # backup
# appendo questo blocco (NON tocco il blocco api.):
cat >> /etc/caddy/Caddyfile <<'EOF'

iam.withusassicurazioni.it {
	encode gzip zstd
	root * /opt/withus-iam
	@nascosti path /verifica/* /sql/* /docs/* /compliance/* /.git/* *.mjs *.md /package.json /controlla-tutto.mjs /vercel.json /CNAME
	respond @nascosti 404
	file_server
}
EOF
caddy validate --config /etc/caddy/Caddyfile        # se NON valida: ripristino il .bak e mi fermo
systemctl reload caddy                              # reload sicuro: se invalida, Caddy resta sulla vecchia
systemctl is-active caddy                           # deve dire "active"
curl -s -o /dev/null -w '%{http_code}' https://api.withusassicurazioni.it/health   # deve restare 200
```

### 2) DNS su Aruba (lo fa Francesco — guida a schermo al momento)
- Pannello Aruba → dominio `withusassicurazioni.it` → **Gestione DNS record**.
- (Consigliato) abbassare prima il **TTL** del record `iam` a **300**.
- Record **`iam`**: da `CNAME → francescotp93.github.io` a **`A → 51.254.142.199`**.
  (Opzionale IPv6: `AAAA → 2001:41d0:367:f3b::1`.)

### 3) Verifica (dopo la propagazione, pochi minuti col TTL basso)
- `https://iam.withusassicurazioni.it` risponde, certificato valido (Let's Encrypt,
  preso da Caddy in automatico), la pagina carica e il **login funziona**.
- Sorgente/prove nascosti: `…/package.json`, `…/verifica/fonti.test.mjs` → **404**.

### 4) Rollback (se qualcosa non va)
- Su Aruba rimettere `iam` a `CNAME → francescotp93.github.io`.
- In pochi minuti IAM torna su Pages, identico a prima. (Il blocco Caddy può
  restare: senza DNS che punta al VPS, non riceve traffico.)

## FASE QUOTO — dopo che IAM è confermato

Identico, ma il `root` è `/opt/withus-backend` (i file di QUOTO sono già lì,
tenuti freschi dall'autopull). Serve una **deny-list più ampia**, perché è un
monorepo: oggi Pages espone il sorgente del backend
(`quoto.withusassicurazioni.it/server/index.js`, `/supabase/functions/quoto/index.ts`,
`/tariffe/motore/…` → 200; solo `.env` è 404). Con Caddy si chiude:
```
quoto.withusassicurazioni.it {
	encode gzip zstd
	root * /opt/withus-backend
	@nascosti path /server/* /scraper/* /supabase/* /deploy/* /backend/* /routes/* /services/* /node_modules/* /.git/* /tariffe/motore/* *.mjs *.env /package.json /package-lock.json /server.js /static-server.js
	respond @nascosti 404
	file_server
}
```
ATTENZIONE: `tariffe/*.json` DEVE restare servito (il browser lo scarica per
calcolare i premi) — infatti si nasconde solo `tariffe/motore/*`, non tutto
`tariffe/`. Verificare dopo il reload che `…/tariffe/rc_professionale.json` → 200
e `…/server/index.js` → 404, e che il preventivatore quoti ancora.

DNS Aruba per `quoto`: stesso cambio, `CNAME → github.io` ⇒ `A → 51.254.142.199`.

## Invariante

Il blocco `api.withusassicurazioni.it { reverse_proxy localhost:3000 }` NON si
tocca mai. Ogni modifica a Caddy: backup → `caddy validate` → `reload` →
verifica che `api.` risponda 200 prima di procedere.
