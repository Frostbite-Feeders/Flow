import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  Bell,
  Building2,
  Check,
  ChevronDown,
  ClipboardList,
  Download,
  FileText,
  Filter,
  LayoutDashboard,
  Loader2,
  MapPinned,
  Menu,
  QrCode,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Wifi,
  WifiOff,
} from 'lucide-react';
import inventoryCsv from '../data/exports/frostbite-inventory-2026-06-18.csv?raw';
import './styles.css';

const TODAY = '2026-06-20';
const FLOW_API_BASE = '/api/flow';
const TENANT_ID = 'frostbite';
const ROOMS = ['all', 'breeding', 'nursery', 'growout'];
const STATUS_ORDER = ['breeding', 'nursery', 'growout', 'open'];
const SKU_OPTIONS = ['No SKU', 'Pinky', 'Fuzzy', 'Pup', 'Weaned', 'Small', 'Smedium', 'Medium', 'Large', 'Jumbo'];

const STATUS_COPY = {
  breeding: 'Breeding',
  nursery: 'Nursery',
  growout: 'Growout',
  open: 'Open',
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

function parseVariants(value) {
  if (!value) return [];
  return value.split('|').map((entry) => {
    const [sku, variantId] = entry.split(':');
    return { sku, variantId };
  });
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
    ['Mothers', String(row.mothers ?? 0), String(toNumber(draft.mothers))],
    ['Rats / litter', String(row.ratsPerLitter ?? 0), String(toNumber(draft.ratsPerLitter))],
    ['Pregnant', String(row.pregnantFemales ?? 0), String(toNumber(draft.pregnantFemales))],
    ['Floor note', row.note || '', draft.note || ''],
  ];

  return checks
    .filter(([, before, after]) => String(before) !== String(after))
    .map(([label, before, after]) => ({ label, before: before || 'blank', after: after || 'blank' }));
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
    const mappedRows = rows.filter((row) => row.shopifyVariantIds);
    const activeRows = rows.filter((row) => row.status !== 'open');
    const staleRows = rows.filter((row) => {
      if (!row.updatedAt) return true;
      const updated = new Date(row.updatedAt);
      const today = new Date(`${TODAY}T00:00:00`);
      return (today - updated) / 86400000 > 2;
    });
    return { roomCounts, statusCounts, dueSoon, overdue, mappedRows, activeRows, staleRows };
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

  const rackGroups = useMemo(() => {
    return filteredRows.reduce((acc, row) => {
      acc[row.rack] = acc[row.rack] || [];
      acc[row.rack].push(row);
      return acc;
    }, {});
  }, [filteredRows]);

  const operatorActions = useMemo(() => {
    const overdue = [...summaries.overdue].sort((a, b) => (daysUntil(a.dueDate) ?? 0) - (daysUntil(b.dueDate) ?? 0));
    const nextDue = [...summaries.dueSoon]
      .sort((a, b) => (daysUntil(a.dueDate) ?? 999) - (daysUntil(b.dueDate) ?? 999))
      .slice(0, 3);
    const openNurseryRows = rows.filter((row) => row.room === 'nursery' && row.status === 'open');
    const mappedActiveRows = rows.filter((row) => row.shopifyVariantIds && row.status !== 'open');
    const staleRows = [...summaries.staleRows].sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''));
    const freezerGapRows = rows.filter((row) => row.shopifyVariantIds && row.status !== 'open' && toNumber(row.freezerOnHand) <= 0);
    const offlineMappingRows = rows.filter((row) => row.status !== 'open' && !row.shopifyVariantIds);
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
        title: `${nextDue.length} next due`,
        detail: `${nextDue.length ? nextDue.map((row) => row.bin).join(', ') : 'No bins'} due next in the nursery/growout flow.`,
        rows: nextDue,
      },
      {
        id: 'capacity',
        tone: openNurseryRows.length > 200 ? 'ok' : 'warn',
        title: `${openNurseryRows.length} nursery bins open`,
        detail: 'Useful for incoming litters, cleanup planning, and quick phone checks.',
        rows: openNurseryRows.slice(0, 12),
      },
      {
        id: 'stale',
        tone: staleRows.length ? 'warn' : 'ok',
        title: `${staleRows.length} stale or unverified`,
        detail: staleRows.length ? `${staleRows.slice(0, 3).map((row) => row.bin).join(', ')} need a floor check.` : 'All loaded bins have fresh update timestamps.',
        rows: staleRows.slice(0, 12),
      },
      {
        id: 'freezer-gaps',
        tone: freezerGapRows.length ? 'warn' : 'ok',
        title: `${freezerGapRows.length} freezer gaps`,
        detail: 'Mapped active bins with no freezer on-hand count in the recovered baseline.',
        rows: freezerGapRows.slice(0, 12),
      },
      {
        id: 'shopify',
        tone: 'neutral',
        title: `${mappedActiveRows.length} mapped active bins`,
        detail: 'Shopify visibility only. This dashboard still does not edit Shopify.',
        rows: mappedActiveRows.slice(0, 12),
      },
      {
        id: 'offline-mapping',
        tone: offlineMappingRows.length ? 'neutral' : 'ok',
        title: `${offlineMappingRows.length} offline/unmapped active`,
        detail: 'Likely offline sales or bins not meant to map to Shopify. Visible, not erased.',
        rows: offlineMappingRows.slice(0, 12),
      },
    ];
  }, [rows, summaries]);

  function selectRoom(room) {
    setActiveRoom(room);
    setActiveRack('all');
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
    setQuery('');
  }

  function focusLookup() {
    searchRef.current?.focus();
  }

  function beginQuickScan() {
    setScanMode(true);
    setQuery('');
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function downloadBaseline() {
    downloadText('frostbite-inventory-2026-06-18.csv', inventoryCsv);
  }

  function downloadVisibleRows() {
    downloadText(`frostbite-flow-visible-${TODAY}.csv`, rowsToCsv(filteredRows));
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
      `Shopify mapped: ${summaries.mappedRows.length} (read-only)`,
      '',
      '## Operator Actions',
      ...operatorActions.map((action) => `- ${action.title}: ${action.detail}`),
      '',
      '## First Alerts',
      ...[...summaries.overdue, ...summaries.dueSoon].slice(0, 12).map((row) => `- ${row.bin}: ${row.sku} ${formatDate(row.dueDate)}`),
    ];
    downloadText(`frostbite-flow-report-${TODAY}.md`, lines.join('\n'), 'text/markdown');
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
      mothers: toNumber(draft.mothers),
      ratsPerLitter: toNumber(draft.ratsPerLitter),
      pregnantFemales: toNumber(draft.pregnantFemales),
      note: draft.note,
      updatedAt: now,
      lastEvent: 'Flow dashboard update',
    };

    setSaving(true);

    if (!remoteRecord?.payload?.bins) {
      setRows((current) => current.map((row) => (row.bin === selected.bin ? nextRow : row)));
      setDraftDirty(false);
      setWriteConfirmed(false);
      draftSourceRef.current = { bin: selected.bin, updatedAt: nextRow.updatedAt || '' };
      setSaving(false);
      setSyncState({
        status: 'offline',
        label: 'Local fallback',
        detail: 'No shared payload loaded; edit kept in this browser session.',
      });
      showToast('Saved locally in this browser');
      return;
    }

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
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Snowflake size={28} />
          </div>
          <h1>Frostbite Flow</h1>
        </div>

        <nav className="nav">
          <button className="active" type="button" onClick={resetFlow}><LayoutDashboard size={20} /> Dashboard</button>
          <button type="button" onClick={() => selectRoom('all')}><Building2 size={20} /> Rooms</button>
          <button type="button" onClick={focusLookup}><QrCode size={20} /> QR Lookup</button>
          <button type="button" onClick={downloadVisibleRows}><Download size={20} /> Exports</button>
          <button type="button"><ShieldCheck size={20} /> Shopify View</button>
        </nav>

        <div className="nav-lower">
          <button type="button"><Bell size={20} /> Alerts <span>{summaries.overdue.length}</span></button>
          <button type="button"><ClipboardList size={20} /> Tasks <span>{summaries.dueSoon.length}</span></button>
          <button type="button"><Settings size={20} /> Settings</button>
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
          <button className="icon-button menu-button" type="button" aria-label="Menu"><Menu size={22} /></button>
          <form className="search" onSubmit={runQrLookup}>
            <Search size={18} />
            <input
              ref={searchRef}
              aria-label="Search bins, SKUs, rooms, racks, QR codes"
              placeholder="Search bins, SKUs, rooms, racks, QR codes..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd>/</kbd>
          </form>
          <div className="top-meta">
            <strong>June 20, 2026</strong>
            <button type="button" onClick={refreshSharedState}>
              {syncState.status === 'connecting' ? <Loader2 className="spin" size={17} /> : <Wifi size={17} />}
              {syncState.label}
            </button>
          </div>
        </header>

        <section className="actions-row">
          <button type="button" onClick={downloadBaseline}><FileText size={17} /> Baseline</button>
          <button type="button" onClick={focusLookup}><QrCode size={17} /> QR Lookup</button>
          <button type="button" onClick={downloadDailyReport}><ClipboardList size={17} /> Daily Report</button>
          <button className="primary" type="button" onClick={beginQuickScan}><ScanLine size={17} /> Quick Scan</button>
        </section>

        {scanMode && (
          <section className="scan-tray" aria-label="Scan Mode">
            <div>
              <strong>Scan Mode</strong>
              <span>Type or scan a bin code, then press Enter. Current bin: {selected.bin}</span>
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
          <Metric label="Shopify Mapped" value={summaries.mappedRows.length} detail="read-only" tone="violet" />
        </section>

        <section className="dashboard-grid">
          <aside className="room-list">
            <div className="panel-head">
              <h2>Rooms & Racks</h2>
              <button type="button" className="icon-button"><ChevronDown size={18} /></button>
            </div>
            <div className="mini-search">
              <Search size={15} />
              <input placeholder="Search rooms or racks..." value={query} onChange={(event) => setQuery(event.target.value)} />
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

          <section className="bin-map">
            <div className="panel-head">
              <div>
                <h2>Bin Map</h2>
                <p>{filteredRows.length} visible - {activeRoom === 'all' ? 'all rooms' : activeRoom}</p>
              </div>
              <div className="map-controls">
                <button type="button"><Sparkles size={16} /> Flow AI</button>
                <button type="button"><Filter size={16} /> Filter</button>
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
                  onSelect={selectBin}
                />
              ))}
              {!visibleRacks.length && <div className="empty-state">No bins match this filter.</div>}
            </div>
            <div className="legend">
              {STATUS_ORDER.map((status) => (
                <span key={status}><i className={`dot ${status}`} />{STATUS_COPY[status]}</span>
              ))}
            </div>
          </section>

          <aside className="insight-panel">
            <div className="panel-head">
              <h2>Flow Intelligence</h2>
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
        summaries={summaries}
        onSave={saveSelectedBin}
        saving={saving}
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

function RackColumn({ rack, rows, selectedBin, onSelect }) {
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
        {rows.map((row) => (
          <button
            className={classNames('bin-cell', row.status, selectedBin === row.bin && 'active')}
            key={row.bin}
            type="button"
            onClick={() => onSelect(row)}
            title={`${row.bin} - ${row.status} - ${row.sku}`}
          >
            <QrCode size={13} />
            <strong>{row.bin.split('-').at(-1)}</strong>
            <span>{row.sku === 'No SKU' ? 'open' : row.sku}</span>
          </button>
        ))}
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
  summaries,
  onSave,
  saving,
}) {
  const variants = parseVariants(selected.shopifyVariantIds);
  const due = daysUntil(selected.dueDate);
  const dueTone = due === null ? 'muted' : due < 0 ? 'danger' : due <= 7 ? 'warn' : 'ok';

  function updateDraft(field, value) {
    onDraftDirty();
    setDraft((current) => ({ ...(current || {}), [field]: value }));
  }

  return (
    <aside className="detail-panel">
      <div className="detail-title">
        <div>
          <span>Bin Details</span>
          <h2>{selected.bin}</h2>
          <p>{selected.room} / {selected.rack} / {selected.type}</p>
        </div>
        <button className="icon-button" type="button" aria-label="Selected bin"><QrCode size={21} /></button>
      </div>

      <div className={`status-pill ${selected.status}`}>{STATUS_COPY[selected.status] || selected.status}</div>

      <form className="edit-form" onSubmit={onSave}>
        <label>
          Status
          <select value={draft?.status || selected.status} onChange={(event) => updateDraft('status', event.target.value)}>
            {STATUS_ORDER.map((status) => <option key={status} value={status}>{STATUS_COPY[status]}</option>)}
          </select>
        </label>
        <label>
          SKU
          <select value={draft?.sku || selected.sku} onChange={(event) => updateDraft('sku', event.target.value)}>
            {SKU_OPTIONS.map((sku) => <option key={sku} value={sku}>{sku}</option>)}
          </select>
        </label>
        <label>
          Due date
          <input type="date" value={draft?.dueDate || ''} onChange={(event) => updateDraft('dueDate', event.target.value)} />
        </label>
        <label>
          Birth date
          <input type="date" value={draft?.birthDate || ''} onChange={(event) => updateDraft('birthDate', event.target.value)} />
        </label>
        <label>
          Mothers
          <input type="number" min="0" value={draft?.mothers ?? 0} onChange={(event) => updateDraft('mothers', event.target.value)} />
        </label>
        <label>
          Rats / litter
          <input type="number" min="0" value={draft?.ratsPerLitter ?? 0} onChange={(event) => updateDraft('ratsPerLitter', event.target.value)} />
        </label>
        <label className="wide">
          Floor note
          <textarea rows="3" value={draft?.note || ''} onChange={(event) => updateDraft('note', event.target.value)} />
        </label>
        <section className="change-preview wide">
          <div>
            <strong>Shared write preview</strong>
            <span>One Flow bin will be patched, one event will be appended, and Shopify stays read-only.</span>
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
            onChange={(event) => setWriteConfirmed(event.target.checked)}
          />
          <span>Confirm this writes Flow shared state only. Shopify is untouched.</span>
        </label>
        <button className="save-button" type="submit" disabled={saving || draftChanges.length === 0 || !writeConfirmed}>
          {saving ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
          {saving ? 'Saving...' : 'Save shared state'}
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
          <strong>QR target</strong>
          <code>{selected.qrTarget}</code>
        </div>
      </section>

      <section className="shopify-card">
        <div className="shopify-head">
          <ShieldCheck size={18} />
          <strong>Shopify Mapping</strong>
          <span>read-only</span>
        </div>
        {variants.length ? (
          <div className="variant-list">
            {variants.map((variant) => (
              <div key={variant.variantId}>
                <span>{variant.sku}</span>
                <code>{variant.variantId}</code>
              </div>
            ))}
          </div>
        ) : (
          <p>No variant IDs on this bin. Offline sales and unmapped bins stay visible here.</p>
        )}
        <small>{summaries.mappedRows.length} rows have Shopify IDs. This dashboard does not edit Shopify.</small>
      </section>
    </aside>
  );
}

createRoot(document.getElementById('root')).render(<App />);
