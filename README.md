# Kabun Farm Intelligence

An offline-first Progressive Web App for managing and logging daily activity on a small commercial vegetable farm in Kudat, Sabah, Malaysia. Built to work in the field with poor connectivity — actions are queued locally and synced to Google Sheets when back online.

---

## Features

**Beds, Crops & Plots**
- Track multiple numbered beds with active crops and day counts
- Watering alerts — bed cards flag beds not watered in 3+ days
- Tap a bed to see crop details, past crop history, and log actions
- Add new beds directly from the app; rename or retire one (hidden from home, kept in records)
- **Plots** — group beds together (same crop, or any freeform grouping you like) for one-tap bulk logging instead of tapping each bed individually. Home collapses a plot's beds into one card with a rollup watering alert ("6 of 24 beds not watered"). A bed belongs to at most one plot; you can still target one specific bed exactly as precisely as before, plot membership or not.

**Activity Logging**
- Log irrigation, pest control, harvest, and sowing per bed, per plot, or whole farm
- Harvest marks crops as done and removes them from the active bed; optional harvest weight (kg) for yield tracking, shown on the log card and rolled into cost-per-kg
- Sowing adds a new crop batch to the bed immediately
- Optional inputs/notes with a formula picker (see Formulas)
- Optional cost per activity
- Pull-to-refresh: swipe down to sync latest data

**Sales**
- Log crop sales separately from harvest
- Fields: crop, quantity, unit (kg / ikat / bag), price per unit
- Total revenue auto-calculated
- No bed required — farmer thinks in crop + quantity, not per bed

**Formulas**
- Spray and fertigation recipes managed directly in the app
- Add, edit, and delete formulas from your phone — no Sheets access needed
- Color-coded category tags (fixed preset palette) so formulas sharing a category are visually consistent
- Single sprayer volume input (default 16L) recalculates all recipe doses instantly
- Formula picker in the log form — tap a recipe to auto-fill ingredients and amounts into inputs/notes

**Plan & Today's Tasks**
- A manager can schedule dated, bed-specific tasks (time slot, optional Formula link) remotely — the worker opens the app and sees what's planned
- Today's Tasks on Home: a compact glance list of what's due today
- Plan tab: day-grouped view of the coming week, plus Overdue (past, not done) and beyond-week groups so nothing planned silently disappears
- Logging the matching real activity auto-checks a pending task off — no separate manual tap

**Weather**
- 4-day forecast for the farm's exact coordinates (Open-Meteo, no backend needed)
- A plain "water today or skip it" call based on today's and tomorrow's rain chance
- Ties into the bed watering alert when rain is likely and a bed is flagged

**Financial Summary & Profit by Crop**
- Revenue, cost, and net shown on the Activity tab (toggle week/month)
- Profit by Crop: all-time revenue/cost/net per crop, splitting cost evenly across intercropped beds, with cost-per-kg once harvest weight is logged

**Activity Log**
- All logs and sales merged into a single feed, grouped by date
- Filter by bed, plot, or activity type
- CSV export of the full activity history

**Security**
- Shared farm PIN gates the whole backend (a soft deterrent, not real auth — appropriate for a single-farm, single-PIN app). Entered once via a prompt, cached on-device.

**Offline & Sync**
- All actions saved to a local queue first, synced to Google Sheets via Apps Script when online
- Deletes are soft (a status flip, not row removal) so an accidental delete in the field isn't unrecoverable
- Cache-first Service Worker — app loads instantly with no signal
- Tap the sync status badge to retry or clear a stuck offline queue
- Update banner appears when a new version deploys

---

## Testing

`test.html` is a zero-dependency regression suite — open it directly in a browser, no build step, no npm. It mocks `fetch`/`prompt` before the app loads and isolates `localStorage`, so it never touches real farm data. Covers the pure logic functions: date normalization, watering-alert decisions, crop P&L math, the dosage calculator, plot membership, and more. Run it after any change to logic in `js/`.

---

## Stack

- Vanilla JS (Native ES Modules) + CSS — no framework, no build step
- Service Worker (cache-first, offline queue)
- IndexedDB & Firestore persistence with localStorage fallback
- Firebase Cloud Firestore backend

---

## Google Sheets Structure

Create a Google Spreadsheet with these sheets and exact camelCase headers:

| Sheet | Headers |
|---|---|
| Beds | bedNumber, location, status, name, plotId |
| Batches | id, bedNumber, cropName, location, plantingDate, status, harvestDate |
| Logs | id, date, bedNumber, activityCategory, cropName, inputsUsed, costRM, revenueRM, weight, status |
| Formulas | id, name, category, description, recipe |
| Sales | id, date, crop, quantity, unit, pricePerUnit, totalRevenue, status |
| Tasks | id, date, timeSlot, bedNumber, activityCategory, formulaId, note, status |
| Plots | id, name, status |

`status` columns: blank/`"active"` = active, `"done"` = completed (Tasks only), `"deleted"`/`"retired"` = soft-deleted.

**Formula recipe format:** pipe-separated `name:amount:unit` per ingredient
```
EM4:10:ml|Antracol:2:g
```
Amounts are per litre — the app multiplies by sprayer volume.

> **Note:** The `id` column in the Formulas sheet is required for add/edit/delete to work. Populate existing rows with unique values (e.g. `f1`, `f2`, ...).

---

## Deploying Your Own

1. Fork this repo
2. Set up the Google Spreadsheet with the sheets and headers above
3. Copy the latest `appsscript_vNN.js` code into a new Apps Script project bound to the spreadsheet
4. In Apps Script → Project Settings → Script Properties, add `FARM_PIN` with a PIN of your choice
5. Deploy the Apps Script as a web app (execute as me, anyone can access)
6. Copy the deployment URL into `app.js`:
   ```js
   const GOOGLE_SCRIPT_URL = "your_apps_script_url_here";
   ```
7. Update `FARM_LAT`/`FARM_LON` in `app.js` to your farm's coordinates (used for the weather forecast)
8. Enable GitHub Pages on the `master` branch
9. Open the app on your phone and add it to your home screen

**Upgrading an existing deployment:** always edit the existing Apps Script deployment in place and redeploy — never create a new one, or the URL (and everything pointing at it) breaks.

---

## Apps Script Actions

**doGet**
- `?action=getBeds` — beds with active crops, crop history, last activity, watering status (blends whole-farm and plot-scoped watering), and plot membership
- `?action=getLogs` — all logs sorted newest first
- `?action=getFormulas` — all formulas
- `?action=getSales` — all sales sorted newest first
- `?action=getTasks` — all tasks sorted soonest first
- `?action=getPlots` — all active plots

**doPost**
- `addLog`, `addBed`, `updateBed`, `deleteBed`
- `addBatch`, `updateBatch`, `deleteLog`
- `addSale`, `deleteSale`
- `addFormula`, `updateFormula`, `deleteFormula`
- `addTask`, `updateTaskStatus`, `deleteTask`
- `addPlot`, `renamePlot`, `deletePlot`, `assignBedsToPlot` (bulk), `setBedPlot` (single bed), `removeBedFromPlot`

All actions require a `token` matching the `FARM_PIN` Script Property (`?token=` on GET, in the JSON body on POST).

---

## What's Next

Feature ideas are prioritized against a simple filter: does it serve *this one farm, one manager, this week* — or is it solving a hypothetical bigger problem? See the [full roadmap](https://claude.ai/code/artifact/6d916e9a-bead-4f95-88f5-817276229466) for what's built, what's next, and why a few ideas (multi-user accounts, perennial crop tracking) were deliberately parked rather than built.

---

## Context

Built for a single commercial vegetable farm in Kudat, Sabah. Units (ikat, bag) and workflows (end-of-day sales logging, spray formula calculator) are specific to this farm's operation. Harvest and sales are intentionally separate — the farmer harvests physically, then sells later, sometimes split across multiple buyers.
