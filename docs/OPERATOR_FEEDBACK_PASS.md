# Operator Feedback Pass

Date: 2026-06-20

## What Changed

- Removed the visible Shopify workflow surfaces from the operator UI.
  - No left-nav Shopify View.
  - No right-panel Shopify Mapping card.
  - Shopify remains read-only behind the scenes and is guarded by QA/static checks.
- Removed the Baseline button from the main action row.
- Renamed Quick Scan to Scan Bin so it sounds like what it actually does.
- Kept the bin map visible while searching/scanning. Search now selects a bin without blanking the room/rack context.
- Added activity colors to bin tiles:
  - red: action needed
  - amber: due soon
  - blue: in use
  - gray/white: ready
- Added OKF Bundle export for agent/company-context ingestion.
- Added stable `data-testid` hooks for key agent actions.

## Plain-English Terms

- Recovery baseline: the June 18, 2026 inventory CSV recovered during repo restoration. It is the comparison snapshot, not an operator task.
- Scan Bin: focuses the bin lookup flow for a scanner wedge or typed QR/bin code. It is not a camera scanner yet.
- OKF Bundle: structured JSON for agents and company context graph storage. It includes facts, SKU inventory, per-bin inventory, room/rack/bin/SKU graph nodes, graph edges, changed rows, and agent interface notes.

## Verified

```powershell
npm run build
npm run qa:browser
npm run verify
```

Browser QA verifies:

- live Flow state has `714` bins
- search selects bins without emptying the bin map
- activity-color legend is present
- visible Shopify workflow copy is absent
- desktop and mobile Flow writes are intercepted during QA
- OKF export parses as `frostbite-flow-operations-snapshot`
- OKF export has `714` per-bin records, graph nodes, graph edges, and SKU inventory
- no Shopify requests occur
