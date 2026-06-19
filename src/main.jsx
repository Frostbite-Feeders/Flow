import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  Archive,
  Boxes,
  CircleDot,
  Download,
  FileText,
  Filter,
  Lock,
  MapPinned,
  PanelRightOpen,
  QrCode,
  ScanSearch,
  Search,
  ShieldCheck,
  Snowflake,
  Waves,
} from 'lucide-react';
import inventoryCsv from '../data/exports/frostbite-inventory-2026-06-18.csv?raw';
import './styles.css';

const TODAY = '2026-06-19';
const ROOMS = ['all', 'breeding', 'nursery', 'growout'];
const STATUS_ORDER = ['breeding', 'nursery', 'growout', 'open'];

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

const inventoryRows = parseCsv(inventoryCsv).map((row) => ({
  bin: row.Bin,
  room: row.Room,
  rack: row.Rack,
  type: row.Type,
  status: row.Status,
  sku: row.SKU,
  males: Number(row.Males || 0),
  females: Number(row.Females || 0),
  pregnantFemales: Number(row['Pregnant Females'] || 0),
  mothers: Number(row.Mothers || 0),
  motherSlots: Number(row['Mother Slots'] || 0),
  ratsPerLitter: Number(row['Rats/Litter'] || 0),
  dueDate: row['Due Date'],
  birthDate: row['Birth Date'],
  growoutStart: row['Grow-out Start'],
  sourceBin: row['Source Bin'],
  activeVacationMothers: Number(row['Active Vacation Mothers'] || 0),
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

const csvHeaders = Object.keys(inventoryRows[0]?.raw || {});

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
  if (delta === 0) return `${date} · today`;
  if (delta === 1) return `${date} · tomorrow`;
  if (delta < 0) return `${date} · ${Math.abs(delta)}d overdue`;
  return `${date} · ${delta}d`;
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

function rowsToCsv(rows) {
  return [
    csvHeaders.map(csvEscape).join(','),
    ...rows.map((row) => csvHeaders.map((header) => csvEscape(row.raw[header])).join(',')),
  ].join('\n');
}

function App() {
  const [activeRoom, setActiveRoom] = useState('all');
  const [activeRack, setActiveRack] = useState('all');
  const [activeStatus, setActiveStatus] = useState('all');
  const [query, setQuery] = useState(() => decodeURIComponent(window.location.hash.replace(/^#/, '')));
  const [selectedBin, setSelectedBin] = useState(() => query || '10-1-01');
  const searchRef = useRef(null);

  const summaries = useMemo(() => {
    const roomCounts = countBy(inventoryRows, 'room');
    const statusCounts = countBy(inventoryRows, 'status');
    const dueSoon = inventoryRows.filter((row) => {
      const due = daysUntil(row.dueDate);
      return due !== null && due <= 7;
    });
    const mappedRows = inventoryRows.filter((row) => row.shopifyVariantIds);
    return { roomCounts, statusCounts, dueSoon, mappedRows };
  }, []);

  const racks = useMemo(() => {
    const roomRows = activeRoom === 'all'
      ? inventoryRows
      : inventoryRows.filter((row) => row.room === activeRoom);
    return ['all', ...uniqueValues(roomRows, 'rack')];
  }, [activeRoom]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return inventoryRows.filter((row) => {
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
  }, [activeRack, activeRoom, activeStatus, query]);

  const selected = useMemo(() => {
    const visibleMatch = filteredRows.find((row) => row.bin === selectedBin);
    return visibleMatch || filteredRows[0] || inventoryRows.find((row) => row.bin === selectedBin) || inventoryRows[0];
  }, [filteredRows, selectedBin]);

  const rackGroups = useMemo(() => {
    return filteredRows.reduce((acc, row) => {
      acc[row.rack] = acc[row.rack] || [];
      acc[row.rack].push(row);
      return acc;
    }, {});
  }, [filteredRows]);

  function selectRoom(room) {
    setActiveRoom(room);
    setActiveRack('all');
  }

  function selectBin(row) {
    setSelectedBin(row.bin);
    window.history.replaceState(null, '', `#${encodeURIComponent(row.bin)}`);
  }

  function runQrLookup(event) {
    event.preventDefault();
    const needle = query.trim().replace(/^.*#/, '');
    const found = inventoryRows.find((row) => row.bin.toLowerCase() === needle.toLowerCase());
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

  function downloadBaseline() {
    downloadText('frostbite-inventory-2026-06-18.csv', inventoryCsv);
  }

  function downloadVisibleRows() {
    downloadText(`frostbite-flow-visible-${TODAY}.csv`, rowsToCsv(filteredRows));
  }

  const visibleRacks = Object.entries(rackGroups).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  return (
    <main className="flow-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Snowflake size={22} />
          </div>
          <div>
            <h1>Frostbite Flow</h1>
            <span>Local recovery cockpit</span>
          </div>
        </div>

        <nav className="nav">
          <button className="active" type="button" onClick={resetFlow}><Waves size={18} /> Flow</button>
          <button type="button" onClick={() => selectRoom('all')}><Boxes size={18} /> Rooms</button>
          <button type="button" onClick={focusLookup}><QrCode size={18} /> QR Lookup</button>
          <button type="button" onClick={downloadVisibleRows}><Archive size={18} /> Exports</button>
          <button type="button" onClick={() => document.querySelector('.guardrail')?.scrollIntoView({ block: 'center' })}><ShieldCheck size={18} /> Guardrails</button>
        </nav>

        <section className="guardrail">
          <Lock size={18} />
          <div>
            <strong>Shopify is read-only</strong>
            <span>No inventory writes, product edits, deletes, or sync pushes live here.</span>
          </div>
        </section>

        <section className="export-ledger">
          <span>Baseline export</span>
          <strong>June 18 · 714 bins</strong>
          <small>Every future export should be additive and dated.</small>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <form className="search" onSubmit={runQrLookup}>
            <Search size={18} />
            <input
              ref={searchRef}
              aria-label="Search bins, racks, notes, or QR targets"
              placeholder="Search bin, rack, SKU, note, or paste QR fragment..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit"><ScanSearch size={16} /> Find</button>
          </form>
          <div className="top-actions">
            <button type="button" onClick={downloadBaseline}><FileText size={16} /> Baseline</button>
            <button type="button" onClick={downloadVisibleRows}><Download size={16} /> Local export</button>
          </div>
        </header>

        <section className="metric-strip">
          <Metric label="Bins" value={inventoryRows.length} detail="Recovered baseline" />
          <Metric label="Breeding" value={summaries.roomCounts.breeding} detail="Room bins" tone="green" />
          <Metric label="Nursery" value={summaries.roomCounts.nursery} detail="Mother/litter flow" tone="blue" />
          <Metric label="Growout" value={summaries.roomCounts.growout} detail="Batch positions" tone="amber" />
          <Metric label="Due ≤ 7d" value={summaries.dueSoon.length} detail="Needs eyes" tone="red" />
          <Metric label="Mapped" value={summaries.mappedRows.length} detail="Rows with Shopify IDs" tone="violet" />
        </section>

        <section className="filters">
          <div className="control-group" aria-label="Room filter">
            {ROOMS.map((room) => (
              <button
                className={classNames(activeRoom === room && 'selected')}
                key={room}
                type="button"
                onClick={() => selectRoom(room)}
              >
                {room === 'all' ? 'All Rooms' : room}
              </button>
            ))}
          </div>
          <div className="control-group rack-control" aria-label="Rack filter">
            <Filter size={16} />
            <select value={activeRack} onChange={(event) => setActiveRack(event.target.value)}>
              {racks.map((rack) => (
                <option value={rack} key={rack}>{rack === 'all' ? 'All racks' : rack}</option>
              ))}
            </select>
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
        </section>

        <section className="flow-board">
          <div className="board-head">
            <div>
              <h2>Room Flow</h2>
              <p>{filteredRows.length} bins visible · grouped by rack</p>
            </div>
            <div className="status-legend">
              {STATUS_ORDER.map((status) => (
                <span key={status}><i className={`dot ${status}`} />{status}</span>
              ))}
            </div>
          </div>

          <div className="rack-scroll">
            {visibleRacks.map(([rack, rows]) => (
              <RackColumn
                key={rack}
                rack={rack}
                rows={rows}
                selectedBin={selected.bin}
                onSelect={selectBin}
              />
            ))}
          </div>
        </section>
      </section>

      <BinDetail selected={selected} summaries={summaries} />
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
            title={`${row.bin} · ${row.status} · ${row.sku}`}
          >
            <strong>{row.bin.split('-').at(-1)}</strong>
            <span>{row.sku === 'No SKU' ? 'open' : row.sku}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function BinDetail({ selected, summaries }) {
  const variants = parseVariants(selected.shopifyVariantIds);
  const due = daysUntil(selected.dueDate);
  const dueTone = due === null ? 'muted' : due < 0 ? 'danger' : due <= 7 ? 'warn' : 'ok';

  return (
    <aside className="detail-panel">
      <div className="detail-title">
        <div>
          <span>Selected bin</span>
          <h2>{selected.bin}</h2>
        </div>
        <PanelRightOpen size={22} />
      </div>

      <div className={`status-card ${selected.status}`}>
        <CircleDot size={18} />
        <div>
          <strong>{selected.status}</strong>
          <span>{selected.room} · {selected.rack} · {selected.type}</span>
        </div>
      </div>

      <dl className="detail-list">
        <div><dt>SKU</dt><dd>{selected.sku}</dd></div>
        <div><dt>Due date</dt><dd className={dueTone}>{formatDate(selected.dueDate)}</dd></div>
        <div><dt>Birth date</dt><dd>{selected.birthDate || 'Not set'}</dd></div>
        <div><dt>Rats / litter</dt><dd>{selected.ratsPerLitter}</dd></div>
        <div><dt>Mothers</dt><dd>{selected.mothers} / slots {selected.motherSlots || '-'}</dd></div>
        <div><dt>Pregnant</dt><dd>{selected.pregnantFemales}</dd></div>
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
          <strong>Shopify mapping</strong>
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
          <p>No variant IDs on this bin. That is not an error; offline stock and unmapped bins stay untouched.</p>
        )}
      </section>

      <section className="notes-card">
        <strong>Latest note</strong>
        <p>{selected.note || selected.lastEvent || 'No note recorded in baseline export.'}</p>
      </section>

      <section className="risk-card">
        <AlertTriangle size={18} />
        <p>{summaries.mappedRows.length} rows have Shopify variant IDs. This app does not write to Shopify or Flow APIs.</p>
      </section>
    </aside>
  );
}

createRoot(document.getElementById('root')).render(<App />);
