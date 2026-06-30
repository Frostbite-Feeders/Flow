import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const outDir = path.join(root, 'tmp', 'qa');
mkdirSync(outDir, { recursive: true });

const localAppUrl = process.env.FLOW_LOCAL_URL || 'http://127.0.0.1:5173/';
const localUrl = new URL(localAppUrl);
const localhostPeer = `${localUrl.protocol}//localhost:${localUrl.port || (localUrl.protocol === 'https:' ? '443' : '80')}/`;
const loopbackPeer = `${localUrl.protocol}//127.0.0.1:${localUrl.port || (localUrl.protocol === 'https:' ? '443' : '80')}/`;
const allowedOrigins = [...new Set([`${localUrl.origin}/`, localhostPeer, loopbackPeer])];
const blockedRequests = [];
const browserErrors = [];
const interceptedWrites = [];
const seenRequests = [];
const searchInput = 'input[aria-label="Search bins, SKUs, rooms, racks, notes"]';
const drySaveNote = 'QA desktop dry-run from browser test';
const mobileDrySaveNote = 'QA mobile scan dry-run from browser test';
const openTransitionNote = 'QA open transition dry-run';
const desktopActualCount = 22;
const mobileActualCount = 12;
const desktopEditBin = '55-1-02';
const mobileEditBin = 'B1-01';
let flowStateSnapshot = null;

function assertDryRunWrite({ write, originalBins, binCode, note, actualCount, status, skuTarget, expectOpenCleared = false }) {
  if (write.body?.updated_by !== 'frostbite-flow-dashboard') {
    throw new Error(`Unexpected updated_by on dry-run save: ${write.body?.updated_by}`);
  }

  const writtenBins = write.body?.payload?.bins || {};
  if (Object.keys(writtenBins).length !== 714) {
    throw new Error(`Dry-run save payload had ${Object.keys(writtenBins).length} bins, expected 714`);
  }

  const changedBinIds = Object.keys(writtenBins).filter(
    (binId) => JSON.stringify(writtenBins[binId]) !== JSON.stringify(originalBins[binId]),
  );
  if (changedBinIds.length !== 1) {
    throw new Error(`Dry-run save changed ${changedBinIds.length} bins, expected 1: ${changedBinIds.join(', ')}`);
  }

  const originalBin = Object.values(originalBins).find((bin) => bin.code === binCode);
  const dryRunBin = Object.values(writtenBins).find((bin) => bin.code === binCode);
  if (!originalBin || !dryRunBin) {
    throw new Error(`Dry-run save could not find bin ${binCode}`);
  }
  if (changedBinIds[0] !== originalBin.id) {
    throw new Error(`Dry-run save changed ${changedBinIds[0]}, expected ${originalBin.id}`);
  }
  if (dryRunBin.id !== originalBin.id || dryRunBin.room !== originalBin.room || dryRunBin.rack !== originalBin.rack || dryRunBin.type !== originalBin.type) {
    throw new Error(`Dry-run save changed stable identity/location fields for ${binCode}`);
  }
  if (dryRunBin.note !== note) {
    throw new Error(`Dry-run save did not patch ${binCode} note. Got: ${dryRunBin.note}`);
  }
  if (actualCount !== undefined && (dryRunBin.actualCount !== actualCount || dryRunBin.currentCount !== actualCount)) {
    throw new Error(`Dry-run save did not patch ${binCode} actual count to ${actualCount}. Got actual=${dryRunBin.actualCount} current=${dryRunBin.currentCount}`);
  }
  if (status !== undefined && dryRunBin.status !== status) {
    throw new Error(`Dry-run save did not patch ${binCode} status to ${status}. Got: ${dryRunBin.status}`);
  }
  if (skuTarget !== undefined && dryRunBin.skuTarget !== skuTarget) {
    throw new Error(`Dry-run save did not patch ${binCode} skuTarget to ${skuTarget}. Got: ${dryRunBin.skuTarget}`);
  }
  if (expectOpenCleared) {
    for (const field of ['dueDate', 'birthDate', 'growoutStartDate', 'sourceBin']) {
      if (dryRunBin[field] !== null) {
        throw new Error(`Open dry-run save should clear ${field} for ${binCode}. Got: ${dryRunBin[field]}`);
      }
    }
    for (const field of ['males', 'females', 'mothers', 'litterCount', 'pregnantFemales']) {
      if (dryRunBin[field] !== 0) {
        throw new Error(`Open dry-run save should zero ${field} for ${binCode}. Got: ${dryRunBin[field]}`);
      }
    }
  }
  if (dryRunBin.events?.length !== (originalBin.events?.length || 0) + 1) {
    throw new Error(`Dry-run save did not append exactly one bin event for ${binCode}`);
  }
}

async function allowLocalReadAndDryRunWrite(route) {
  const request = route.request();
  const url = request.url();
  const method = request.method();
  const isAllowedLocal = allowedOrigins.some((origin) => url.startsWith(origin));
  const isFlowState = isAllowedLocal && new URL(url).pathname === '/api/flow/state';
  seenRequests.push({ method, url });

  if (method === 'PUT' && isFlowState) {
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

  if (method === 'GET' && isFlowState && flowStateSnapshot) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(flowStateSnapshot),
    });
  }

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
  await desktop.route('**/*', allowLocalReadAndDryRunWrite);

  const stateResponsePromise = desktop.waitForResponse(
    (response) => response.url().endsWith('/api/flow/state') && response.request().method() === 'GET' && response.status() === 200,
    { timeout: 15000 },
  );
  await desktop.goto(localAppUrl, { waitUntil: 'networkidle' });
  const stateResponse = await stateResponsePromise;
  const stateJson = await stateResponse.json();
  flowStateSnapshot = stateJson;
  const openBinCode = Object.values(stateJson.payload?.bins || {}).find((bin) => bin.status === 'open')?.code || '10-1-03';
  await desktop.locator('text=Shared live').first().waitFor({ timeout: 10000 });

  const title = await desktop.title();
  const heading = await desktop.locator('h1').first().textContent();
  const metrics = await desktop.locator('.metric-strip').innerText();
  const okfDownloadPromise = desktop.waitForEvent('download');
  await desktop.click('[data-testid="okf-export-action"]');
  const okfDownload = await okfDownloadPromise;
  const okfPath = await okfDownload.path();
  const okfBundle = JSON.parse(readFileSync(okfPath, 'utf8'));

  await desktop.fill(searchInput, mobileEditBin);
  await desktop.waitForTimeout(300);
  const generalSearchSelectedBin = await desktop.locator('.detail-title h2').textContent();
  const searchResultsText = await desktop.locator('.search-results').innerText();

  await desktop.fill(searchInput, openBinCode);
  await desktop.press(searchInput, 'Enter');
  await desktop.waitForTimeout(300);
  const firstOpenDetailText = await desktop.locator('.detail-panel').innerText();

  await desktop.fill(searchInput, openBinCode);
  await desktop.press(searchInput, 'Enter');
  await desktop.waitForTimeout(300);
  const openDetailText = await desktop.locator('.detail-panel').innerText();

  await desktop.locator('.control-group[aria-label="Map mode"] button', { hasText: 'Wall Flow' }).click();
  await desktop.waitForTimeout(300);
  const firstWallSection = desktop.locator('.wall-section').first();
  const wallCells = await firstWallSection.locator('[data-testid="wall-walk-cell"]').count();
  const firstSlot = await firstWallSection.locator('[data-testid="wall-walk-cell"]').nth(0).getAttribute('data-wall-slot');
  const twelfthSlot = await firstWallSection.locator('[data-testid="wall-walk-cell"]').nth(11).getAttribute('data-wall-slot');
  const thirteenthSlot = await firstWallSection.locator('[data-testid="wall-walk-cell"]').nth(12).getAttribute('data-wall-slot');
  const twentyFourthSlot = await firstWallSection.locator('[data-testid="wall-walk-cell"]').nth(23).getAttribute('data-wall-slot');
  const firstCanonicalBin = await firstWallSection.locator('[data-testid="wall-walk-cell"]').nth(0).getAttribute('data-bin-code');
  await desktop.locator('.control-group[aria-label="Map mode"] button', { hasText: 'Rack Map' }).click();

  await desktop.fill(searchInput, desktopEditBin);
  await desktop.press(searchInput, 'Enter');
  await desktop.waitForTimeout(300);
  await desktop.locator('.edit-form label', { hasText: 'Status' }).locator('select').selectOption('nursery');
  await desktop.getByLabel('Actual count').fill(String(desktopActualCount));
  await desktop.locator('.edit-form textarea').fill(drySaveNote);
  await desktop.click('button:has-text("Save shared state")');
  for (let attempt = 0; attempt < 50 && interceptedWrites.length === 0; attempt += 1) {
    await desktop.waitForTimeout(100);
  }

  await desktop.fill(searchInput, '55-1-03');
  await desktop.press(searchInput, 'Enter');
  await desktop.waitForTimeout(300);
  await desktop.locator('.edit-form label', { hasText: 'Status' }).locator('select').selectOption('open');
  await desktop.locator('.edit-form textarea').fill(openTransitionNote);
  await desktop.click('button:has-text("Save shared state")');
  for (let attempt = 0; attempt < 50 && interceptedWrites.length < 2; attempt += 1) {
    await desktop.waitForTimeout(100);
  }

  await desktop.fill(searchInput, desktopEditBin);
  await desktop.press(searchInput, 'Enter');
  await desktop.waitForTimeout(300);

  const selectedBin = await desktop.locator('.detail-title h2').textContent();
  const binMapText = await desktop.locator('[data-testid="bin-map"]').innerText();
  const visibleShopifyUi = await desktop.locator('text=Shopify View').count() + await desktop.locator('text=Shopify Mapping').count();
  const removedHumanChrome =
    (await desktop.locator('[data-testid="daily-report-action"]').count()) +
    (await desktop.locator('[data-testid="scan-bin-action"]').count()) +
    (await desktop.locator('.change-preview').count()) +
    (await desktop.locator('.write-confirm').count()) +
    (await desktop.locator('.qr-card').count());
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
  await mobile.route('**/*', allowLocalReadAndDryRunWrite);
  await mobile.goto(new URL(`#${mobileEditBin}`, localAppUrl).toString(), { waitUntil: 'networkidle' });
  await mobile.fill(searchInput, mobileEditBin);
  await mobile.press(searchInput, 'Enter');
  await mobile.waitForTimeout(300);
  await mobile.locator('.edit-form label', { hasText: 'Status' }).locator('select').selectOption('breeding');
  await mobile.getByLabel('Actual count').fill(String(mobileActualCount));
  await mobile.locator('.edit-form textarea').fill(mobileDrySaveNote);
  await mobile.click('button:has-text("Save shared state")');
  for (let attempt = 0; attempt < 50 && interceptedWrites.length < 3; attempt += 1) {
    await mobile.waitForTimeout(100);
  }

  const mobileSelectedBin = await mobile.locator('.detail-title h2').textContent();
  const mobileScreenshot = path.join(outDir, 'flow-mobile.png');
  await mobile.screenshot({ path: mobileScreenshot, fullPage: true });

  await browser.close();

  const result = {
    title,
    heading,
    generalSearchSelectedBin,
    selectedBin,
    mobileSelectedBin,
    metrics,
    searchResultsText,
    firstOpenDetailText,
    openDetailText,
    wallCells,
    firstSlot,
    twelfthSlot,
    thirteenthSlot,
    twentyFourthSlot,
    firstCanonicalBin,
    binMapText,
    visibleShopifyUi,
    removedHumanChrome,
    okfFilename: okfDownload.suggestedFilename(),
    okfBundleType: okfBundle.bundle_type,
    okfGraphNodes: okfBundle.graph?.nodes?.length || 0,
    okfGraphEdges: okfBundle.graph?.edges?.length || 0,
    okfInventorySkuCount: okfBundle.inventory_by_sku?.length || 0,
    okfPerBinCount: okfBundle.per_bin_inventory?.length || 0,
    localAppUrl,
    stateId: stateJson.id,
    stateBinCount: Object.keys(stateJson.payload?.bins || {}).length,
    dryRunWriteCount: interceptedWrites.length,
    dryRunWriteUpdatedBy: interceptedWrites[0]?.body?.updated_by,
    requestCount: seenRequests.length,
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
  if (result.stateId !== 'frostbite-flow-live') {
    throw new Error(`Expected live shared state, got ${result.stateId}`);
  }
  if (result.stateBinCount !== 714) {
    throw new Error(`Expected 714 live bins, got ${result.stateBinCount}`);
  }
  if (!searchResultsText.includes(mobileEditBin)) {
    throw new Error(`Search results did not show expected bin match: ${searchResultsText}`);
  }
  for (const expected of ['Open', 'Available bin capacity', 'ACTUAL', '0 in bin']) {
    if (!firstOpenDetailText.includes(expected)) {
      throw new Error(`Open bin detail missing ${expected}: ${firstOpenDetailText}`);
    }
  }
  for (const expected of ['Open', 'Available bin capacity', 'ACTUAL', '0 in bin']) {
    if (!openDetailText.includes(expected)) {
      throw new Error(`Open detail missing ${expected}: ${openDetailText}`);
    }
  }
  if (openDetailText.includes('SKU TARGET')) {
    throw new Error(`Open detail should not expose SKU target controls: ${openDetailText}`);
  }
  if (wallCells !== 120) {
    throw new Error(`Wall Flow expected 120 cells, got ${wallCells}`);
  }
  if (firstSlot !== 'A01') throw new Error(`Expected first Wall Flow slot A01, got ${firstSlot}`);
  if (twelfthSlot !== 'A12') throw new Error(`Expected twelfth Wall Flow slot A12, got ${twelfthSlot}`);
  if (thirteenthSlot !== 'B12') throw new Error(`Expected serpentine Wall Flow slot B12 after A12, got ${thirteenthSlot}`);
  if (twentyFourthSlot !== 'B01') throw new Error(`Expected end of second Wall Flow level B01, got ${twentyFourthSlot}`);
  if (!firstCanonicalBin || firstCanonicalBin === firstSlot) {
    throw new Error(`Wall Flow must preserve canonical bin code separately from wall slot. Got ${firstCanonicalBin}`);
  }
  if (removedHumanChrome > 0) {
    throw new Error(`Removed operator chrome is still present (${removedHumanChrome} match/es).`);
  }
  if (visibleShopifyUi > 0) {
    throw new Error('Visible Shopify workflow copy should not be present in the operator UI');
  }
  if (binMapText.includes('No bins match this filter.')) {
    throw new Error('Bin map should remain visible after bin search; got empty filter state');
  }
  for (const legendLabel of ['Action needed', 'Due soon', 'In use', 'Ready']) {
    if (!binMapText.includes(legendLabel)) {
      throw new Error(`Bin activity legend is missing ${legendLabel}`);
    }
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
  const b101 = okfBundle.per_bin_inventory.find((row) => row.bin === mobileEditBin);
  const g101 = okfBundle.per_bin_inventory.find((row) => row.bin === 'G1-01');
  if (!b101) throw new Error(`OKF per-bin inventory missing ${mobileEditBin}`);
  if (!g101) throw new Error('OKF per-bin inventory missing G1-01');
  if ((okfBundle.graph?.nodes?.length || 0) < 714 || (okfBundle.graph?.edges?.length || 0) < 714) {
    throw new Error('OKF graph is missing expected room/rack/bin/SKU nodes or edges');
  }
  const nodeIds = okfBundle.graph.nodes.map((node) => node.id);
  const uniqueNodeIds = new Set(nodeIds);
  if (uniqueNodeIds.size !== nodeIds.length) {
    throw new Error(`OKF graph has duplicate node IDs: ${nodeIds.length - uniqueNodeIds.size}`);
  }
  const brokenEdges = okfBundle.graph.edges.filter((edge) => !uniqueNodeIds.has(edge.from) || !uniqueNodeIds.has(edge.to));
  if (brokenEdges.length > 0) {
    throw new Error(`OKF graph has ${brokenEdges.length} broken edge reference(s)`);
  }
  if (!okfBundle.agent_interface?.invariant?.includes('Shopify remains read-only')) {
    throw new Error('OKF bundle is missing the Shopify read-only invariant');
  }
  if (interceptedWrites.length !== 3) {
    throw new Error(`Expected three dry-run save writes, got ${interceptedWrites.length}`);
  }
  const originalBins = stateJson.payload?.bins || {};
  assertDryRunWrite({
    write: interceptedWrites[0],
    originalBins,
    binCode: desktopEditBin,
    note: drySaveNote,
    actualCount: desktopActualCount,
    status: 'nursery',
  });
  assertDryRunWrite({
    write: interceptedWrites[1],
    originalBins,
    binCode: '55-1-03',
    note: openTransitionNote,
    actualCount: 0,
    status: 'open',
    skuTarget: null,
    expectOpenCleared: true,
  });
  assertDryRunWrite({
    write: interceptedWrites[2],
    originalBins,
    binCode: mobileEditBin,
    note: mobileDrySaveNote,
    actualCount: mobileActualCount,
    status: 'breeding',
  });
  const shopifyRequests = seenRequests.filter((request) => request.url.toLowerCase().includes('shopify'));
  if (shopifyRequests.length > 0) {
    throw new Error(`Unexpected Shopify request(s): ${shopifyRequests.map((request) => `${request.method} ${request.url}`).join(', ')}`);
  }
  if (title !== 'Frostbite Flow') {
    throw new Error(`Unexpected page title: ${title}`);
  }
  if (heading !== 'Frostbite Flow') {
    throw new Error(`Unexpected app heading: ${heading}`);
  }
  if (generalSearchSelectedBin !== mobileEditBin) {
    throw new Error(`General search selected ${generalSearchSelectedBin}, expected ${mobileEditBin}`);
  }
  if (selectedBin !== desktopEditBin) {
    throw new Error(`QR lookup selected ${selectedBin}, expected ${desktopEditBin}`);
  }
  if (mobileSelectedBin !== mobileEditBin) {
    throw new Error(`Mobile hash selected ${mobileSelectedBin}, expected ${mobileEditBin}`);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
