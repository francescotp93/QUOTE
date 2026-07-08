# Template scraper compagnia (portale proprio)

SCAFFOLD non importato da nulla. Vedi `docs/ARCHITETTURA-MULTICOMPAGNIA.md` §3b e §5.

Per una compagnia INTERNA a Plurima NON serve questo template: basta una riga in
`companies.config.json` (vedi §3a). Questo template serve solo per portali ESTERNI a Plurima.

Passi: `cp -r scraper/_template scraper/<nome>` → personalizza i `// TODO[ADAPTER]` →
registra in `server/fonti.js#scraperUrlFor` → primo login via VNC → mappa con /explore + /sniff →
implementa recuperaVeicolo/recuperaAnagrafica/calcolaPremio (formati NORM) → fan-out in quota-auto.
