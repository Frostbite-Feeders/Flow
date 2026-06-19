import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const outDir = path.join(root, 'tmp', 'qa');
mkdirSync(outDir, { recursive: true });

const allowedOrigins = ['http://127.0.0.1:5173/', 'http://localhost:5173/'];
const blockedRequests = [];
const browserErrors = [];

function allowLocalGetOnly(route) {
  const request = route.request();
  const url = request.url();
  const method = request.method();
  const isAllowedLocal = allowedOrigins.some((origin) => url.startsWith(origin));

  if (method !== 'GET' || !isAllowedLocal) {
    blockedRequests.push({
      method,
      url,
      reason: method !== 'GET' ? 'non-get' : 'external',
    });
    return route.abort('blockedbyclient');
  }

  return route.continue();
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 980 },
    deviceScaleFactor: 1,
  });
  desktop.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  desktop.on('pageerror', (error) => browserErrors.push(error.message));
  await desktop.route('**/*', allowLocalGetOnly);

  await desktop.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  const title = await desktop.title();
  const heading = await desktop.locator('h1').first().textContent();
  const metrics = await desktop.locator('.metric-strip').innerText();

  await desktop.fill('input[aria-label="Search bins, racks, notes, or QR targets"]', 'Pup target');
  await desktop.waitForTimeout(300);
  const generalSearchSelectedBin = await desktop.locator('.detail-title h2').textContent();

  await desktop.fill('input[aria-label="Search bins, racks, notes, or QR targets"]', '55-1-02');
  await desktop.click('button:has-text("Find")');
  await desktop.waitForTimeout(300);

  const selectedBin = await desktop.locator('.detail-title h2').textContent();
  const qrTarget = await desktop.locator('.qr-card code').textContent();
  const desktopScreenshot = path.join(outDir, 'flow-desktop.png');
  await desktop.screenshot({ path: desktopScreenshot, fullPage: true });

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 900 },
    isMobile: true,
  });
  mobile.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  mobile.on('pageerror', (error) => browserErrors.push(error.message));
  await mobile.route('**/*', allowLocalGetOnly);
  await mobile.goto('http://127.0.0.1:5173/#10-1-01', { waitUntil: 'networkidle' });

  const mobileSelectedBin = await mobile.locator('.detail-title h2').textContent();
  const mobileScreenshot = path.join(outDir, 'flow-mobile.png');
  await mobile.screenshot({ path: mobileScreenshot, fullPage: true });

  await browser.close();

  const result = {
    title,
    heading,
    generalSearchSelectedBin,
    selectedBin,
    qrTarget,
    mobileSelectedBin,
    metrics,
    blockedRequests,
    browserErrors,
    desktopScreenshot,
    mobileScreenshot,
  };

  writeFileSync(path.join(outDir, 'browser-qa.json'), `${JSON.stringify(result, null, 2)}\n`);

  if (blockedRequests.length > 0) {
    throw new Error(`Blocked ${blockedRequests.length} unexpected request(s). See tmp/qa/browser-qa.json.`);
  }
  if (browserErrors.length > 0) {
    throw new Error(`Browser had ${browserErrors.length} error(s). See tmp/qa/browser-qa.json.`);
  }
  if (title !== 'Frostbite Flow') {
    throw new Error(`Unexpected page title: ${title}`);
  }
  if (heading !== 'Frostbite Flow') {
    throw new Error(`Unexpected app heading: ${heading}`);
  }
  if (generalSearchSelectedBin !== '55-1-03') {
    throw new Error(`General search selected ${generalSearchSelectedBin}, expected 55-1-03`);
  }
  if (selectedBin !== '55-1-02') {
    throw new Error(`QR lookup selected ${selectedBin}, expected 55-1-02`);
  }
  if (!qrTarget?.endsWith('#55-1-02')) {
    throw new Error(`QR target did not resolve to #55-1-02: ${qrTarget}`);
  }
  if (mobileSelectedBin !== '10-1-01') {
    throw new Error(`Mobile hash selected ${mobileSelectedBin}, expected 10-1-01`);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
