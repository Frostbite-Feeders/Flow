import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

if (process.env.FLOW_RESET_EMPTY_START !== '1') {
  throw new Error('Refusing reset. Re-run with FLOW_RESET_EMPTY_START=1 when you intentionally want to clear Flow inventory state.');
}

const root = process.cwd();
const backupDir = path.join(root, 'backups');
mkdirSync(backupDir, { recursive: true });

const apiBase = process.env.FLOW_API_BASE || 'https://app.frostbitefeeders.com/api/flow';
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

function resetBin(bin) {
  return {
    ...bin,
    status: 'open',
    skuTarget: null,
    actualCount: 0,
    currentCount: 0,
    males: 0,
    females: 0,
    mothers: 0,
    motherSlots: 0,
    activeVacationMothers: 0,
    litterCount: 0,
    pregnantFemales: 0,
    note: '',
    dueDate: null,
    birthDate: null,
    growoutStartDate: null,
    sourceBin: null,
    updatedAt: null,
    events: [],
  };
}

async function main() {
  const originalRecord = await flowGetState();
  const backupPath = path.join(backupDir, `flow-empty-start-before-${stamp()}.json`);
  writeFileSync(backupPath, `${JSON.stringify(originalRecord, null, 2)}\n`);

  const payload = clone(originalRecord.payload);
  const entries = Object.entries(payload.bins || {});
  if (entries.length !== 714) {
    throw new Error(`Expected 714 bins before reset, got ${entries.length}`);
  }

  for (const [id, bin] of entries) {
    payload.bins[id] = resetBin(bin);
  }
  payload.events = [];
  payload.vacations = [];
  payload.freezerEvents = [];
  payload.freezerInventory = {};

  await flowPutState(payload, 'frostbite-flow-empty-start-reset');

  const resetRecord = await flowGetState();
  const bins = Object.values(resetRecord.payload?.bins || {});
  const failures = bins.filter((bin) =>
    bin.status !== 'open' ||
    bin.skuTarget !== null ||
    bin.actualCount !== 0 ||
    bin.currentCount !== 0 ||
    bin.motherSlots !== 0 ||
    bin.activeVacationMothers !== 0 ||
    bin.dueDate !== null ||
    bin.birthDate !== null ||
    bin.growoutStartDate !== null ||
    bin.sourceBin !== null ||
    bin.updatedAt !== null ||
    bin.note !== '' ||
    (bin.events?.length || 0) !== 0
  );

  const payloadFailures = [];
  if ((resetRecord.payload?.events || []).length !== 0) payloadFailures.push('events');
  if ((resetRecord.payload?.vacations || []).length !== 0) payloadFailures.push('vacations');
  if ((resetRecord.payload?.freezerEvents || []).length !== 0) payloadFailures.push('freezerEvents');
  if (Object.keys(resetRecord.payload?.freezerInventory || {}).length !== 0) payloadFailures.push('freezerInventory');

  if (bins.length !== 714 || failures.length > 0 || payloadFailures.length > 0) {
    throw new Error(`Reset verification failed. bins=${bins.length}; binFailures=${failures.length}; payloadFailures=${payloadFailures.join(',')}`);
  }

  console.log(JSON.stringify({
    stateId: resetRecord.id,
    binCount: bins.length,
    backupPath,
    openBins: bins.filter((bin) => bin.status === 'open').length,
    activeBins: bins.filter((bin) => bin.status !== 'open').length,
    motherSlotBins: bins.filter((bin) => Number(bin.motherSlots || 0) !== 0).length,
    activeVacationMotherBins: bins.filter((bin) => Number(bin.activeVacationMothers || 0) !== 0).length,
    datedBins: bins.filter((bin) => bin.dueDate || bin.birthDate || bin.growoutStartDate).length,
    updatedBins: bins.filter((bin) => bin.updatedAt).length,
    eventBins: bins.filter((bin) => (bin.events?.length || 0) > 0).length,
    noteBins: bins.filter((bin) => bin.note).length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
