# Agent Surface

Frostbite Flow is built for humans and agents. Agents should treat this repo and app as an operations cockpit for Flow shared state, not as a Shopify editor.

## Stable UI Hooks

| Test ID | Purpose |
|---|---|
| `frostbite-flow-app` | App root |
| `bin-search` | Search/scanner input |
| `qr-lookup-action` | Focus lookup |
| `daily-report-action` | Export Markdown report |
| `okf-export-action` | Export OKF JSON bundle |
| `scan-bin-action` | Start scan-bin mode |
| `scan-tray` | Active scan-bin panel |
| `bin-map` | Room/rack/bin visual map |

## Data Contracts

- Read live Flow state through `GET /api/flow/state`.
- Save Flow edits through `PUT /api/flow/state`.
- Save scope is one selected Flow bin patch inside the full shared-state payload.
- Shopify is read-only and not an operator workflow.
- Browser QA intercepts Flow writes and asserts no Shopify requests.

## Export Contracts

- Daily Report: Markdown operator report with current inventory by SKU and changed rows.
- OKF Bundle: JSON graph/context export for company memory systems.

OKF bundle includes:

- source and recovery baseline metadata
- summary facts
- inventory by SKU
- per-bin inventory
- graph nodes and edges for room/rack/bin/SKU context
- operator actions
- changed rows against the June 18 recovered CSV
- agent interface notes and invariants
