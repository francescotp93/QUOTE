// Mini server di salute: QUOTO è ospitato su GitHub Pages + Supabase.
// Questo file esiste solo per evitare che un eventuale deploy residuo (es. Railway)
// vada in crash-loop. Puoi rimuovere del tutto quel servizio dal suo dashboard.
import http from 'http';

const PORT = process.env.PORT || 4000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'quoto', note: 'Hosted on GitHub Pages + Supabase' }));
}).listen(PORT, () => console.log('QUOTO health server on ' + PORT));
