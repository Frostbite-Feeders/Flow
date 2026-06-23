# Frostbite Flow Crew Testing Guide

Use this first version as a simple floor tool:

1. Open https://frostbite-flow.vercel.app.
2. Type or scanner-wedge a bin code into search.
3. See the bin details.
4. Edit only floor fields: status, SKU, dates, counts, and floor note.
5. Check the Flow write confirmation.
6. Save shared state.
7. Export Daily Report at the end of the run.

## Boundaries

- Shopify is read-only and behind the scenes.
- Do not expect camera QR scanning yet. Typed lookup is the current test path.
- Flow shared state is write-mode for testing.
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
