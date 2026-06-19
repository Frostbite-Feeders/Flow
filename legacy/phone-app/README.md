# Frostbite Feeders Inventory System

**QR + Tap + Photo. No typing. No cards.**

A Progressive Web App (PWA) for tracking rat inventory from breeding through frozen stock.

---

## Quick Start (Local Testing)

1. Open `index.html` in Chrome/Safari
2. Open browser console (F12)
3. Run: `demo.addTestData()`
4. Test workflows:
   - `demo.scanBin("M1-001")` — Litter bin actions
   - `demo.scanBreeder("M1-F001")` — Retire female breeder → Jumbo
   - `demo.scanMaleBreeder("M1-M001")` — Retire male breeder → Large
   - `demo.scanBatch("2024-0001")` — Grade batch
   - `demo.scanFrozen("small")` — Adjust frozen inventory

---

## Deployment (Free)

### Option A: Vercel (Recommended)
1. Create account at vercel.com
2. Install Vercel CLI: `npm i -g vercel`
3. Run in this folder: `vercel`
4. Done — you get a URL like `frostbite-inventory.vercel.app`

### Option B: Netlify
1. Create account at netlify.com
2. Drag this folder to Netlify dashboard
3. Done

### Option C: GitHub Pages
1. Create GitHub repo
2. Push these files
3. Settings → Pages → Deploy from main branch

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main PWA app — all inventory workflows |
| `qr-labels.html` | QR label generator for printing |
| `manifest.json` | PWA manifest for mobile install |
| `supabase-schema.sql` | Database schema (optional cloud sync) |

---

## QR Code Formats

| Type | Format | Example |
|------|--------|---------|
| Breeding Bin | `FF-BIN-{module}-{number}` | `FF-BIN-M1-042` |
| Breeder | `FF-BREEDER-{module}-{sex}{number}` | `FF-BREEDER-M1-F042` |
| Batch | `FF-BATCH-{year}-{number}` | `FF-BATCH-2024-0001` |
| Frozen | `FF-FROZEN-{sku}-{location}` | `FF-FROZEN-small-LOC01` |

---

## SKU Structure

### Growth SKUs (from litter grading)
| SKU | Weight | % of Sales |
|-----|--------|------------|
| Pinky | 1-13g | 2% |
| Fuzzy | 14-20g | 15% |
| Pup | 20-30g | 21% |
| Weaned | 31-45g | 15% |
| Small | 46-80g | 20% |
| Sm/Med | 80-120g | 15% |
| Medium | 120-175g | 10% |

### Breeder Retirement SKUs
| SKU | Source | Retirement Age |
|-----|--------|----------------|
| Large | Male breeders | 3 months |
| Jumbo | Female breeders | 6 months |

---

## Workflows

### 1. New Litter
`Scan bin QR → "New Litter" → Tap count → Confirm`

### 2. Log Mortality  
`Scan bin QR → "Mortality" → Tap count → Select reason → Confirm`

### 3. Harvest to Processing
`Scan bin QR → "Harvest" → Confirm count → Batch QR generated`

### 4. Grade Batch (Growth SKUs only)
`Scan batch QR → "Grade" → Allocate counts by size → Confirm`

### 5. Retire Breeder (Large/Jumbo source)
`Scan breeder QR → "Retire" → Confirms → Adds to Large or Jumbo inventory`

### 6. Adjust Frozen Inventory
`Scan frozen QR → "Pull" or "Recount" → Tap count → Confirm`

---

## Adding Cloud Sync (Optional)

For multi-device sync:

1. Create free Supabase account: supabase.com
2. Create new project
3. Go to SQL Editor
4. Paste contents of `supabase-schema.sql`
5. Run the SQL
6. Get your project URL and anon key from Settings → API
7. Add to app (requires code update — contact for integration)

---

## Printing QR Labels

1. Open `qr-labels.html`
2. Select label type (Bin, Breeder, Frozen, Batch)
3. Set module/SKU and count
4. Click Generate
5. Click Print
6. Use Avery 5160 or similar label sheets

---

## Phase 1 Configuration

- **Modules**: 1 active, 1 coming online (expandable to 6)
- **Weekly Production Target**: ~4,000 rats
- **Data Storage**: Local browser storage (syncs to Supabase if configured)

---

## Support

Built for Frostbite Feeders by Claude.
