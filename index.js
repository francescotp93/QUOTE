const { chromium } = require('playwright');

(async () => {

  console.log("Avvio Quote...");

  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  await page.goto('https://example.com');

  const title = await page.title();

  console.log("Titolo:", title);

  await browser.close();

})();
