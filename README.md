# Frostbite Flow

Frostbite Flow is the Frostbite Feeders operations and inventory tracker:

- live inventory app: https://app.frostbitefeeders.com/inventory-test/
- bin/rack/room inventory baseline
- QR target map for bin labels
- Shopify SKU and variant crosswalk
- legacy phone-app prototype and QR label generator

This repository was recovered on 2026-06-19 after the GitHub repo existed but was empty.

## Current Recovery State

The recovered live app responded with `200 OK` on 2026-06-19 and its page title was `Frostbite Flow`.

Recovered files:

| Path | Purpose |
|---|---|
| `src/` | Local-first Frostbite Flow frontend for visually inspecting the recovered inventory baseline |
| `app/inventory-test-live-capture.html` | HTML capture of the currently deployed inventory-test app |
| `data/exports/frostbite-inventory-2026-06-18.csv` | June 18 inventory export, treated as the baseline recovery snapshot |
| `legacy/phone-app/` | Older static PWA prototype, QR label generator, README, and Supabase schema |
| `docs/RECOVERY_MANIFEST.md` | Evidence, hashes, and next stabilization steps |
| `docs/STABILIZATION_PLAN.md` | Current guardrails, deploy-source status, and next stabilization checks |
| `scripts/verify-baseline.ps1` | Repeatable baseline verifier for the live app, CSV, legacy files, Git, and Shopify read-only guard |
| `scripts/qa-browser.mjs` | Browser QA that verifies live shared-state GET, QR/hash lookup, phone layout, and a locally intercepted save dry-run |

## Baseline Inventory

The recovery baseline is the June 18, 2026 CSV snapshot recovered during repo restoration. It is the comparison point for "Changed" counts and reports, not a daily operator button.

`data/exports/frostbite-inventory-2026-06-18.csv` contains 714 rows:

| Room | Rows |
|---|---:|
| breeding | 270 |
| growout | 168 |
| nursery | 276 |

Status split:

| Status | Rows |
|---|---:|
| open | 434 |
| breeding | 270 |
| nursery | 6 |
| growout | 4 |

Important columns include `Bin`, `Room`, `Rack`, `Type`, `Status`, `SKU`, `Mothers`, `Due Date`, `QR Target`, `SKU Freezer On Hand`, and `Shopify Variant IDs`.

## Local Flow Cockpit

The React/Vite frontend is the Day 1 operator cockpit for visually working with the recovered baseline. It starts from `data/exports/frostbite-inventory-2026-06-18.csv`, then reads the shared Flow state through the Vite proxy at `/api/flow/state`.

The dashboard can save bin status/SKU/date/count/note edits back to Flow shared state through `/api/flow/state`. Shopify stays read-only behind the scenes; the operator UI does not expose Shopify as a workflow.

```powershell
npm install
npm run dev
```

Then open `http://127.0.0.1:5173/`.

Useful checks:

```powershell
npm run build
npm run qa:browser
npm run verify
```

The browser QA verifies the app title, metrics, live shared state (`714` bins), QR lookup, mobile hash lookup, and screenshots. It also clicks through a save flow but intercepts the `PUT /api/flow/state` locally so test runs do not mutate live inventory.

Current operator exports:

- Daily Report: Markdown report with current inventory by SKU and changed rows.
- OKF Bundle: JSON bundle for agents/company context graph storage.

## Do Not Lose Again

Before changing product behavior:

1. Run `scripts\verify-baseline.ps1`.
2. Confirm whether `app/inventory-test-live-capture.html` is only a deployed bundle capture or the true source artifact.
3. Locate the deploy source for `app.frostbitefeeders.com`.
4. Replace the live-capture file with real source if found, but keep the capture as evidence.
5. Preserve every future inventory export under `data/exports/`.
6. Treat Shopify as read-only unless Adam explicitly approves a specific write path.
7. Treat live browser QA as write-capable unless non-GET requests are intercepted and blocked.

