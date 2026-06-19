# Frostbite Flow Stabilization Plan

Date: 2026-06-19

## Operator Guardrails

- Shopify is a live money-taking store. Treat Shopify as read-only unless Adam explicitly approves a specific write.
- Do not delete products, variants, inventory levels, orders, mappings, or offline-sale buffers.
- Current inventory is not assumed accurate. Flow should verify connection and mapping first, then write only after approval.
- Offline sales matter. Do not "clean up" inventory just because Shopify and Flow disagree.
- Browser QA against the live app is not automatically read-only. The recovered app can call `PUT /api/flow/state` after startup if remote state is missing. Any browser/live-app QA must intercept and block non-GET requests unless Adam approves writes.
- Direct connection checks should use GET-only probes.

## Verified Baseline

- Live app: `https://app.frostbitefeeders.com/inventory-test/`
- Live title: `Frostbite Flow`
- Live app SHA256 from byte-stable `curl.exe` capture: `35DB9A1DCF90CCC60F95C5E14AE968E5FF7D4C3D9E564A01CBDF5BC10705FCAB`
- Recovery commit: `8905de7b8c628c8d419ac306524ae1634588686b`
- Expected recovery tag: `recovery-2026-06-19`
- June 18 CSV rows: `714`
- Unique bins: `714`
- QR targets: `714`
- Shopify variant ID rows in baseline CSV: `10`

## Current App Shape

The recovered deployed app capture is still evidence, not confirmed source.

Known runtime clues from `app/inventory-test-live-capture.html`:

- `BUILD_VERSION = 'sprint23b-console-inventory-cleanup-20260618'`
- `FLOW_API_BASE = '/api/flow'`
- local browser storage key: `frostbiteInventory_v0`
- Flow state can save to `/api/flow/state` with `PUT` after remote state is loaded
- If `/api/flow/state` has no payload, startup can attempt an initial seed write to `/api/flow/state`
- Shopify bridge is marked `mode: 'recon_only'`
- Shopify calls visible in the capture are read-oriented:
  - `/api/flow/shopify-variants`
  - `/api/flow/shopify/health`
  - `/api/flow/shopify/demand`

## GET-Only Connection Snapshot

Checked with `x-tenant-id: frostbite` on 2026-06-19:

| Endpoint | Method | Status | Meaning |
|---|---:|---:|---|
| `/api/flow/health` | GET | 200 | Flow API is online and points at Supabase |
| `/api/flow/state` | GET | 200 | Live Flow state exists; response was about 266 KB |
| `/api/flow/shopify/health` | GET | 200 | Shopify bridge is configured as `mode=read_only`, but token/domain are missing |
| `/api/flow/shopify-variants` | GET | 200 | Variant mapping is available; 26 pack variants returned |
| `/api/flow/shopify/demand` | GET | 503 | Read-only Shopify order demand is not connected until token/domain are configured |

## Deploy Source Status

Searches on 2026-06-19 found this recovered repo and the earlier recovery worktree, but did not find the original deploy source for `app.frostbitefeeders.com`.

The live `/api/flow/health` endpoint points at Supabase, so Supabase is part of
the current backend. That does not identify the deploy source or server code.

Next places to check:

- hosting provider for `app.frostbitefeeders.com`
- DNS and deploy target for the `inventory-test` route
- any Vercel, Netlify, Cloudflare Pages, or server repo attached to the Frostbite Feeders account
- the backend that serves `/api/flow`

Until the deploy source is found, keep `app/inventory-test-live-capture.html` as forensic evidence. Do not treat it as a maintainable source file.

## Stabilization Steps

1. Run `scripts/verify-baseline.ps1` before changing Flow behavior.
2. Keep `.gitattributes` in place so recovered text evidence uses stable LF endings.
3. Preserve new inventory exports under `data/exports/` with dated filenames.
4. Keep Shopify work read-only: health, variants, demand, and mapping checks only.
5. Add source code only after the actual deploy source is found or intentionally rebuilt.
6. Before any Shopify write path exists, require an explicit approval gate, dry-run output, exact row/product/variant counts, and rollback notes.
7. After source recovery, add smoke tests for direct QR fragments such as `#10-1-01`.
8. For browser QA of the live URL, block `POST`, `PUT`, `PATCH`, and `DELETE` requests to `app.frostbitefeeders.com`, Shopify, Supabase, and `/api/flow`.

## Verification Command

```powershell
scripts\verify-baseline.ps1
```

For read-only backend probes:

```powershell
scripts\verify-baseline.ps1 -CheckReadOnlyApi
```
