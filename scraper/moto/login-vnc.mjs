// Apre un browser PERSISTENTE (salva la sessione in ./userdata) sul display virtuale,
// va alla pagina di login e resta aperto. Tu ti colleghi via VNC e fai il login a mano.
import { chromium } from 'playwright';

const LOGIN_URL = 'https://login.24hassistance.com/?ReturnUrl=https://www.24hassistance.com';
const userDataDir = new URL('./userdata', import.meta.url).pathname;

const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: null,
  locale: 'it-IT',
  args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'],
});
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto(LOGIN_URL).catch(() => {});

console.log('\n=================================================================');
console.log(' ✅ Browser aperto sul login.');
console.log(' → Collegati via VNC dal Mac e FAI IL LOGIN nella finestra.');
console.log(' → La sessione viene salvata da sola in ./userdata');
console.log(' → Lascia tutto aperto. Per fermare: Ctrl+C qui.');
console.log('=================================================================\n');

await new Promise(() => {}); // resta vivo finché non premi Ctrl+C
