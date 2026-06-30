import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bell,
  Check,
  ClipboardList,
  Download,
  FileText,
  Loader2,
  MapPinned,
  Search,
  Snowflake,
  Sparkles,
  Wifi,
  WifiOff,
} from 'lucide-react';
import inventoryCsv from '../data/exports/frostbite-inventory-2026-06-18.csv?raw';
import './styles.css';

const TODAY = getLocalDateKey();
const TODAY_LABEL = formatDisplayDate(TODAY);
const FLOW_API_BASE = '/api/flow';
const TENANT_ID = 'frostbite';
const RECOVERY_BASELINE = {
  label: 'June 18 recovered inventory CSV',
  date: '2026-06-18',
  rows: 714,
  sha256: '420C32AEDE4E14B78EB8F45A16E5157C7C6E06D21997623DE4D80BAE4FB1D4A1',
};
const ROOMS = ['all', 'breeding', 'nursery', 'growout'];
const STATUS_ORDER = ['breeding', 'nursery', 'growout', 'open'];
const SKU_OPTIONS = ['No SKU', 'Pinky', 'Fuzzy', 'Pup', 'Weaned', 'Small', 'Smedium', 'Medium', 'Large', 'Jumbo'];
const WORK_QUEUES = {
  all: { label: 'All Work' },
  alerts: { label: 'Needs Check' },
  tasks: { label: 'Due Soon' },
};
const MAP_MODES = {
  rack: 'Rack Map',
  wall: 'Wall Flow',
};
const WALL_LEVELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const WALL_COLUMNS = 12;
const WALL_CAPACITY = WALL_LEVELS.length * WALL_COLUMNS;

const STATUS_COPY = {
  breeding: 'Breeding',
  nursery: 'Nursery',
  growout: 'Growout',
  open: 'Open',
};

const WORKFLOW_COPY = {
  breeding: {
    label: 'Breeding',
    cardLabel: 'Actual',
    detail: 'Breeder inventory, pairing, pregnancy, and due checks',
    primaryFields: ['status', 'actualCount', 'males', 'females', 'pregnantFemales', 'dueDate'],
  },
  nursery: {
    label: 'Nursery',
    cardLabel: 'Actual',
    detail: 'Mother plus litter count, birth date, and weaning target',
    primaryFields: ['status', 'actualCount', 'mothers', 'birthDate', 'ratsPerLitter', 'sku'],
  },
  growout: {
    label: 'Growout',
    cardLabel: 'Actual',
    detail: 'Feeder count, growout start, source bin, and size target',
    primaryFields: ['status', 'actualCount', 'sku', 'growoutStart', 'sourceBin'],
  },
  open: {
    label: 'Open',
    cardLabel: 'Actual',
    detail: 'Available bin capacity',
    primaryFields: ['status', 'actualCount'],
  },
};

const SKU_TO_TARGET = {
  'No SKU': null,
  Pinky: 'pinky',
  Fuzzy: 'fuzzy',
  Pup: 'pup',
  Weaned: 'weaned',
  Small: 'small',
  Smedium: 'smedium',
  Medium: 'medium',
  Large: 'large',
  Jumbo: 'jumbo',
};

const TARGET_TO_SKU = Object.fromEntries(
  Object.entries(SKU_TO_TARGET).map(([label, target]) => [target, label]),
);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else if (char !== '\r') {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records
    .filter((record) => record.some(Boolean))
    .map((record) =>
      Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])),
    );
}

function toNumber(value) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateKey) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function normalizeSku(value) {
  if (!value) return 'No SKU';
  return value
    .split(/[-_\s]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

const csvRows = parseCsv(inventoryCsv);
const csvHeaders = Object.keys(csvRows[0] || {});

const baselineRows = csvRows.map((row) => ({
  bin: row.Bin,
  apiId: null,
  room: row.Room,
  rack: row.Rack,
  type: row.Type,
  status: row.Status,
  sku: row.SKU,
  males: toNumber(row.Males),
  females: toNumber(row.Females),
  pregnantFemales: toNumber(row['Pregnant Females']),
  mothers: toNumber(row.Mothers),
  motherSlots: toNumber(row['Mother Slots']),
  ratsPerLitter: toNumber(row['Rats/Litter']),
  dueDate: row['Due Date'] || '',
  birthDate: row['Birth Date'] || '',
  growoutStart: row['Grow-out Start'] || '',
  sourceBin: row['Source Bin'] || '',
  activeVacationMothers: toNumber(row['Active Vacation Mothers']),
  labelPrimary: row['Label Primary'],
  labelSecondary: row['Label Secondary'],
  qrTarget: row['QR Target'],
  freezerOnHand: row['SKU Freezer On Hand'],
  shopifyVariantIds: row['Shopify Variant IDs'],
  lastEvent: row['Last Event'],
  note: row.Note,
  updatedAt: row['Updated At'],
  raw: row,
})).map((row) => ({
  ...row,
  actualCount: deriveActualCount(row),
}));

function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function uniqueValues(rows, field) {
  return [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

function sortPhysicalRows(rows) {
  return [...rows].sort((a, b) =>
    a.room.localeCompare(b.room, undefined, { numeric: true }) ||
    a.rack.localeCompare(b.rack, undefined, { numeric: true }) ||
    a.bin.localeCompare(b.bin, undefined, { numeric: true }),
  );
}

function buildWallSections(rows) {
  const orderedRows = sortPhysicalRows(rows);
  const sectionCount = Math.max(1, Math.ceil(orderedRows.length / WALL_CAPACITY));

  return Array.from({ length: sectionCount }, (_, wallIndex) => {
    const start = wallIndex * WALL_CAPACITY;
    const wallRows = orderedRows.slice(start, start + WALL_CAPACITY);
    const cells = Array.from({ length: WALL_CAPACITY }, (_, pathIndex) => {
      const levelIndex = Math.floor(pathIndex / WALL_COLUMNS);
      const stepIndex = pathIndex % WALL_COLUMNS;
      const column = levelIndex % 2 === 0 ? stepIndex + 1 : WALL_COLUMNS - stepIndex;
      return {
        id: `${wallIndex}-${pathIndex}`,
        row: wallRows[pathIndex] || null,
        pathIndex: start + pathIndex + 1,
        level: WALL_LEVELS[levelIndex],
        column,
      };
    });

    return {
      id: `wall-${wallIndex + 1}`,
      label: `Wall ${wallIndex + 1}`,
      start,
      rows: wallRows,
      cells,
    };
  });
}

function buildWallAssignments(rows) {
  const assignments = new Map();
  buildWallSections(rows).forEach((section) => {
    section.cells.forEach((cell) => {
      if (!cell.row) return;
      const wallSlot = `${cell.level}${String(cell.column).padStart(2, '0')}`;
      assignments.set(cell.row.bin, {
        wall_id: section.id,
        wall_label: section.label,
        wall_level: cell.level,
        wall_position: cell.column,
        wall_slot: wallSlot,
        wall_walk_index: cell.pathIndex,
      });
    });
  });
  return assignments;
}

function daysUntil(date) {
  if (!date) return null;
  const today = new Date(`${TODAY}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

function formatDate(date) {
  if (!date) return 'Not set';
  const delta = daysUntil(date);
  if (delta === 0) return `${date} - today`;
  if (delta === 1) return `${date} - tomorrow`;
  if (delta < 0) return `${date} - ${Math.abs(delta)}d overdue`;
  return `${date} - ${delta}d`;
}

function deriveActualCount(row) {
  if (row?.status === 'open') return 0;
  if (row?.actualCount !== undefined && row.actualCount !== null && row.actualCount !== '') {
    return toNumber(row.actualCount);
  }
  if (row?.currentCount !== undefined && row.currentCount !== null && row.currentCount !== '') {
    return toNumber(row.currentCount);
  }
  if (row?.room === 'nursery') {
    return toNumber(row.mothers) + toNumber(row.ratsPerLitter);
  }
  if (row?.room === 'growout') {
    return toNumber(row.ratsPerLitter);
  }
  if (row?.room === 'breeding') {
    const sexedTotal = toNumber(row.males) + toNumber(row.females);
    return sexedTotal || toNumber(row.mothers);
  }
  return toNumber(row.ratsPerLitter);
}

function getWorkflow(row) {
  if (row.status === 'open') return WORKFLOW_COPY.open;
  return WORKFLOW_COPY[row.room] || WORKFLOW_COPY.open;
}

function getBinCardMeta(row) {
  if (row.status === 'open') {
    return {
      primary: `${row.actualCount || 0} in bin`,
      secondary: `${WORKFLOW_COPY[row.room]?.label || row.room} space`,
    };
  }
  if (row.room === 'breeding') {
    return {
      primary: `${row.actualCount || 0} in bin`,
      secondary: `${row.males || 0}M/${row.females || 0}F`,
    };
  }
  if (row.room === 'nursery') {
    return {
      primary: `${row.actualCount || 0} in bin`,
      secondary: `${row.ratsPerLitter || 0} pups + ${row.mothers || 0} mom`,
    };
  }
  if (row.room === 'growout') {
    return {
      primary: `${row.actualCount || 0} in bin`,
      secondary: row.sku || 'No target',
    };
  }
  return {
    primary: row.type || 'available',
    secondary: 'ready',
  };
}

function getCardSignal(activity, meta) {
  if (activity.key === 'needs-action') return 'Check';
  if (activity.key === 'due-soon') return 'Due soon';
  return meta.secondary;
}

function matchesWorkQueue(row, queue) {
  const due = daysUntil(row.dueDate);
  if (queue === 'alerts') return due !== null && due < 0;
  if (queue === 'tasks') return due !== null && due >= 0 && due <= 7;
  return true;
}

function classNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadText(filename, text, type = 'text/csv') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 0);
}

function rowToRaw(row) {
  return {
    ...row.raw,
    Status: row.status,
    SKU: row.sku,
    Males: String(row.males ?? 0),
    Females: String(row.females ?? 0),
    Mothers: String(row.mothers ?? 0),
    'Mother Slots': String(row.motherSlots ?? 0),
    'Active Vacation Mothers': String(row.activeVacationMothers ?? 0),
    'Pregnant Females': String(row.pregnantFemales ?? 0),
    'Rats/Litter': String(row.ratsPerLitter ?? 0),
    'Due Date': row.dueDate || '',
    'Birth Date': row.birthDate || '',
    'Grow-out Start': row.growoutStart || '',
    'Source Bin': row.sourceBin || '',
    Note: row.note || '',
    'Last Event': row.lastEvent || '',
    'Updated At': row.updatedAt || '',
  };
}

function rowsToCsv(rows) {
  return [
    csvHeaders.map(csvEscape).join(','),
    ...rows.map((row) => {
      const raw = rowToRaw(row);
      return csvHeaders.map((header) => csvEscape(raw[header])).join(',');
    }),
  ].join('\n');
}

function clonePayload(payload) {
  return JSON.parse(JSON.stringify(payload || {}));
}

function mergeSharedState(rows, payload) {
  const apiBins = Object.values(payload?.bins || {});
  if (!apiBins.length) return rows;
  const byCode = new Map(apiBins.map((bin) => [bin.code, bin]));
  const remoteValue = (remote, field, fallback) => (
    Object.prototype.hasOwnProperty.call(remote, field) ? remote[field] : fallback
  );

  return rows.map((row) => {
    const remote = byCode.get(row.bin);
    if (!remote) return row;
    const nextStatus = remoteValue(remote, 'status', row.status) || 'open';
    const nextRoom = remoteValue(remote, 'room', row.room) || row.room;
    const remoteNote = remoteValue(remote, 'note', row.note);
    const remoteEvents = remoteValue(remote, 'events', undefined);
    return {
      ...row,
      apiId: remoteValue(remote, 'id', row.apiId) || row.apiId,
      room: nextRoom,
      rack: remoteValue(remote, 'rackLabel', row.rack) || row.rack,
      type: remoteValue(remote, 'type', row.type) || row.type,
      status: nextStatus,
      sku: nextStatus === 'open' ? 'No SKU' : TARGET_TO_SKU[remoteValue(remote, 'skuTarget', null)] || row.sku,
      actualCount: deriveActualCount({
        ...row,
        status: nextStatus,
        room: nextRoom,
        actualCount: remoteValue(remote, 'actualCount', row.actualCount),
        currentCount: remoteValue(remote, 'currentCount', row.actualCount),
        males: remoteValue(remote, 'males', row.males),
        females: remoteValue(remote, 'females', row.females),
        mothers: remoteValue(remote, 'mothers', row.mothers),
        ratsPerLitter: remoteValue(remote, 'litterCount', row.ratsPerLitter),
      }),
      males: toNumber(remoteValue(remote, 'males', row.males)),
      females: toNumber(remoteValue(remote, 'females', row.females)),
      pregnantFemales: toNumber(remoteValue(remote, 'pregnantFemales', row.pregnantFemales)),
      mothers: toNumber(remoteValue(remote, 'mothers', row.mothers)),
      motherSlots: toNumber(remoteValue(remote, 'motherSlots', row.motherSlots)),
      activeVacationMothers: toNumber(remoteValue(remote, 'activeVacationMothers', row.activeVacationMothers)),
      ratsPerLitter: toNumber(remoteValue(remote, 'litterCount', row.ratsPerLitter)),
      dueDate: remoteValue(remote, 'dueDate', row.dueDate) || '',
      birthDate: remoteValue(remote, 'birthDate', row.birthDate) || '',
      growoutStart: remoteValue(remote, 'growoutStartDate', row.growoutStart) || '',
      sourceBin: remoteValue(remote, 'sourceBin', row.sourceBin) || '',
      note: remoteNote || '',
      updatedAt: remoteValue(remote, 'updatedAt', row.updatedAt) || '',
      lastEvent: Array.isArray(remoteEvents) ? remoteEvents.at(-1)?.title || '' : row.lastEvent,
    };
  });
}

function draftFromRow(row) {
  return {
    status: row.status,
    sku: row.sku,
    actualCount: row.actualCount,
    dueDate: row.dueDate || '',
    birthDate: row.birthDate || '',
    growoutStart: row.growoutStart || '',
    sourceBin: row.sourceBin || '',
    males: row.males,
    females: row.females,
    mothers: row.mothers,
    ratsPerLitter: row.ratsPerLitter,
    pregnantFemales: row.pregnantFemales,
    note: row.note || '',
  };
}

function getDraftChanges(row, draft) {
  if (!row || !draft) return [];
  const effectiveStatus = draft.status;
  const effectiveSku = effectiveStatus === 'open' ? 'No SKU' : draft.sku;
  const effectiveActualCount = effectiveStatus === 'open' ? 0 : toNumber(draft.actualCount);
  const effectiveDueDate = effectiveStatus === 'open' ? '' : draft.dueDate || '';
  const effectiveBirthDate = effectiveStatus === 'open' ? '' : draft.birthDate || '';
  const effectiveGrowoutStart = effectiveStatus === 'open' ? '' : draft.growoutStart || '';
  const effectiveSourceBin = effectiveStatus === 'open' ? '' : draft.sourceBin || '';
  const effectiveMales = effectiveStatus === 'open' ? 0 : toNumber(draft.males);
  const effectiveFemales = effectiveStatus === 'open' ? 0 : toNumber(draft.females);
  const effectiveMothers = effectiveStatus === 'open' ? 0 : toNumber(draft.mothers);
  const effectiveRatsPerLitter = effectiveStatus === 'open' ? 0 : toNumber(draft.ratsPerLitter);
  const effectivePregnantFemales = effectiveStatus === 'open' ? 0 : toNumber(draft.pregnantFemales);
  const checks = [
    ['Status', row.status, effectiveStatus],
    ['SKU', row.sku, effectiveSku],
    ['Actual count', String(row.actualCount ?? 0), String(effectiveActualCount)],
    ['Due date', row.dueDate || '', effectiveDueDate],
    ['Birth date', row.birthDate || '', effectiveBirthDate],
    ['Growout start', row.growoutStart || '', effectiveGrowoutStart],
    ['Source bin', row.sourceBin || '', effectiveSourceBin],
    ['Males', String(row.males ?? 0), String(effectiveMales)],
    ['Females', String(row.females ?? 0), String(effectiveFemales)],
    ['Mothers', String(row.mothers ?? 0), String(effectiveMothers)],
    ['Rats / litter', String(row.ratsPerLitter ?? 0), String(effectiveRatsPerLitter)],
    ['Pregnant', String(row.pregnantFemales ?? 0), String(effectivePregnantFemales)],
    ['Floor note', row.note || '', draft.note || ''],
  ];

  return checks
    .filter(([, before, after]) => String(before) !== String(after))
    .map(([label, before, after]) => ({ label, before: before || 'blank', after: after || 'blank' }));
}

function getRowActivity(row) {
  if (row.status === 'open') return { key: 'ready', label: 'Ready' };
  const due = daysUntil(row.dueDate);
  if (due !== null && due < 0) return { key: 'needs-action', label: 'Action needed' };
  if (due !== null && due <= 7) return { key: 'due-soon', label: 'Due soon' };
  return { key: 'in-use', label: 'In use' };
}

function buildSkuInventory(rows) {
  const bySku = rows.reduce((acc, row) => {
    const sku = row.sku || 'No SKU';
    acc[sku] = acc[sku] || {
      sku,
      bins: 0,
      activeBins: 0,
      openBins: 0,
      dueSoon: 0,
      overdue: 0,
      estimatedAnimals: 0,
      freezerOnHand: 0,
    };
    acc[sku].bins += 1;
    if (row.status === 'open') acc[sku].openBins += 1;
    if (row.status !== 'open') acc[sku].activeBins += 1;
    if (row.status !== 'open' && daysUntil(row.dueDate) !== null && daysUntil(row.dueDate) >= 0 && daysUntil(row.dueDate) <= 7) acc[sku].dueSoon += 1;
    if (row.status !== 'open' && daysUntil(row.dueDate) !== null && daysUntil(row.dueDate) < 0) acc[sku].overdue += 1;
    acc[sku].estimatedAnimals += toNumber(row.actualCount);
    acc[sku].freezerOnHand += toNumber(row.freezerOnHand);
    return acc;
  }, {});

  return Object.values(bySku).sort((a, b) => a.sku.localeCompare(b.sku));
}

function getChangedRows(rows) {
  const baselineByBin = new Map(baselineRows.map((row) => [row.bin, row]));
  return rows
    .map((row) => {
      const baseline = baselineByBin.get(row.bin);
      if (!baseline) return null;
      const changes = [
        ['status', baseline.status, row.status],
        ['sku', baseline.sku, row.sku],
        ['actualCount', String(baseline.actualCount ?? 0), String(row.actualCount ?? 0)],
        ['dueDate', baseline.dueDate || '', row.dueDate || ''],
        ['birthDate', baseline.birthDate || '', row.birthDate || ''],
        ['growoutStart', baseline.growoutStart || '', row.growoutStart || ''],
        ['sourceBin', baseline.sourceBin || '', row.sourceBin || ''],
        ['males', String(baseline.males ?? 0), String(row.males ?? 0)],
        ['females', String(baseline.females ?? 0), String(row.females ?? 0)],
        ['mothers', String(baseline.mothers ?? 0), String(row.mothers ?? 0)],
        ['ratsPerLitter', String(baseline.ratsPerLitter ?? 0), String(row.ratsPerLitter ?? 0)],
        ['note', baseline.note || '', row.note || ''],
        ['updatedAt', baseline.updatedAt || '', row.updatedAt || ''],
      ]
        .filter(([, before, after]) => String(before) !== String(after))
        .map(([field, before, after]) => ({ field, before, after }));
      return changes.length ? { bin: row.bin, room: row.room, rack: row.rack, activity: getRowActivity(row).key, changes } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.bin.localeCompare(b.bin, undefined, { numeric: true }));
}

async function flowApi(path, options = {}) {
  const response = await fetch(`${FLOW_API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': TENANT_ID,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(body?.error || body?.message || `Flow API ${response.status}`);
  }
  return body;
}

function App() {
  const [rows, setRows] = useState(baselineRows);
  const [remoteRecord, setRemoteRecord] = useState(null);
  const [syncState, setSyncState] = useState({
    status: 'connecting',
    label: 'Connecting to shared Flow state',
    detail: 'Loading Supabase-backed state through /api/flow...',
  });
  const [activeRoom, setActiveRoom] = useState('all');
  const [activeRack, setActiveRack] = useState(() => baselineRows[0]?.rack || 'all');
  const [activeStatus, setActiveStatus] = useState('all');
  const [activeWorkQueue, setActiveWorkQueue] = useState('all');
  const [mapMode, setMapMode] = useState('rack');
  const [query, setQuery] = useState(() => decodeURIComponent(window.location.hash.replace(/^#/, '')));
  const [selectedBin, setSelectedBin] = useState(() => query || '10-1-01');
  const [draft, setDraft] = useState(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const draftSourceRef = useRef({ bin: null, updatedAt: null });
  const searchRef = useRef(null);

  useEffect(() => {
    let ignore = false;
    async function loadSharedState() {
      try {
        const record = await flowApi('/state');
        if (ignore) return;
        setRemoteRecord(record);
        setRows(mergeSharedState(baselineRows, record.payload));
        setSyncState({
          status: 'live',
          label: 'Shared live',
          detail: `Supabase state loaded - ${record.updated_at ? new Date(record.updated_at).toLocaleString() : 'ready'}`,
        });
      } catch (error) {
        if (ignore) return;
        setSyncState({
          status: 'offline',
          label: 'Local fallback',
          detail: error.message,
        });
      }
    }
    loadSharedState();
    return () => {
      ignore = true;
    };
  }, []);

  const summaries = useMemo(() => {
    const roomCounts = countBy(rows, 'room');
    const statusCounts = countBy(rows, 'status');
    const dueSoon = rows.filter((row) => {
      if (row.status === 'open') return false;
      const due = daysUntil(row.dueDate);
      return due !== null && due >= 0 && due <= 7;
    });
    const overdue = rows.filter((row) => {
      if (row.status === 'open') return false;
      const due = daysUntil(row.dueDate);
      return due !== null && due < 0;
    });
    const activeRows = rows.filter((row) => row.status !== 'open');
    const staleRows = rows.filter((row) => {
      if (!row.updatedAt) return true;
      const updated = new Date(row.updatedAt);
      const today = new Date(`${TODAY}T00:00:00`);
      return (today - updated) / 86400000 > 2;
    });
    return { roomCounts, statusCounts, dueSoon, overdue, activeRows, staleRows };
  }, [rows]);

  const changedTodayRows = useMemo(() => {
    return rows.filter((row) => (row.updatedAt || '').startsWith(TODAY));
  }, [rows]);

  const racks = useMemo(() => {
    const roomRows = activeRoom === 'all'
      ? rows
      : rows.filter((row) => row.room === activeRoom);
    return ['all', ...uniqueValues(roomRows, 'rack')];
  }, [activeRoom, rows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (activeRoom !== 'all' && row.room !== activeRoom) return false;
      if (activeRack !== 'all' && row.rack !== activeRack) return false;
      if (activeStatus !== 'all' && row.status !== activeStatus) return false;
      if (!normalizedQuery) return true;
      return [
        row.bin,
        row.room,
        row.rack,
        row.type,
        row.status,
        row.sku,
        row.note,
        row.lastEvent,
        row.qrTarget,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
    });
  }, [activeRack, activeRoom, activeStatus, query, rows]);

  const searchMatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return rows
      .filter((row) =>
        [
          row.bin,
          row.room,
          row.rack,
          row.type,
          row.status,
          row.sku,
          row.note,
          row.lastEvent,
          row.qrTarget,
        ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery)),
      )
      .sort((a, b) => {
        const aExact = a.bin.toLowerCase() === normalizedQuery ? 0 : 1;
        const bExact = b.bin.toLowerCase() === normalizedQuery ? 0 : 1;
        return aExact - bExact || a.bin.localeCompare(b.bin, undefined, { numeric: true });
      });
  }, [query, rows]);

  const mapRows = useMemo(() => {
    return rows.filter((row) => {
      if (activeRoom !== 'all' && row.room !== activeRoom) return false;
      if (activeRack !== 'all' && row.rack !== activeRack) return false;
      if (activeStatus !== 'all' && row.status !== activeStatus) return false;
      if (!matchesWorkQueue(row, activeWorkQueue)) return false;
      return true;
    });
  }, [activeRack, activeRoom, activeStatus, activeWorkQueue, rows]);

  const searchMatchBins = useMemo(() => {
    return new Set(searchMatches.map((row) => row.bin));
  }, [searchMatches]);

  const selected = useMemo(() => {
    const visibleMatch = filteredRows.find((row) => row.bin === selectedBin);
    return visibleMatch || filteredRows[0] || rows.find((row) => row.bin === selectedBin) || rows[0];
  }, [filteredRows, rows, selectedBin]);

  useEffect(() => {
    if (!selected) return;
    const sourceChanged =
      draftSourceRef.current.bin !== selected.bin ||
      draftSourceRef.current.updatedAt !== selected.updatedAt;

    if (!draftDirty || draftSourceRef.current.bin !== selected.bin) {
      setDraft(draftFromRow(selected));
      setDraftDirty(false);
      draftSourceRef.current = {
        bin: selected.bin,
        updatedAt: selected.updatedAt || '',
      };
      return;
    }

    if (sourceChanged) {
      setSyncState({
        status: 'offline',
        label: 'Review refresh',
        detail: `${selected.bin} changed in shared Flow while this edit is open. Refresh before saving.`,
      });
    }
  }, [draftDirty, selected?.bin, selected?.updatedAt]);

  useEffect(() => {
    if (!query.trim() || !searchMatches.length) return;
    const exact = searchMatches.find((row) => row.bin.toLowerCase() === query.trim().toLowerCase());
    const next = exact || searchMatches[0];
    if (next?.bin && next.bin !== selectedBin && !draftDirty) {
      setSelectedBin(next.bin);
      window.history.replaceState(null, '', `#${encodeURIComponent(next.bin)}`);
    }
  }, [draftDirty, query, searchMatches, selectedBin]);

  const rackGroups = useMemo(() => {
    return mapRows.reduce((acc, row) => {
      acc[row.rack] = acc[row.rack] || [];
      acc[row.rack].push(row);
      return acc;
    }, {});
  }, [mapRows]);

  const wallSections = useMemo(() => buildWallSections(mapRows), [mapRows]);
  const wallAssignments = useMemo(() => buildWallAssignments(rows), [rows]);

  const operatorActions = useMemo(() => {
    const overdue = [...summaries.overdue].sort((a, b) => (daysUntil(a.dueDate) ?? 0) - (daysUntil(b.dueDate) ?? 0));
    const nextDue = [...summaries.dueSoon].sort((a, b) => (daysUntil(a.dueDate) ?? 999) - (daysUntil(b.dueDate) ?? 999));
    const openNurseryRows = rows.filter((row) => row.room === 'nursery' && row.status === 'open');
    const breedingDueMissing = rows.filter((row) => row.status === 'breeding' && !row.dueDate);
    const editedToday = [...changedTodayRows].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return [
      {
        id: 'overdue',
        tone: overdue.length ? 'danger' : 'ok',
        title: overdue.length ? `${overdue.length} overdue bins` : 'No overdue bins',
        detail: overdue.length ? `${overdue.slice(0, 3).map((row) => row.bin).join(', ')} should be checked first.` : 'Nothing is past due in the loaded state.',
        rows: overdue,
      },
      {
        id: 'due-soon',
        tone: nextDue.length ? 'warn' : 'ok',
        title: `${nextDue.length} due soon`,
        detail: `${nextDue.length ? nextDue.map((row) => row.bin).join(', ') : 'No bins'} due next in the nursery/growout flow.`,
        rows: nextDue.slice(0, 12),
      },
      {
        id: 'breeding-missing-dates',
        tone: breedingDueMissing.length ? 'warn' : 'ok',
        title: `${breedingDueMissing.length} breeding bins need dates`,
        detail: breedingDueMissing.length ? `${breedingDueMissing.slice(0, 3).map((row) => row.bin).join(', ')} need a due date or floor note.` : 'Breeding bins have dates or notes ready.',
        rows: breedingDueMissing.slice(0, 12),
      },
      {
        id: 'capacity',
        tone: openNurseryRows.length > 200 ? 'ok' : 'warn',
        title: `${openNurseryRows.length} nursery bins open`,
        detail: 'Useful for incoming litters, cleanup planning, and quick phone checks.',
        rows: openNurseryRows.slice(0, 12),
      },
      {
        id: 'edited-today',
        tone: editedToday.length ? 'ok' : 'warn',
        title: `${editedToday.length} saved today`,
        detail: editedToday.length ? `${editedToday.slice(0, 3).map((row) => row.bin).join(', ')} already changed in Flow today.` : 'No Flow saves yet today.',
        rows: editedToday.slice(0, 12),
      },
    ];
  }, [changedTodayRows, rows, summaries]);

  const skuInventory = useMemo(() => buildSkuInventory(rows), [rows]);
  const changedRows = useMemo(() => getChangedRows(rows), [rows]);

  function selectRoom(room) {
    setActiveRoom(room);
    setActiveWorkQueue('all');
    const first = rows.find((row) => room === 'all' || row.room === room);
    if (first) {
      setActiveRack(first.rack);
      selectBin(first);
    }
  }

  function selectBin(row) {
    setSelectedBin(row.bin);
    window.history.replaceState(null, '', `#${encodeURIComponent(row.bin)}`);
  }

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(''), 2600);
  }

  function runQrLookup(event) {
    event.preventDefault();
    const needle = query.trim().replace(/^.*#/, '');
    const found = rows.find((row) => row.bin.toLowerCase() === needle.toLowerCase());
    if (found) {
      setActiveRoom(found.room);
      setActiveRack(found.rack);
      setActiveStatus('all');
      setSelectedBin(found.bin);
      window.history.replaceState(null, '', `#${encodeURIComponent(found.bin)}`);
    }
  }

  function resetFlow() {
    setActiveRoom('all');
    setActiveRack(rows[0]?.rack || 'all');
    setActiveStatus('all');
    setActiveWorkQueue('all');
    setQuery('');
  }

  function selectWorkQueue(queue) {
    setActiveWorkQueue(queue);
    setActiveRoom('all');
    setActiveStatus('all');
    if (queue === 'all') return;
    const first = rows.find((row) => matchesWorkQueue(row, queue));
    if (first) {
      setActiveRack(first.rack);
      selectBin(first);
    }
  }

  function downloadVisibleRows() {
    downloadText(`frostbite-flow-visible-${TODAY}.csv`, rowsToCsv(mapRows));
  }

  function downloadDailyReport() {
    const lines = [
      '# Frostbite Flow Daily Report',
      '',
      `Generated: ${new Date().toLocaleString()}`,
      `Shared state: ${syncState.label}`,
      '',
      `Total bins: ${rows.length}`,
      `Active bins: ${summaries.activeRows.length}`,
      `Due this week: ${summaries.dueSoon.length}`,
      `Overdue: ${summaries.overdue.length}`,
      `Open: ${summaries.statusCounts.open || 0}`,
      `Changed today: ${changedTodayRows.length}`,
      '',
      '## Current Inventory By SKU',
      '| SKU | Bins | Active | Open | Due Soon | Overdue | Actual Count | Freezer On Hand |',
      '|---|---:|---:|---:|---:|---:|---:|---:|',
      ...skuInventory.map((row) => `| ${row.sku} | ${row.bins} | ${row.activeBins} | ${row.openBins} | ${row.dueSoon} | ${row.overdue} | ${row.estimatedAnimals} | ${row.freezerOnHand} |`),
      '',
      '## Operator Actions',
      ...operatorActions.map((action) => `- ${action.title}: ${action.detail}`),
      '',
      '## Wall Flow',
      `- Wall sections use ${WALL_LEVELS.join('-')} levels and ${WALL_COLUMNS} positions across.`,
      '- Walk order is serpentine: A01-A12, then B12-B01, then repeat downward.',
      `- Visible wall sections right now: ${wallSections.length}.`,
      '',
      '## Changed Today',
      ...(changedTodayRows.length
        ? changedTodayRows.slice(0, 50).map((row) => `- ${row.bin} (${row.room}/${row.rack}): ${row.lastEvent || 'Flow update'}`)
        : ['- No bins have been saved today.']),
      '',
      '## Recovery Baseline Delta',
      ...(changedRows.length
        ? changedRows.slice(0, 50).map((row) => `- ${row.bin} (${row.room}/${row.rack}): ${row.changes.map((change) => `${change.field} ${change.before || 'blank'} -> ${change.after || 'blank'}`).join('; ')}`)
        : ['- No row-level changes detected against the recovered June 18 CSV.']),
      '',
      '## First Alerts',
      ...[...summaries.overdue, ...summaries.dueSoon].slice(0, 12).map((row) => `- ${row.bin}: ${row.sku} ${formatDate(row.dueDate)}`),
    ];
    downloadText(`frostbite-flow-report-${TODAY}.md`, lines.join('\n'), 'text/markdown');
  }

  function downloadOkfBundle() {
    const roomNodes = uniqueValues(rows, 'room').map((room) => ({
      id: `room:${room}`,
      type: 'room',
      label: room,
      bin_count: rows.filter((row) => row.room === room).length,
    }));
    const rackNodes = uniqueValues(rows, 'rack').map((rack) => {
      const rackRows = rows.filter((row) => row.rack === rack);
      return {
        id: `rack:${rack}`,
        type: 'rack',
        label: rack,
        room: rackRows[0]?.room || null,
        bin_count: rackRows.length,
      };
    });
    const skuNodes = skuInventory.map((sku) => ({
      id: `sku:${sku.sku}`,
      type: 'sku',
      label: sku.sku,
      bins: sku.bins,
      active_bins: sku.activeBins,
      actual_count: sku.estimatedAnimals,
      freezer_on_hand: sku.freezerOnHand,
    }));
    const binNodes = rows.map((row) => ({
      ...(wallAssignments.get(row.bin) || {}),
      id: `bin:${row.bin}`,
      type: 'bin',
      label: row.bin,
      room: row.room,
      rack: row.rack,
      sku: row.sku,
      status: row.status,
      activity: getRowActivity(row).key,
      due_date: row.dueDate || null,
      updated_at: row.updatedAt || null,
    }));
    const graphEdges = [
      ...rackNodes.map((rack) => ({ from: `room:${rack.room}`, to: rack.id, type: 'contains_rack' })),
      ...rows.flatMap((row) => [
        { from: `rack:${row.rack}`, to: `bin:${row.bin}`, type: 'contains_bin' },
        { from: `bin:${row.bin}`, to: `sku:${row.sku}`, type: 'holds_sku' },
      ]),
    ];
    const bundle = {
      okf_version: '0.1',
      bundle_type: 'frostbite-flow-operations-snapshot',
      generated_at: new Date().toISOString(),
      source: {
        app: 'Frostbite Flow',
        workspace: 'Frostbite-Feeders/Flow',
        recovery_baseline: {
          ...RECOVERY_BASELINE,
        },
        shared_state: {
          id: remoteRecord?.id || null,
          updated_at: remoteRecord?.updated_at || null,
          status: syncState.label,
        },
      },
      verification: {
        browser_qa: 'npm run qa:browser',
        baseline_verify: 'npm run verify',
        last_verified_in_repo: 'See docs/DAY_2_HARDENING.md and newer commits.',
      },
      facts: {
        total_bins: rows.length,
        active_bins: summaries.activeRows.length,
        open_bins: summaries.statusCounts.open || 0,
        due_this_week: summaries.dueSoon.length,
        overdue: summaries.overdue.length,
        changed_today: changedTodayRows.length,
        changed_since_recovery_baseline: changedRows.length,
      },
      graph: {
        nodes: [...roomNodes, ...rackNodes, ...skuNodes, ...binNodes],
        edges: graphEdges,
      },
      per_bin_inventory: rows.map((row) => ({
        ...(wallAssignments.get(row.bin) || {}),
        bin: row.bin,
        room: row.room,
        rack: row.rack,
        type: row.type,
        status: row.status,
        activity: getRowActivity(row).key,
        sku: row.sku,
        actual_count: row.actualCount,
        mothers: row.mothers,
        males: row.males,
        females: row.females,
        rats_per_litter: row.ratsPerLitter,
        due_date: row.dueDate || null,
        freezer_on_hand: toNumber(row.freezerOnHand),
        updated_at: row.updatedAt || null,
      })),
      inventory_by_sku: skuInventory,
      changed_today: changedTodayRows.map((row) => ({
        bin: row.bin,
        room: row.room,
        rack: row.rack,
        status: row.status,
        sku: row.sku,
        updated_at: row.updatedAt,
      })),
      operator_actions: operatorActions.map((action) => ({
        id: action.id,
        tone: action.tone,
        title: action.title,
        detail: action.detail,
        bins: action.rows.map((row) => row.bin),
      })),
      changes_since_recovery_baseline: changedRows,
      agent_interface: {
        read_paths: ['/api/flow/state'],
        write_paths: ['/api/flow/state'],
        write_scope: 'single selected Flow bin patch inside full shared-state payload',
        browser_qa: 'scripts/qa-browser.mjs intercepts Flow writes and asserts no Shopify requests',
        invariant: 'Shopify remains read-only and is not a visible operator workflow.',
      },
    };

    downloadText(`frostbite-flow-okf-${TODAY}.json`, `${JSON.stringify(bundle, null, 2)}\n`, 'application/json');
  }

  async function refreshSharedState() {
    setSyncState({
      status: 'connecting',
      label: 'Refreshing',
      detail: 'Pulling current shared Flow state...',
    });
    try {
      const record = await flowApi('/state');
      setRemoteRecord(record);
      setRows(mergeSharedState(baselineRows, record.payload));
      setSyncState({
        status: 'live',
        label: 'Shared live',
        detail: `Refreshed - ${new Date().toLocaleTimeString()}`,
      });
      showToast('Shared Flow state refreshed');
    } catch (error) {
      setSyncState({
        status: 'offline',
        label: 'Local fallback',
        detail: error.message,
      });
    }
  }

  async function saveSelectedBin(event) {
    event.preventDefault();
    if (!selected || !draft) return;
    if (!remoteRecord?.payload?.bins || syncState.status !== 'live') {
      setSyncState({
        status: 'offline',
        label: 'Save blocked',
        detail: 'Shared Flow state is not connected. Refresh before saving.',
      });
      showToast('Shared Flow is offline; refresh before saving');
      return;
    }
    if (getDraftChanges(selected, draft).length === 0) {
      showToast('No bin changes to save');
      return;
    }
    const now = new Date().toISOString();
    const loadedAt = draftSourceRef.current.bin === selected.bin
      ? draftSourceRef.current.updatedAt || ''
      : selected.updatedAt || '';
    const nextRow = {
      ...selected,
      status: draft.status,
      sku: draft.status === 'open' ? 'No SKU' : draft.sku,
      actualCount: draft.status === 'open' ? 0 : toNumber(draft.actualCount),
      dueDate: draft.status === 'open' ? '' : draft.dueDate,
      birthDate: draft.status === 'open' ? '' : draft.birthDate,
      growoutStart: draft.status === 'open' ? '' : draft.growoutStart,
      sourceBin: draft.status === 'open' ? '' : draft.sourceBin,
      males: draft.status === 'open' ? 0 : toNumber(draft.males),
      females: draft.status === 'open' ? 0 : toNumber(draft.females),
      mothers: draft.status === 'open' ? 0 : toNumber(draft.mothers),
      ratsPerLitter: draft.status === 'open' ? 0 : toNumber(draft.ratsPerLitter),
      pregnantFemales: draft.status === 'open' ? 0 : toNumber(draft.pregnantFemales),
      note: draft.note,
      updatedAt: now,
      lastEvent: 'Flow dashboard update',
    };

    setSaving(true);

    try {
      const latestRecord = await flowApi('/state');
      const payload = clonePayload(latestRecord.payload);
      const entry = Object.entries(payload.bins).find(([, bin]) => bin.code === selected.bin);
      if (!entry) throw new Error(`No shared bin found for ${selected.bin}`);
      const [apiId, apiBin] = entry;
      const latestUpdatedAt = apiBin.updatedAt || '';
      if (latestUpdatedAt && loadedAt && latestUpdatedAt !== loadedAt) {
        throw new Error(`${selected.bin} changed in shared Flow. Refresh before saving.`);
      }
      payload.bins[apiId] = {
        ...apiBin,
        status: nextRow.status,
        skuTarget: nextRow.status === 'open' ? null : SKU_TO_TARGET[nextRow.sku] ?? null,
        actualCount: nextRow.actualCount,
        currentCount: nextRow.actualCount,
        males: nextRow.males,
        females: nextRow.females,
        note: nextRow.note,
        dueDate: nextRow.dueDate || null,
        birthDate: nextRow.birthDate || null,
        growoutStartDate: nextRow.growoutStart || null,
        sourceBin: nextRow.sourceBin || null,
        mothers: nextRow.mothers,
        litterCount: nextRow.ratsPerLitter,
        pregnantFemales: nextRow.pregnantFemales,
        updatedAt: now,
        events: [
          ...(apiBin.events || []),
          {
            id: crypto.randomUUID(),
            at: now,
            type: 'operator_update',
            title: 'Flow dashboard update',
            note: nextRow.note || `${nextRow.status} - ${nextRow.sku}`,
          },
        ],
      };
      const result = await flowApi('/state', {
        method: 'PUT',
        body: JSON.stringify({
          payload,
          updated_by: 'frostbite-flow-dashboard',
        }),
      });
      setRemoteRecord({ ...(latestRecord || {}), payload, updated_at: result?.updated_at || now });
      setRows(mergeSharedState(baselineRows, payload));
      setDraftDirty(false);
      draftSourceRef.current = { bin: selected.bin, updatedAt: now };
      setSyncState({
        status: 'live',
        label: 'Shared live',
        detail: `Saved ${selected.bin} - ${new Date(now).toLocaleTimeString()}`,
      });
      showToast(`Saved ${selected.bin} to shared Flow`);
    } catch (error) {
      setSyncState({
        status: 'offline',
        label: 'Save failed',
        detail: error.message,
      });
      showToast(`Save failed: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  const visibleRacks = Object.entries(rackGroups).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const displayedRacks = activeRack === 'all' ? visibleRacks.slice(0, 1) : visibleRacks;

  return (
    <main className="app-shell" data-testid="frostbite-flow-app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Snowflake size={28} />
          </div>
          <h1>Frostbite Flow</h1>
        </div>

        <nav className="nav">
          <div className="nav-label"><MapPinned size={20} /> Floor Board</div>
        </nav>

        <section className="sidebar-rooms">
          <div className="sidebar-section-title">Rooms & Racks</div>
          <RoomButton label="All rooms" count={rows.length} selected={activeRoom === 'all'} onClick={() => selectRoom('all')} />
          {ROOMS.filter((room) => room !== 'all').map((room) => (
            <div className="sidebar-room-group" key={room}>
              <RoomButton
                label={room}
                count={summaries.roomCounts[room] || 0}
                selected={activeRoom === room}
                onClick={() => selectRoom(room)}
              />
              {activeRoom === room && (
                <div className="sidebar-racks">
                  {uniqueValues(rows.filter((row) => row.room === room), 'rack').slice(0, 18).map((rack) => (
                    <button
                      className={classNames('rack-row', activeRack === rack && 'selected')}
                      key={rack}
                      type="button"
                      onClick={() => {
                        setActiveRack(rack);
                        const first = rows.find((row) => row.rack === rack);
                        if (first) selectBin(first);
                      }}
                    >
                      {rack}
                      <span>{rows.filter((row) => row.rack === rack).length}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>

        <div className="nav-actions">
          <button type="button" onClick={downloadVisibleRows}><Download size={20} /> Exports</button>
          <button type="button" data-testid="okf-export-action" onClick={downloadOkfBundle}><FileText size={20} /> OKF Bundle</button>
        </div>

        <div className="nav-lower" aria-label="Current work queues">
          <button
            className={classNames(activeWorkQueue === 'alerts' && 'active')}
            type="button"
            onClick={() => selectWorkQueue(activeWorkQueue === 'alerts' ? 'all' : 'alerts')}
          >
            <Bell size={20} /> Needs Check <span>{summaries.overdue.length}</span>
          </button>
          <button
            className={classNames(activeWorkQueue === 'tasks' && 'active')}
            type="button"
            onClick={() => selectWorkQueue(activeWorkQueue === 'tasks' ? 'all' : 'tasks')}
          >
            <ClipboardList size={20} /> Due Soon <span>{summaries.dueSoon.length}</span>
          </button>
        </div>

        <section className="hq-card">
          <div>
            <strong>Frostbite HQ</strong>
            <span>Shared state: {syncState.label}</span>
          </div>
          <small className={`sync-dot ${syncState.status}`} />
        </section>
      </aside>

      <section className="main">
        <header className="topbar">
          <form className="search" onSubmit={runQrLookup}>
            <Search size={18} />
            <input
              ref={searchRef}
              data-testid="bin-search"
              aria-label="Search bins, SKUs, rooms, racks, notes"
              placeholder="Search bins, SKUs, rooms, racks, notes..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd>/</kbd>
          </form>
          <div className="top-meta">
            <strong>{TODAY_LABEL}</strong>
            <button type="button" onClick={refreshSharedState}>
              {syncState.status === 'connecting' ? <Loader2 className="spin" size={17} /> : <Wifi size={17} />}
              {syncState.label}
            </button>
          </div>
        </header>

        {query.trim() && (
          <section className="search-results" aria-label="Search results">
            <strong>{searchMatches.length} match{searchMatches.length === 1 ? '' : 'es'}</strong>
            {searchMatches.length ? (
              searchMatches.slice(0, 6).map((row) => (
                <button
                  className={classNames(selected.bin === row.bin && 'selected')}
                  key={row.bin}
                  type="button"
                  onClick={() => selectBin(row)}
                >
                  <span>{row.bin}</span>
                  <small>{getWorkflow(row).label} / {row.rack} / {row.sku}</small>
                </button>
              ))
            ) : (
              <p>No bin, SKU, room, rack, or note match.</p>
            )}
          </section>
        )}

        <section className="metric-strip">
          <Metric label="Total Bins" value={rows.length} detail="100%" />
          <Metric label="Active" value={summaries.activeRows.length} detail={`${Math.round((summaries.activeRows.length / rows.length) * 100)}%`} tone="green" />
          <Metric label="Due This Week" value={summaries.dueSoon.length} detail="needs eyes" tone="amber" />
          <Metric label="Overdue" value={summaries.overdue.length} detail="check first" tone="red" />
          <Metric label="Open" value={summaries.statusCounts.open || 0} detail="available bins" />
          <Metric label="Changed Today" value={changedTodayRows.length} detail="saved today" tone="violet" />
        </section>

        <section className="dashboard-grid">
          <section className="bin-map" data-testid="bin-map">
            <div className="panel-head">
              <div>
                <h2>{MAP_MODES[mapMode]}</h2>
                <p>{mapRows.length} visible - {activeRack === 'all' ? activeRoom : activeRack}</p>
                {activeWorkQueue !== 'all' && <p>{WORK_QUEUES[activeWorkQueue].label}</p>}
                {mapMode === 'wall' && <p>A-J levels, 12 across, serpentine walk order</p>}
              </div>
            </div>
            <div className="filter-row">
              <div className="control-group" aria-label="Map mode">
                {Object.entries(MAP_MODES).map(([mode, label]) => (
                  <button
                    className={classNames(mapMode === mode && 'selected')}
                    key={mode}
                    type="button"
                    onClick={() => setMapMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="control-group" aria-label="Status filter">
                {['all', ...STATUS_ORDER].map((status) => (
                  <button
                    className={classNames(activeStatus === status && 'selected')}
                    key={status}
                    type="button"
                    onClick={() => setActiveStatus(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            {mapMode === 'rack' ? (
              <div className="rack-scroll">
                {displayedRacks.map(([rack, rackRows]) => (
                  <RackColumn
                    key={rack}
                    rack={rack}
                    rows={rackRows}
                    selectedBin={selected.bin}
                    searchMatchBins={searchMatchBins}
                    hasSearch={Boolean(query.trim())}
                    onSelect={selectBin}
                  />
                ))}
                {!displayedRacks.length && <div className="empty-state">No bins match this filter.</div>}
              </div>
            ) : (
              <WallFlow
                sections={wallSections}
                selectedBin={selected.bin}
                searchMatchBins={searchMatchBins}
                hasSearch={Boolean(query.trim())}
                onSelect={selectBin}
              />
            )}
            <div className="legend">
              <span><i className="dot needs-action" />Action needed</span>
              <span><i className="dot due-soon" />Due soon</span>
              <span><i className="dot in-use" />In use</span>
              <span><i className="dot ready" />Ready</span>
            </div>
          </section>

          <aside className="insight-panel">
            <div className="panel-head">
              <h2>Today's Floor Queue</h2>
              <Sparkles size={18} />
            </div>
            {operatorActions.map((action) => (
              <button
                className={`insight ${action.tone}`}
                key={action.id}
                type="button"
                onClick={() => action.rows?.[0] && selectBin(action.rows[0])}
              >
                <Sparkles size={16} />
                <span>
                  <strong>{action.title}</strong>
                  <small>{action.detail}</small>
                </span>
              </button>
            ))}
            <div className="connection-card">
              {syncState.status === 'offline' ? <WifiOff size={18} /> : <Wifi size={18} />}
              <div>
                <strong>{syncState.label}</strong>
                <span>{syncState.detail}</span>
              </div>
            </div>
          </aside>
        </section>

      </section>

      <BinDetail
        selected={selected}
        draft={draft}
        setDraft={setDraft}
        onDraftDirty={() => {
          setDraftDirty(true);
        }}
        draftChanges={getDraftChanges(selected, draft)}
        onSave={saveSelectedBin}
        saving={saving}
        canWriteShared={syncState.status === 'live' && Boolean(remoteRecord?.payload?.bins)}
      />

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function Metric({ label, value, detail, tone = 'neutral' }) {
  return (
    <article className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{Number(value || 0).toLocaleString()}</strong>
      <small>{detail}</small>
    </article>
  );
}

function RoomButton({ label, count, selected, onClick }) {
  return (
    <button className={classNames('room-button', selected && 'selected')} type="button" onClick={onClick}>
      <span>{label}</span>
      <strong>{count}</strong>
    </button>
  );
}

function RackColumn({ rack, rows, selectedBin, searchMatchBins, hasSearch, onSelect }) {
  const counts = countBy(rows, 'status');
  return (
    <section className="rack-column">
      <header>
        <div>
          <h3>{rack}</h3>
          <span>{rows.length} bins</span>
        </div>
        <strong>{counts.open || 0} open</strong>
      </header>
      <div className="bin-grid">
        {rows.map((row) => {
          const activity = getRowActivity(row);
          const workflow = getWorkflow(row);
          const meta = getBinCardMeta(row);
          return (
            <button
              className={classNames(
                'bin-cell',
                row.status,
                activity.key,
                hasSearch && searchMatchBins.has(row.bin) && 'search-hit',
                selectedBin === row.bin && 'active',
              )}
              key={row.bin}
              type="button"
              onClick={() => onSelect(row)}
              title={`${row.bin} - ${activity.label} - ${row.status} - ${row.sku}`}
            >
              <strong>{row.bin.split('-').at(-1)}</strong>
              <span>{workflow.label}</span>
              <small>{meta.primary}</small>
              <em>{getCardSignal(activity, meta)}</em>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function WallFlow({ sections, selectedBin, searchMatchBins, hasSearch, onSelect }) {
  return (
    <div className="wall-flow" data-testid="wall-flow">
      <div className="wall-note">
        <strong>Wall walk order</strong>
        <span>Two physical racks can be worked as one wall: A-J down, 12 positions across, then weave back on the next level.</span>
      </div>
      {sections.map((section) => (
        <section className="wall-section" key={section.id}>
          <header>
            <div>
              <h3>{section.label}</h3>
              <span>{section.rows.length} bins in this 120-slot wall section</span>
            </div>
            <strong>{WALL_CAPACITY - section.rows.length} empty slots</strong>
          </header>
          <div className="wall-grid" aria-label={`${section.label} serpentine walk grid`}>
            {section.cells.map((cell) => {
              const row = cell.row;
              const wallSlot = `${cell.level}${String(cell.column).padStart(2, '0')}`;
              if (!row) {
                return (
                  <div
                    className="wall-cell empty"
                    data-testid="wall-walk-cell"
                    data-wall-slot={wallSlot}
                    data-bin-code=""
                    key={cell.id}
                  >
                    <strong>{wallSlot}</strong>
                    <span>empty</span>
                  </div>
                );
              }
              const activity = getRowActivity(row);
              const meta = getBinCardMeta(row);
              return (
                <button
                  className={classNames(
                    'wall-cell',
                    row.status,
                    activity.key,
                    hasSearch && searchMatchBins.has(row.bin) && 'search-hit',
                    selectedBin === row.bin && 'active',
                  )}
                  data-testid="wall-walk-cell"
                  data-wall-slot={wallSlot}
                  data-bin-code={row.bin}
                  data-walk-index={cell.pathIndex}
                  key={cell.id}
                  type="button"
                  onClick={() => onSelect(row)}
                  title={`${wallSlot} - ${row.bin} - ${activity.label}`}
                >
                  <strong>{wallSlot}</strong>
                  <span>{row.bin}</span>
                  <small>{meta.primary}</small>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function BinDetail({
  selected,
  draft,
  setDraft,
  onDraftDirty,
  draftChanges,
  onSave,
  saving,
  canWriteShared,
}) {
  const displayStatus = draft?.status || selected.status;
  const displayRow = {
    ...selected,
    ...(draft || {}),
    status: displayStatus,
    sku: displayStatus === 'open' ? 'No SKU' : draft?.sku || selected.sku,
    actualCount: displayStatus === 'open' ? 0 : draft?.actualCount ?? selected.actualCount,
  };
  const workflow = getWorkflow(displayRow);
  const meta = getBinCardMeta(displayRow);

  function updateDraft(field, value) {
    onDraftDirty();
    setDraft((current) => ({ ...(current || {}), [field]: value }));
  }

  function renderField(field) {
    if (field === 'status') {
      return (
        <label key={field}>
          Status
          <select value={draft?.status || selected.status} onChange={(event) => updateDraft('status', event.target.value)}>
            {STATUS_ORDER.map((status) => <option key={status} value={status}>{STATUS_COPY[status]}</option>)}
          </select>
        </label>
      );
    }
    if (field === 'sku') {
      return (
        <label key={field}>
          SKU target
          <select value={draft?.sku || selected.sku} onChange={(event) => updateDraft('sku', event.target.value)}>
            {SKU_OPTIONS.map((sku) => <option key={sku} value={sku}>{sku}</option>)}
          </select>
        </label>
      );
    }
    if (field === 'dueDate') {
      return (
        <label key={field}>
          Due date
          <input type="date" value={draft?.dueDate || ''} onChange={(event) => updateDraft('dueDate', event.target.value)} />
        </label>
      );
    }
    if (field === 'actualCount') {
      const isOpenDraft = (draft?.status || selected.status) === 'open';
      return (
        <label key={field}>
          Actual count
          <input
            type="number"
            min="0"
            value={isOpenDraft ? 0 : draft?.actualCount ?? 0}
            disabled={isOpenDraft}
            onChange={(event) => updateDraft('actualCount', event.target.value)}
          />
        </label>
      );
    }
    if (field === 'males') {
      return (
        <label key={field}>
          Males
          <input type="number" min="0" value={draft?.males ?? 0} onChange={(event) => updateDraft('males', event.target.value)} />
        </label>
      );
    }
    if (field === 'females') {
      return (
        <label key={field}>
          Females
          <input type="number" min="0" value={draft?.females ?? 0} onChange={(event) => updateDraft('females', event.target.value)} />
        </label>
      );
    }
    if (field === 'birthDate') {
      return (
        <label key={field}>
          Birth date
          <input type="date" value={draft?.birthDate || ''} onChange={(event) => updateDraft('birthDate', event.target.value)} />
        </label>
      );
    }
    if (field === 'growoutStart') {
      return (
        <label key={field}>
          Growout start
          <input type="date" value={draft?.growoutStart || ''} onChange={(event) => updateDraft('growoutStart', event.target.value)} />
        </label>
      );
    }
    if (field === 'sourceBin') {
      return (
        <label key={field}>
          Source bin
          <input value={draft?.sourceBin || ''} onChange={(event) => updateDraft('sourceBin', event.target.value)} />
        </label>
      );
    }
    if (field === 'mothers') {
      return (
        <label key={field}>
          Mothers
          <input type="number" min="0" value={draft?.mothers ?? 0} onChange={(event) => updateDraft('mothers', event.target.value)} />
        </label>
      );
    }
    if (field === 'ratsPerLitter') {
      return (
        <label key={field}>
          Pups / count
          <input type="number" min="0" value={draft?.ratsPerLitter ?? 0} onChange={(event) => updateDraft('ratsPerLitter', event.target.value)} />
        </label>
      );
    }
    if (field === 'pregnantFemales') {
      return (
        <label key={field}>
          Pregnant
          <input type="number" min="0" value={draft?.pregnantFemales ?? 0} onChange={(event) => updateDraft('pregnantFemales', event.target.value)} />
        </label>
      );
    }
    return null;
  }

  return (
    <aside className="detail-panel">
      <div className="detail-title">
        <div>
          <span>Bin Details</span>
          <h2>{selected.bin}</h2>
          <p>{selected.room} / {selected.rack} / {selected.type}</p>
        </div>
        <span className="detail-icon" aria-hidden="true"><MapPinned size={21} /></span>
      </div>

      <div className={`status-pill ${selected.status}`}>{STATUS_COPY[selected.status] || selected.status}</div>

      <section className="workflow-card">
        <div>
          <strong>{workflow.label}</strong>
          <span>{workflow.detail}</span>
        </div>
        <dl>
          <div><dt>{workflow.cardLabel}</dt><dd>{meta.primary}</dd></div>
          <div><dt>Room work</dt><dd>{meta.secondary}</dd></div>
        </dl>
      </section>

      <form className="edit-form" onSubmit={onSave}>
        {workflow.primaryFields.map(renderField)}
        <label className="wide">
          Floor note
          <textarea rows="3" value={draft?.note || ''} onChange={(event) => updateDraft('note', event.target.value)} />
        </label>
        <button className="save-button" type="submit" disabled={saving || !canWriteShared || draftChanges.length === 0}>
          {saving ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
          {saving ? 'Saving...' : canWriteShared ? 'Save shared state' : 'Shared state offline'}
        </button>
      </form>

    </aside>
  );
}

const rootElement = document.getElementById('root');
window.__frostbiteFlowRoot ||= createRoot(rootElement);
window.__frostbiteFlowRoot.render(<App />);
