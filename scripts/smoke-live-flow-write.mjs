import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

if (process.env.FLOW_LIVE_WRITE !== '1') {
  throw new Error('Refusing live Flow write. Re-run with FLOW_LIVE_WRITE=1 when you intentionally want the smoke test.');
}

const root = process.cwd();
const backupDir = path.join(root, 'backups');
mkdirSync(backupDir, { recursive: true });

const appUrl = process.env.FLOW_APP_URL || 'https://frostbite-flow.vercel.app';
const apiBase = process.env.FLOW_API_BASE || 'https://app.frostbitefeeders.com/api/flow';
const binCode = process.env.FLOW_SMOKE_BIN || '10-1-01';
const tenantHeaders = {
  'Content-Type': 'application/json',
  'x-tenant-id': 'frostbite',
};

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function flowGetState() {
  const response = await fetch(`${apiBase}/state`, { headers: tenantHeaders });
  if (!response.ok) throw new Error(`GET /state failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function flowPutState(payload, updatedBy) {
  const response = await fetch(`${apiBase}/state`, {
    method: 'PUT',
    headers: tenantHeaders,
    body: JSON.stringify({ payload, updated_by: updatedBy }),
  });
  if (!response.ok) throw new Error(`PUT /state failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function findBinEntry(payload, code) {
  return Object.entries(payload?.bins || {}).find(([, bin]) => bin.code === code);
}

async function main() {
  const originalRecord = await flowGetState();
  const backupPath = path.join(backupDir, `flow-live-smoke-before-${stamp()}.json`);
  writeFileSync(backupPath, `${JSON.stringify(originalRecord, null, 2)}\n`);

  const originalEntry = findBinEntry(originalRecord.payload, binCode);
  if (!originalEntry) throw new Error(`Could not find ${binCode} in shared Flow state`);
  const [originalBinId, originalBin] = originalEntry;
  const originalNote = originalBin.note || '';
  const smokeNote = `Flow live smoke ${new Date().toISOString()}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const seenRequests = [];
  page.on('request', (request) => {
    seenRequests.push({ method: request.method(), url: request.url() });
  });
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.locator('text=Shared live').first().waitFor({ timeout: 15000 });
  await page.fill('input[aria-label="Search bins, SKUs, rooms, racks, notes"]', binCode);
  await page.press('input[aria-label="Search bins, SKUs, rooms, racks, notes"]', 'Enter');
  await page.waitForTimeout(300);
  const selectedBin = await page.locator('.detail-title h2').textContent();
  if (selectedBin !== binCode) throw new Error(`Expected ${binCode}, selected ${selectedBin}`);
  await page.locator('.edit-form textarea').fill(smokeNote);
  await page.locator('.write-confirm input').check();
  await page.click('button:has-text("Save shared state")');
  await page.locator(`text=Saved ${binCode} to shared Flow`).waitFor({ timeout: 15000 });
  await browser.close();

  const afterWriteRecord = await flowGetState();
  const afterWriteEntry = findBinEntry(afterWriteRecord.payload, binCode);
  if (!afterWriteEntry) throw new Error(`Could not find ${binCode} after smoke write`);
  if (afterWriteEntry[1].note !== smokeNote) {
    throw new Error(`Smoke write did not persist. Got note: ${afterWriteEntry[1].note}`);
  }

  const restorePayload = clone(afterWriteRecord.payload);
  restorePayload.bins[originalBinId] = originalBin;
  await flowPutState(restorePayload, 'frostbite-flow-live-smoke-restore');

  const restoredRecord = await flowGetState();
  const restoredEntry = findBinEntry(restoredRecord.payload, binCode);
  if (!restoredEntry) throw new Error(`Could not find ${binCode} after restore`);
  if ((restoredEntry[1].note || '') !== originalNote) {
    throw new Error(`Restore failed. Expected original note "${originalNote}", got "${restoredEntry[1].note || ''}"`);
  }

  const shopifyRequests = seenRequests.filter((request) => request.url.toLowerCase().includes('shopify'));
  if (shopifyRequests.length > 0) {
    throw new Error(`Unexpected Shopify request(s): ${shopifyRequests.map((request) => `${request.method} ${request.url}`).join(', ')}`);
  }

  console.log(JSON.stringify({
    appUrl,
    binCode,
    backupPath,
    wroteNote: smokeNote,
    restoredOriginalNote: originalNote,
    stateId: restoredRecord.id,
    stateBinCount: Object.keys(restoredRecord.payload?.bins || {}).length,
    shopifyRequests: shopifyRequests.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
