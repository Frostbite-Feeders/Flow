# Frostbite Flow Crew Testing Guide

Use this first version as a simple floor tool:

1. Open https://frostbite-flow.vercel.app.
2. Type or scanner-wedge a bin code into search.
3. See the bin details.
4. Set the workflow status first: Breeding, Nursery, Growout, or Open.
5. Edit only floor fields: actual count, room-specific counts, SKU target, dates, source bin, and floor note.
6. Check the Flow write confirmation.
7. Save shared state.
8. Export Daily Report at the end of the run.

## Clean Start State

The shared app is intentionally blank for first barn testing:

- Total bins: `714`
- Active: `0`
- Due this week: `0`
- Overdue: `0`
- Open: `714`
- Changed today: `0` before the first real save

All bins start open with zero inventory. That is deliberate so Zach can prove the real setup flow instead of fighting recovered June 18 sample state.

The default path is:

1. Search bin.
2. See bin.
3. Set status.
4. Enter floor fields.
5. Save Flow.
6. Check Daily Report at the end.

## Zach Barn Walk Test

- Open `Wall Flow` in the Bin Map.
- Treat each wall section as one 120-slot walking wall.
- Slots run `A01` through `A12`, then weave back `B12` through `B01`, then continue down through `J`.
- The large wall slot is only a walking position. The smaller bin code is the real Flow bin that gets saved.
- Work a short path first: `A01`, `A02`, `A03`, then `A12`, `B12`, `B11`.
- For each test bin: confirm the physical bin matches the screen, update actual count or note, save, refresh, and confirm it stayed.

## Boundaries

- Shopify is read-only and behind the scenes.
- Do not expect camera QR scanning yet. Typed lookup is the current test path.
- Flow shared state is write-mode for testing.
- Shopify stays read-only. This app does not write inventory back to Shopify.
- Actual count is the floor truth field. Open bins should stay at `0`.
- If a save fails, do not keep retrying blindly. Write the bin code and what changed, then refresh once.

## Before Crew Testing

Create a backup of the shared Flow state:

```powershell
npm run backup:flow
```

Then run the deployed-link QA:

```powershell
npm run qa:deploy
```

The deploy QA opens the Vercel app, loads live shared state, uses typed bin lookup, dry-runs a Flow save with the write intercepted, downloads Daily Report and OKF Bundle, and fails if it sees Shopify workflow UI or Shopify requests.

## What To Test First

Use a small obvious set before broad floor use:

- Find three bins by typing the bin code.
- Pick one bin and set it to Breeding. Confirm male/female fields appear.
- Pick one bin and set it to Nursery. Confirm mother/litter/date fields appear.
- Pick one bin and set it to Growout. Confirm SKU/source/growout fields appear.
- Pick one bin and leave it Open. Confirm it stays zeroed.
- Switch to Wall Flow and confirm the wall slots weave: `A01`, `A12`, `B12`, `B01`.
- Change an actual count on one test bin and confirm the write preview names that change.
- Change one harmless floor note and save it.
- Refresh the browser and confirm the note stayed.
- Change the note back or mark it as a test note.
- Export Daily Report.
- Export OKF Bundle.

## Feedback To Capture

For each issue, capture:

- Device: phone, tablet, or desktop.
- Bin code.
- What the person tried to do.
- What happened.
- Screenshot if possible.
- Whether refreshing fixed it.
