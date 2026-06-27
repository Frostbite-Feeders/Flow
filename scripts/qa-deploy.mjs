import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const outDir = path.join(root, 'tmp', 'qa');
mkdirSync(outDir, { recursive: true });

const appUrl = process.env.FLOW_APP_URL || 'https://frostbite-flow.vercel.app';
const appOrigin = new URL(appUrl).origin;
const searchInput = 'input[aria-label="Search bins, SKUs, rooms, racks, notes"]';
const drySaveNote = 'Deploy QA dry-run from browser test';
const openTransitionNote = 'Deploy QA open transition dry-run';
const deployActualCount = 12;
const deployEditBin = 'B1-01';
const blockedRequests = [];
const browserErrors = [];
const seenRequests = [];
const interceptedWrites = [];
const exercisedControls = [];
let firstStateSnapshot = null;

function assertSameOrigin(url) {
  return url === 'about:blank' || new URL(url).origin === appOrigin;
}

async function routeDeployRequest(route) {
  const request = route.request();
  const url = request.url();
  const method = request.method();
  seenRequests.push({ method, url });

  if (!assertSameOrigin(url)) {
    blockedRequests.push({ method, url, reason: 'external' });
    return route.abort('blockedbyclient');
  }

  const pathname = new URL(url).pathname;
  if (pathname === '/api/flow/state' && method === 'PUT') {
    const body = request.postDataJSON();
    interceptedWrites.push({ url, body });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'frostbite-flow-live',
        updated_at: new Date().toISOString(),
        qaIntercepted: true,
      }),
    });
  }

  if (method !== 'GET') {
    blockedRequests.push({ method, url, reason: 'non-get' });
    return route.abort('blockedbyclient');
  }

  return route.continue();
}

function assertDryRunWrite({ write, originalBins, binCode, note, actualCount, status, skuTarget, expectOpenCleared = false }) {
  const writtenBins = write.body?.payload?.bins || {};
  const changedBinIds = Object.keys(writtenBins).filter(
    (binId) => JSON.stringify(writtenBins[binId]) !== JSON.stringify(originalBins[binId]),
  );
  if (write.body?.updated_by !== 'frostbite-flow-dashboard') {
    throw new Error(`Unexpected dry-run updated_by: ${write.body?.updated_by}`);
  }
  if (Object.keys(writtenBins).length !== 714) {
    throw new Error(`Dry-run save payload had ${Object.keys(writtenBins).length} bins, expected 714`);
  }
  if (changedBinIds.length !== 1) {
    throw new Error(`Dry-run save changed ${changedBinIds.length} bins, expected one`);
  }
  const changedBin = writtenBins[changedBinIds[0]];
  if (changedBin.code !== binCode) {
    throw new Error(`Dry-run save changed ${changedBin.code}, expected ${binCode}`);
  }
  if (changedBin.note !== note) {
    throw new Error(`Dry-run save note mismatch: ${changedBin.note}`);
  }
  if (actualCount !== undefined && (changedBin.actualCount !== actualCount || changedBin.currentCount !== actualCount)) {
    throw new Error(`Dry-run save did not patch actual count to ${actualCount}. Got actual=${changedBin.actualCount} current=${changedBin.currentCount}`);
  }
  if (status !== undefined && changedBin.status !== status) {
    throw new Error(`Dry-run save did not patch status to ${status}. Got ${changedBin.status}`);
  }
  if (skuTarget !== undefined && changedBin.skuTarget !== skuTarget) {
    throw new Error(`Dry-run save did not patch skuTarget to ${skuTarget}. Got ${changedBin.skuTarget}`);
  }
  if (expectOpenCleared) {
    for (const field of ['dueDate', 'birthDate', 'growoutStartDate', 'sourceBin']) {
      if (changedBin[field] !== null) {
        throw new Error(`Open dry-run save should clear ${field}. Got ${changedBin[field]}`);
      }
    }
    for (const field of ['males', 'females', 'mothers', 'litterCount', 'pregnantFemales']) {
      if (changedBin[field] !== 0) {
        throw new Error(`Open dry-run save should zero ${field}. Got ${changedBin[field]}`);
      }
    }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.route('**/*', routeDeployRequest);

  const stateResponsePromise = page.waitForResponse(
    (response) =>
      response.url().startsWith(`${appOrigin}/api/flow/state`) &&
      response.request().method() === 'GET' &&
      response.status() === 200,
    { timeout: 20000 },
  );
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  const stateResponse = await stateResponsePromise;
  firstStateSnapshot = await stateResponse.json();
  await page.locator('text=Shared live').first().waitFor({ timeout: 10000 });

  async function clickControl(label, action) {
    await action();
    exercisedControls.push(label);
    await page.waitForTimeout(150);
  }

  async function downloadControl(label, action) {
    const downloadPromise = page.waitForEvent('download');
    await action();
    const download = await downloadPromise;
    exercisedControls.push(`${label}: ${download.suggestedFilename()}`);
    await page.waitForTimeout(150);
    return download;
  }

  await downloadControl('Sidebar Exports', () => page.locator('.nav button', { hasText: 'Exports' }).click());
  await clickControl('Needs Check queue', () => page.locator('.nav-lower button', { hasText: 'Needs Check' }).click());
  await clickControl('Due Soon queue', () => page.locator('.nav-lower button', { hasText: 'Due Soon' }).click());
  await clickControl('Refresh shared state', () => page.locator('.top-meta button').click());
  await page.locator('text=Shared live').first().waitFor({ timeout: 10000 });

  const dailyReportDownload = await downloadControl('Daily Report', () => page.locator('[data-testid="daily-report-action"]').click());
  const okfDownload = await downloadControl('OKF Bundle', () => page.locator('[data-testid="okf-export-action"]').click());
  const okfBundle = JSON.parse(readFileSync(await okfDownload.path(), 'utf8'));

  await clickControl('Find Bin', () => page.click('button:has-text("Find Bin")'));
  await page.locator('[data-testid="scan-tray"]').waitFor({ timeout: 5000 });
  await clickControl('Focus scanner', () => page.locator('.scan-tray button', { hasText: 'Focus scanner' }).click());
  const nextDueButton = page.locator('.scan-tray button', { hasText: 'Next due' });
  const nextDueCount = await nextDueButton.count();
  if (nextDueCount > 0) {
    await clickControl('Next due shortcut', () => nextDueButton.first().click());
    const selectedAfterNextDue = await page.locator('.detail-title h2').textContent();
    if (!selectedAfterNextDue?.trim()) {
      throw new Error('Next due shortcut did not select a bin.');
    }
  } else {
    const dueSoonMetric = await page.locator('.metric', { hasText: 'Due This Week' }).innerText();
    if (!dueSoonMetric.match(/\b0\b/)) {
      throw new Error(`Next due button absent but Due This Week was not zero: ${dueSoonMetric}`);
    }
    exercisedControls.push('Next due shortcut absent: no due-soon bins in current state');
  }
  await clickControl('Done scan mode', () => page.locator('.scan-tray button', { hasText: 'Done' }).click());
  await clickControl('Find Bin reopen', () => page.click('button:has-text("Find Bin")'));

  await page.fill(searchInput, deployEditBin);
  exercisedControls.push('Typed bin lookup');
  await page.press(searchInput, 'Enter');
  await page.waitForTimeout(300);
  const selectedBeforeSave = await page.locator('.detail-title h2').textContent();
  const searchResultsText = await page.locator('.search-results').innerText();

  await clickControl('All rooms button', () => page.locator('.room-button', { hasText: 'All rooms' }).click());
  await clickControl('Breeding room button', () => page.locator('.room-button', { hasText: 'breeding' }).click());
  const rackRowCount = await page.locator('.rack-row').count();
  if (rackRowCount > 0) {
    await clickControl('First rack row', () => page.locator('.rack-row').nth(0).click());
  }
  await clickControl('Nursery room button', () => page.locator('.room-button', { hasText: 'nursery' }).click());
  await clickControl('Growout room button', () => page.locator('.room-button', { hasText: 'growout' }).click());
  await clickControl('Room filter All', () => page.locator('.control-group[aria-label="Room filter"] button', { hasText: 'All' }).click());
  for (const room of ['breeding', 'nursery', 'growout']) {
    await clickControl(`Room filter ${room}`, () => page.locator('.control-group[aria-label="Room filter"] button', { hasText: room }).click());
  }
  await clickControl('Room filter reset All', () => page.locator('.control-group[aria-label="Room filter"] button', { hasText: 'All' }).click());
  for (const status of ['breeding', 'nursery', 'growout', 'open']) {
    await clickControl(`Status filter ${status}`, () => page.locator('.control-group[aria-label="Status filter"] button', { hasText: status }).click());
  }
  await clickControl('Status filter reset all', () => page.locator('.control-group[aria-label="Status filter"] button', { hasText: 'all' }).click());
  await clickControl('Wall Flow map mode', () => page.locator('.control-group[aria-label="Map mode"] button', { hasText: 'Wall Flow' }).click());
  const firstWallSection = page.locator('.wall-section').first();
  const wallCells = await firstWallSection.locator('[data-testid="wall-walk-cell"]').count();
  if (wallCells !== 120) {
    throw new Error(`Wall Flow expected 120 cells in first visible wall section, got ${wallCells}`);
  }
  const firstSlot = await firstWallSection.locator('[data-testid="wall-walk-cell"]').nth(0).getAttribute('data-wall-slot');
  const twelfthSlot = await firstWallSection.locator('[data-testid="wall-walk-cell"]').nth(11).getAttribute('data-wall-slot');
  const thirteenthSlot = await firstWallSection.locator('[data-testid="wall-walk-cell"]').nth(12).getAttribute('data-wall-slot');
  const twentyFourthSlot = await firstWallSection.locator('[data-testid="wall-walk-cell"]').nth(23).getAttribute('data-wall-slot');
  const firstCanonicalBin = await firstWallSection.locator('[data-testid="wall-walk-cell"]').nth(0).getAttribute('data-bin-code');
  if (firstSlot !== 'A01') throw new Error(`Expected first Wall Flow slot A01, got ${firstSlot}`);
  if (twelfthSlot !== 'A12') throw new Error(`Expected twelfth Wall Flow slot A12, got ${twelfthSlot}`);
  if (thirteenthSlot !== 'B12') throw new Error(`Expected serpentine Wall Flow slot B12 after A12, got ${thirteenthSlot}`);
  if (twentyFourthSlot !== 'B01') throw new Error(`Expected end of second Wall Flow level B01, got ${twentyFourthSlot}`);
  if (!firstCanonicalBin || firstCanonicalBin === firstSlot) {
    throw new Error(`Wall Flow must preserve canonical bin code separately from wall slot. Got ${firstCanonicalBin}`);
  }
  await clickControl('Rack Map mode', () => page.locator('.control-group[aria-label="Map mode"] button', { hasText: 'Rack Map' }).click());

  const insightCount = await page.locator('.insight').count();
  for (let index = 0; index < insightCount; index += 1) {
    await clickControl(`Floor Queue ${index + 1}`, () => page.locator('.insight').nth(index).click());
  }
  const alertButtonCount = await page.locator('.alert-strip button').count();
  if (alertButtonCount > 0) {
    await clickControl('First alert strip button', () => page.locator('.alert-strip button').nth(0).click());
  }
  await clickControl('First visible bin cell', () => page.locator('.bin-cell').nth(0).click());

  await page.fill(searchInput, deployEditBin);
  await page.press(searchInput, 'Enter');
  await page.waitForTimeout(300);
  await page.getByLabel('Actual count').fill(String(deployActualCount));
  await page.locator('.edit-form textarea').fill(drySaveNote);
  exercisedControls.push('Floor note edit');
  await page.locator('.write-confirm input').check();
  exercisedControls.push('Flow write confirmation checkbox');
  await page.click('button:has-text("Save shared state")');
  exercisedControls.push('Save shared state');
  for (let attempt = 0; attempt < 50 && interceptedWrites.length === 0; attempt += 1) {
    await page.waitForTimeout(100);
  }

  await page.fill(searchInput, '55-1-03');
  await page.press(searchInput, 'Enter');
  await page.waitForTimeout(300);
  await page.locator('.edit-form label', { hasText: 'Status' }).locator('select').selectOption('open');
  await page.locator('.edit-form textarea').fill(openTransitionNote);
  exercisedControls.push('Open transition edit');
  await page.locator('.write-confirm input').check();
  await page.click('button:has-text("Save shared state")');
  exercisedControls.push('Open transition dry-run save');
  for (let attempt = 0; attempt < 50 && interceptedWrites.length < 2; attempt += 1) {
    await page.waitForTimeout(100);
  }

  const metrics = await page.locator('.metric-strip').innerText();
  const binMapText = await page.locator('[data-testid="bin-map"]').innerText();
  const fakeButtonLabels = await page.locator('.room-list .panel-head button, .detail-title button').count();
  const visibleShopifyUi =
    (await page.locator('text=Shopify View').count()) +
    (await page.locator('text=Shopify Mapping').count());
  const screenshot = path.join(outDir, 'flow-deploy.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await browser.close();

  const result = {
    appUrl,
    stateId: firstStateSnapshot.id,
    stateBinCount: Object.keys(firstStateSnapshot.payload?.bins || {}).length,
    selectedBeforeSave,
    metrics,
    searchResultsText,
    reportFilename: dailyReportDownload.suggestedFilename(),
    okfFilename: okfDownload.suggestedFilename(),
    okfBundleType: okfBundle.bundle_type,
    okfPerBinCount: okfBundle.per_bin_inventory?.length || 0,
    okfGraphNodes: okfBundle.graph?.nodes?.length || 0,
    dryRunWriteCount: interceptedWrites.length,
    exercisedControls,
    fakeButtonLabels,
    visibleShopifyUi,
    blockedRequests,
    browserErrors,
    requestCount: seenRequests.length,
    screenshot,
  };
  writeFileSync(path.join(outDir, 'deploy-qa.json'), `${JSON.stringify(result, null, 2)}\n`);

  if (blockedRequests.length > 0) throw new Error(`Blocked ${blockedRequests.length} unexpected request(s).`);
  if (browserErrors.length > 0) throw new Error(`Browser had ${browserErrors.length} error(s).`);
  if (result.stateId !== 'frostbite-flow-live') throw new Error(`Expected live state, got ${result.stateId}`);
  if (result.stateBinCount !== 714) throw new Error(`Expected 714 bins, got ${result.stateBinCount}`);
  if (selectedBeforeSave !== deployEditBin) throw new Error(`Expected selected bin ${deployEditBin}, got ${selectedBeforeSave}`);
  if (!searchResultsText.includes(deployEditBin)) throw new Error(`Search results did not show selected bin: ${searchResultsText}`);
  if (interceptedWrites.length !== 2) throw new Error(`Expected two intercepted Flow writes, got ${interceptedWrites.length}`);
  assertDryRunWrite({
    write: interceptedWrites[0],
    originalBins: firstStateSnapshot.payload?.bins || {},
    binCode: deployEditBin,
    note: drySaveNote,
    actualCount: deployActualCount,
  });
  assertDryRunWrite({
    write: interceptedWrites[1],
    originalBins: firstStateSnapshot.payload?.bins || {},
    binCode: '55-1-03',
    note: openTransitionNote,
    actualCount: 0,
    status: 'open',
    skuTarget: null,
    expectOpenCleared: true,
  });
  if (fakeButtonLabels !== 0) {
    throw new Error(`Found ${fakeButtonLabels} fake button(s) in non-action surfaces.`);
  }
  if (visibleShopifyUi > 0) throw new Error('Visible Shopify workflow copy should not be present.');
  if (seenRequests.some((request) => request.url.toLowerCase().includes('shopify'))) {
    throw new Error('Deploy QA saw a Shopify request.');
  }
  if (!binMapText.includes('Action needed') || !binMapText.includes('Ready')) {
    throw new Error('Bin map legend did not render expected activity states.');
  }
  if (okfBundle.bundle_type !== 'frostbite-flow-operations-snapshot') {
    throw new Error(`Unexpected OKF bundle type: ${okfBundle.bundle_type}`);
  }
  if ((okfBundle.per_bin_inventory?.length || 0) !== 714) {
    throw new Error(`OKF per-bin inventory expected 714 rows, got ${okfBundle.per_bin_inventory?.length}`);
  }
  if (!okfBundle.per_bin_inventory.every((row) => Number.isFinite(row.actual_count))) {
    throw new Error('OKF per-bin inventory is missing numeric actual_count values');
  }
  if ((okfBundle.graph?.nodes?.length || 0) < 714) {
    throw new Error('OKF graph is missing expected nodes.');
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
