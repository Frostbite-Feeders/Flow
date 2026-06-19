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

1. Commit this recovered state in the `Flow` repo.
2. Push the initial commit to GitHub once Adam approves publication.
3. Find the actual deployment source for `app.frostbitefeeders.com`.
4. If the live app source is found, replace `app/inventory-test-live-capture.html` with source code and keep the capture as evidence.
5. Add a small import/validation script for the CSV baseline.
6. Preserve every future inventory export under `data/exports/`.
7. Decide whether Supabase is still the backend plan or whether the current deployed app stores state elsewhere.

