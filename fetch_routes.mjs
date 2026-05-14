import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function fetchRoute(routeId) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let routeData = null;

  page.on('response', async (response) => {
    if (response.url().includes(`/api/route?route_id=${routeId}`) && response.status() === 200) {
      try {
        const data = await response.json();
        routeData = data;
      } catch (e) {
        // Not JSON
      }
    }
  });

  console.log(`Navigating to fetch route ${routeId}...`);
  await page.goto(`https://myrapidbus.prasarana.com.my/kiosk?route=${routeId}&bus=`);
  
  // Wait a bit for the WAF and the map to load
  await page.waitForTimeout(5000);
  
  if (routeData) {
    fs.writeFileSync(path.join(process.cwd(), 'public', `route_${routeId}.json`), JSON.stringify(routeData));
    console.log(`Saved route ${routeId} successfully.`);
  } else {
    console.log(`Failed to capture route ${routeId}.`);
  }

  await browser.close();
}

async function main() {
  await fetchRoute('1302');
  await fetchRoute('854');
}

main();
