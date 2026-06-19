# Inventory Exports

This folder is the evidence ledger for Frostbite Flow inventory snapshots.

Rules:

- Keep every exported inventory CSV here.
- Use date-stamped filenames: `frostbite-inventory-YYYY-MM-DD.csv`.
- Never overwrite an older export.
- Treat Shopify inventory as read-only until Adam explicitly approves a write path.
- If an export comes from a live app button, record the app URL, export time, and SHA256 in the recovery or stabilization docs.

The current baseline is `frostbite-inventory-2026-06-18.csv`.
