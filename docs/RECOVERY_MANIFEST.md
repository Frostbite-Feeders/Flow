# Frostbite Flow Recovery Manifest

Recovery date: 2026-06-19

## What Was Found

The GitHub repo `https://github.com/Frostbite-Feeders/Flow.git` existed but was empty when cloned.

The real operating surface was found through Windows Recent shortcuts and the June 18 inventory export:

- `C:\Users\Adam\Downloads\frostbite-inventory-2026-06-18.csv`
- `https://app.frostbitefeeders.com/inventory-test/`
- `C:\Users\Adam\OneDrive\Desktop\FROSTBITE\Frostbite Master File\Frostbite Phone App`

The live URL responded successfully on 2026-06-19:

- status: `200 OK`
- title: `Frostbite Flow`
- captured to: `app/inventory-test-live-capture.html`

## Recovered Assets

Hash note: the SHA256 values below are source/download byte hashes. On Windows,
Git may check out text files with CRLF endings when `core.autocrlf=true`, which
changes working-tree SHA256 values without changing the normalized file content.
Use `scripts/verify-baseline.ps1` for repeatable baseline checks.

| File | Source | SHA256 |
|---|---|---|
| `app/inventory-test-live-capture.html` | `https://app.frostbitefeeders.com/inventory-test/` | `35DB9A1DCF90CCC60F95C5E14AE968E5FF7D4C3D9E564A01CBDF5BC10705FCAB` |
| `data/exports/frostbite-inventory-2026-06-18.csv` | `C:\Users\Adam\Downloads\frostbite-inventory-2026-06-18.csv` | `420C32AEDE4E14B78EB8F45A16E5157C7C6E06D21997623DE4D80BAE4FB1D4A1` |
| `legacy/phone-app/index.html` | old Frostbite Phone App folder | `33F85413362533599B4F0F6985D9FC327AC8034DFE99C14F3F381449B8A18017` |
| `legacy/phone-app/qr-labels.html` | old Frostbite Phone App folder | `82A7AABFC63FCF47E50577C088B2CF753A66E778FAF207A4F76DF784A52E9135` |
| `legacy/phone-app/supabase-schema.sql` | old Frostbite Phone App folder | `1E665A156B42841B28CF115A7DCCD80AEA7D45A92B6A7DF7CE6583C9F032594E` |

## June 18 Inventory Baseline

Rows: 714

Rooms:

- breeding: 270
- growout: 168
- nursery: 276

Statuses:

- open: 434
- breeding: 270
- nursery: 6
- growout: 4

The CSV includes QR targets such as:

`https://app.frostbitefeeders.com/inventory-test/#10-1-01`

That strongly suggests the deployed app uses URL fragments for direct bin lookup.

## Local Folders That Were Misleading

`C:\Users\Adam\OneDrive\Documents\Frostbite Inventory Tracker` exists, but it is effectively an empty repo shell. It has no normal commits and no recovered app files.

`C:\Users\Adam\OneDrive\Documents\Frostbite. Husbandry` is a separate breeding/pairing calculator. It is not the Flow inventory system.

## Stabilization Plan

1. Keep the recovered state anchored at commit `8905de7b8c628c8d419ac306524ae1634588686b`.
2. Tag that commit as `recovery-2026-06-19`.
3. Find the actual deployment source for `app.frostbitefeeders.com`.
4. If the live app source is found, add the source code and keep this capture as evidence.
5. Run `scripts/verify-baseline.ps1` before changing product behavior.
6. Preserve every future inventory export under `data/exports/`.
7. Keep Shopify read-only until Adam explicitly approves a specific write path.

