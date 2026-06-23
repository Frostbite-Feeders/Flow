import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  Bell,
  Check,
  ClipboardList,
  Download,
  FileText,
  Loader2,
  MapPinned,
  ScanLine,
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

const STATUS_COPY = {
  breeding: 'Breeding',
  nursery: 'Nursery',
  growout: 'Growout',
  open: 'Open',
};

const WORKFLOW_COPY = {
  breeding: {
    label: 'Breeding',
    cardLabel: 'Mothers',
    detail: 'Pairing and litter watch',
    primaryFields: ['status', 'mothers', 'pregnantFemales', 'dueDate'],
  },
  nursery: {
    label: 'Nursery',
    cardLabel: 'Pups',
    detail: 'Birth date, litter count, and weaning flow',
    primaryFields: ['status', 'birthDate', 'ratsPerLitter', 'sku'],
  },
  growout: {
    label: 'Growout',
    cardLabel: 'Target',
    detail: 'Grow-out start and feeder size target',
    primaryFields: ['status', 'growoutStart', 'sku', 'ratsPerLitter'],
  },
  open: {
    label: 'Open',
    cardLabel: 'Ready',
    detail: 'Available bin',
    primaryFields: ['status', 'sku'],
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

function getWorkflow(row) {
  return WORKFLOW_COPY[row.status] || WORKFLOW_COPY[row.room] || WORKFLOW_COPY.open;
}

function getBinCardMeta(row) {
  if (row.status === 'breeding') {
    return {
      primary: `${row.mothers || 0} mothers`,
      secondary: row.dueDate ? `due ${formatDate(row.dueDate).replace(row.dueDate, '').replace(' - ', '')}` : 'no due date',
    };
  }
  if (row.status === 'nursery') {
    return {
      primary: `${row.ratsPerLitter || 0} pups`,
      secondary: row.birthDate ? `born ${row.birthDate}` : 'birth needed',
    };
  }
  if (row.status === 'growout') {
    return {
      primary: row.sku || 'No target',
      secondary: row.growoutStart ? `started ${row.growoutStart}` : 'start needed',
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
    Mothers: String(row.mothers ?? 0),
    'Rats/Litter': String(row.ratsPerLitter ?? 0),
    'Due Date': row.dueDate || '',
    'Birth Date': row.birthDate || '',
    'Grow-out Start': row.growoutStart || '',
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

  return rows.map((row) => {
    const remote = byCode.get(row.bin);
    if (!remote) return row;
    return {
      ...row,
      apiId: remote.id || row.apiId,
      room: remote.room || row.room,
      rack: remote.rackLabel || row.rack,
      type: remote.type || row.type,
      status: remote.status || row.status,
      sku: TARGET_TO_SKU[remote.skuTarget] || row.sku,
      males: toNumber(remote.males ?? row.males),
      females: toNumber(remote.females ?? row.females),
      pregnantFemales: toNumber(remote.pregnantFemales ?? row.pregnantFemales),
      mothers: toNumber(remote.mothers ?? row.mothers),
      motherSlots: toNumber(remote.motherSlots ?? row.motherSlots),
      ratsPerLitter: toNumber(remote.litterCount ?? row.ratsPerLitter),
      dueDate: remote.dueDate || '',
      birthDate: remote.birthDate || '',
      growoutStart: remote.growoutStartDate || '',
      sourceBin: remote.sourceBin || '',
      note: remote.note || '',
      updatedAt: remote.updatedAt || row.updatedAt,
      lastEvent: remote.events?.at?.(-1)?.title || row.lastEvent,
    };
  });
}

function draftFromRow(row) {
  return {
    status: row.status,
    sku: row.sku,
    dueDate: row.dueDate || '',
    birthDate: row.birthDate || '',
    growoutStart: row.growoutStart || '',
    mothers: row.mothers,
    ratsPerLitter: row.ratsPerLitter,
    pregnantFemales: row.pregnantFemales,
    note: row.note || '',
  };
}

function getDraftChanges(row, draft) {
  if (!row || !draft) return [];
  const checks = [
    ['Status', row.status, draft.status],
    ['SKU', row.sku, draft.sku],
    ['Due date', row.dueDate || '', draft.dueDate || ''],
    ['Birth date', row.birthDate || '', draft.birthDate || ''],
    ['Growout start', row.growoutStart || '', draft.growoutStart || ''],
    ['Mothers', String(row.mothers ?? 0), String(toNumber(draft.mothers))],
    ['Rats / litter', String(row.ratsPerLitter ?? 0), String(toNumber(draft.ratsPerLitter))],
    ['Pregnant', String(row.pregnantFemales ?? 0), String(toNumber(draft.pregnantFemales))],
    ['Floor note', row.note || '', draft.note || ''],
  ];

  return checks
    .filter(([, before, after]) => String(before) !== String(after))
    .map(([label, before, after]) => ({ label, before: before || 'blank', after: after || 'blank' }));
}

function getRowActivity(row) {
  const due = daysUntil(row.dueDate);
  if (due !== null && due < 0) return { key: 'needs-action', label: 'Action needed' };
  if (due !== null && due <= 7) return { key: 'due-soon', label: 'Due soon' };
  if (row.status !== 'open') return { key: 'in-use', label: 'In use' };
  return { key: 'ready', label: 'Ready' };
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
    if (daysUntil(row.dueDate) !== null && daysUntil(row.dueDate) >= 0 && daysUntil(row.dueDate) <= 7) acc[sku].dueSoon += 1;
    if (daysUntil(row.dueDate) !== null && daysUntil(row.dueDate) < 0) acc[sku].overdue += 1;
    acc[sku].estimatedAnimals += toNumber(row.ratsPerLitter);
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
        ['dueDate', baseline.dueDate || '', row.dueDate || ''],
        ['birthDate', baseline.birthDate || '', row.birthDate || ''],
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
  const [activeRack, setActiveRack] = useState('all');
  const [activeStatus, setActiveStatus] = useState('all');
  const [activeWorkQueue, setActiveWorkQueue] = useState('all');
  const [query, setQuery] = useState(() => decodeURIComponent(window.location.hash.replace(/^#/, '')));
  const [selectedBin, setSelectedBin] = useState(() => query || '10-1-01');
  const [draft, setDraft] = useState(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [writeConfirmed, setWriteConfirmed] = useState(false);
  const [scanMode, setScanMode] = useState(false);
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
      const due = daysUntil(row.dueDate);
      return due !== null && due >= 0 && due <= 7;
    });
    const overdue = rows.filter((row) => {
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
      setWriteConfirmed(false);
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
    setActiveRack('all');
    setActiveWorkQueue('all');
    const first = rows.find((row) => room === 'all' || row.room === room);
    if (first) selectBin(first);
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
    setActiveRack('all');
    setActiveStatus('all');
    setActiveWorkQueue('all');
    setQuery('');
  }

  function beginQuickScan() {
    setScanMode(true);
    setQuery('');
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function selectWorkQueue(queue) {
    setActiveWorkQueue(queue);
    setActiveRoom('all');
    setActiveRack('all');
    setActiveStatus('all');
    if (queue === 'all') return;
    const first = rows.find((row) => matchesWorkQueue(row, queue));
    if (first) selectBin(first);
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
      '| SKU | Bins | Active | Open | Due Soon | Overdue | Estimated Animals | Freezer On Hand |',
      '|---|---:|---:|---:|---:|---:|---:|---:|',
      ...skuInventory.map((row) => `| ${row.sku} | ${row.bins} | ${row.activeBins} | ${row.openBins} | ${row.dueSoon} | ${row.overdue} | ${row.estimatedAnimals} | ${row.freezerOnHand} |`),
      '',
      '## Operator Actions',
      ...operatorActions.map((action) => `- ${action.title}: ${action.detail}`),
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
      freezer_on_hand: sku.freezerOnHand,
    }));
    const binNodes = rows.map((row) => ({
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
        bin: row.bin,
        room: row.room,
        rack: row.rack,
        type: row.type,
        status: row.status,
        activity: getRowActivity(row).key,
        sku: row.sku,
        mothers: row.mothers,
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
    if (!writeConfirmed) {
      showToast('Confirm the Flow write before saving');
      return;
    }
    const now = new Date().toISOString();
    const loadedAt = draftSourceRef.current.bin === selected.bin
      ? draftSourceRef.current.updatedAt || ''
      : selected.updatedAt || '';
    const nextRow = {
      ...selected,
      status: draft.status,
      sku: draft.sku,
      dueDate: draft.dueDate,
      birthDate: draft.birthDate,
      growoutStart: draft.growoutStart,
      mothers: toNumber(draft.mothers),
      ratsPerLitter: toNumber(draft.ratsPerLitter),
      pregnantFemales: toNumber(draft.pregnantFemales),
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
        skuTarget: SKU_TO_TARGET[nextRow.sku] ?? null,
        note: nextRow.note,
        dueDate: nextRow.dueDate || null,
        birthDate: nextRow.birthDate || null,
        growoutStartDate: nextRow.growoutStart || null,
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
      setWriteConfirmed(false);
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
          <button type="button" onClick={downloadVisibleRows}><Download size={20} /> Exports</button>
        </nav>

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

        <section className="actions-row">
          <button type="button" data-testid="daily-report-action" onClick={downloadDailyReport}><ClipboardList size={17} /> Daily Report</button>
          <button type="button" data-testid="okf-export-action" onClick={downloadOkfBundle}><FileText size={17} /> OKF Bundle</button>
          <button type="button" data-testid="scan-bin-action" onClick={beginQuickScan}><ScanLine size={17} /> Find Bin</button>
        </section>

        {scanMode && (
          <section className="scan-tray" aria-label="Find Bin Mode" data-testid="scan-tray">
            <div>
              <strong>Find Bin Mode</strong>
              <span>Ready for bin code. Current bin: {selected.bin}</span>
            </div>
            <button type="button" onClick={beginQuickScan}><ScanLine size={16} /> Focus scanner</button>
            {operatorActions[1]?.rows?.[0] && (
              <button type="button" onClick={() => selectBin(operatorActions[1].rows[0])}>
                <AlertTriangle size={16} /> Next due
              </button>
            )}
            <button type="button" onClick={() => setScanMode(false)}>Done</button>
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
          <aside className="room-list">
            <div className="panel-head">
              <h2>Rooms & Racks</h2>
            </div>
            <RoomButton label="All rooms" count={rows.length} selected={activeRoom === 'all'} onClick={() => selectRoom('all')} />
            {ROOMS.filter((room) => room !== 'all').map((room) => (
              <div key={room}>
                <RoomButton
                  label={room}
                  count={summaries.roomCounts[room] || 0}
                  selected={activeRoom === room}
                  onClick={() => selectRoom(room)}
                />
                {activeRoom === room && uniqueValues(rows.filter((row) => row.room === room), 'rack').slice(0, 12).map((rack) => (
                  <button
                    className={classNames('rack-row', activeRack === rack && 'selected')}
                    key={rack}
                    type="button"
                    onClick={() => setActiveRack(rack)}
                  >
                    {rack}
                    <span>{rows.filter((row) => row.rack === rack).length}</span>
                  </button>
                ))}
              </div>
            ))}
          </aside>

          <section className="bin-map" data-testid="bin-map">
            <div className="panel-head">
              <div>
                <h2>Bin Map</h2>
                <p>{mapRows.length} visible - {activeRoom === 'all' ? 'all rooms' : activeRoom}</p>
                {activeWorkQueue !== 'all' && <p>{WORK_QUEUES[activeWorkQueue].label}</p>}
              </div>
            </div>
            <div className="filter-row">
              <div className="control-group" aria-label="Room filter">
                {ROOMS.map((room) => (
                  <button
                    className={classNames(activeRoom === room && 'selected')}
                    key={room}
                    type="button"
                    onClick={() => selectRoom(room)}
                  >
                    {room === 'all' ? 'All' : room}
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
            <div className="rack-scroll">
              {visibleRacks.map(([rack, rackRows]) => (
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
              {!visibleRacks.length && <div className="empty-state">No bins match this filter.</div>}
            </div>
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

        <section className="alert-strip">
          {[...summaries.overdue, ...summaries.dueSoon].slice(0, 4).map((row) => (
            <button type="button" key={row.bin} onClick={() => selectBin(row)}>
              <AlertTriangle size={18} />
              <strong>{row.bin} {daysUntil(row.dueDate) < 0 ? 'Overdue' : 'Due Soon'}</strong>
              <span>{row.sku} - {formatDate(row.dueDate)}</span>
            </button>
          ))}
        </section>
      </section>

      <BinDetail
        selected={selected}
        draft={draft}
        setDraft={setDraft}
        onDraftDirty={() => {
          setDraftDirty(true);
          setWriteConfirmed(false);
        }}
        draftChanges={getDraftChanges(selected, draft)}
        writeConfirmed={writeConfirmed}
        setWriteConfirmed={setWriteConfirmed}
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

function BinDetail({
  selected,
  draft,
  setDraft,
  onDraftDirty,
  draftChanges,
  writeConfirmed,
  setWriteConfirmed,
  onSave,
  saving,
  canWriteShared,
}) {
  const due = daysUntil(selected.dueDate);
  const dueTone = due === null ? 'muted' : due < 0 ? 'danger' : due <= 7 ? 'warn' : 'ok';
  const workflow = getWorkflow(selected);
  const meta = getBinCardMeta(selected);

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
          <div><dt>Signal</dt><dd>{meta.secondary}</dd></div>
        </dl>
      </section>

      <form className="edit-form" onSubmit={onSave}>
        {workflow.primaryFields.map(renderField)}
        <label className="wide">
          Floor note
          <textarea rows="3" value={draft?.note || ''} onChange={(event) => updateDraft('note', event.target.value)} />
        </label>
        <section className="change-preview wide">
          <div>
            <strong>Shared write preview</strong>
            <span>One Flow bin will be patched and one event will be appended.</span>
          </div>
          {draftChanges.length ? (
            <ul>
              {draftChanges.slice(0, 5).map((change) => (
                <li key={change.label}>
                  <span>{change.label}</span>
                  <code>{change.before}</code>
                  <strong>{change.after}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>No changes yet.</p>
          )}
        </section>
        <label className="write-confirm wide">
          <input
            type="checkbox"
            checked={writeConfirmed}
            disabled={!canWriteShared}
            onChange={(event) => setWriteConfirmed(event.target.checked)}
          />
          <span>Confirm this updates Frostbite Flow shared state.</span>
        </label>
        <button className="save-button" type="submit" disabled={saving || !canWriteShared || draftChanges.length === 0 || !writeConfirmed}>
          {saving ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
          {saving ? 'Saving...' : canWriteShared ? 'Save shared state' : 'Shared state offline'}
        </button>
      </form>

      <dl className="detail-list">
        <div><dt>Due</dt><dd className={dueTone}>{formatDate(selected.dueDate)}</dd></div>
        <div><dt>Updated</dt><dd>{selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : 'Not set'}</dd></div>
        <div><dt>Pregnant</dt><dd>{selected.pregnantFemales}</dd></div>
        <div><dt>Freezer</dt><dd>{selected.freezerOnHand || 'n/a'}</dd></div>
      </dl>

      <section className="qr-card">
        <MapPinned size={18} />
        <div>
          <strong>Bin link</strong>
          <code>{selected.qrTarget}</code>
        </div>
      </section>
    </aside>
  );
}

createRoot(document.getElementById('root')).render(<App />);
