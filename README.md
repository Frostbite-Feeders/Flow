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
| `app/inventory-test-live-capture.html` | HTML capture of the currently deployed inventory-test app |
| `data/exports/frostbite-inventory-2026-06-18.csv` | June 18 inventory export, treated as the baseline recovery snapshot |
| `legacy/phone-app/` | Older static PWA prototype, QR label generator, README, and Supabase schema |
| `docs/RECOVERY_MANIFEST.md` | Evidence, hashes, and next stabilization steps |

## Baseline Inventory

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

## Do Not Lose Again

Before changing product behavior:

1. Commit this recovered state.
2. Confirm whether `app/inventory-test-live-capture.html` is only a deployed bundle capture or the true source artifact.
3. Locate the deploy source for `app.frostbitefeeders.com`.
4. Replace the live-capture file with real source if found.
5. Preserve every future inventory export under `data/exports/`.

