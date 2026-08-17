# Kabun Farm Intelligence

An offline-first Progressive Web App (PWA) built specifically for managing and logging daily commercial vegetable farm operations in Kudat, Sabah, Malaysia. Engineered for extreme field usability: tropical sunlight glare, poor cellular connectivity, wet/dirty hands, and fast single-handed walking operation.

---

## 🌾 Core Features & Field Capabilities

### 1. Beds, Crops, Plots & Lifecycle Management
- **High-Density Grid & List Views:** Instant toggle between compact 2-column Grid view (`☷ Grid`) to scan 22+ beds at a glance, or detailed List view (`☰ List`).
- **Flexible Bed Provisioning:**
  - **Custom Identifiers & Gap Filling:** Add any custom bed ID (e.g. fill a missing number `Bed 5`, or use zone prefixes like `A1`, `Tunnel 2`). Automatically suggests the lowest available integer gap.
  - **Bulk Bed Creation:** Provision ranges of beds in a single tap (e.g. `Starting Bed #23, Count: 10` creates Beds 23–32 and assigns them to a plot).
- **Fallow / Soil Rest State (`💤 Fallow`):** Toggle resting/solarizing beds into a fallow state. They remain visible in the grid with a muted slate badge but are automatically excluded from watering alerts.
- **Archived Beds & 1-Tap Restore:** Non-destructive archiving (`status: "retired"`). Access the `📁 Archived Beds` drawer to restore retired beds with their historical crop records intact.
- **Plots (Block Grouping):** Group beds together (e.g., *Eggplant Plot*, *Greenhouse 1*) for 1-tap bulk watering, spraying, or harvesting. Plots roll up member bed watering alerts into a single summary (*"3 of 22 beds unwatered"*).
- **Watering Decision Engine:** Automatic 3-day watering alarms (`💧 Not watered in 4d`) that intelligently cross-reference whole-farm, plot-level, and bed-specific logs.

### 2. Fast Field Ergonomics (Tier 1 & Tier 2 Overhaul)
- **Slide-Up Bottom Sheets:** Mobile-native bottom sheet modals with drag handles (`.bottom-sheet-handle`) and safe-area insets (`env(safe-area-inset-bottom)`) for comfortable one-handed thumb reach.
- **Sunlight Glare Optimized:** High-contrast color palette with amber warning badges (`#fef3c7`/`#92400e`), deep green day chips, and darkened text for direct midday sunlight legibility.
- **Native Numeric Keypads (`inputmode="decimal"`):** All numeric inputs (quantities, prices, volumes, costs, weights) immediately open the large-key numeric keypad on iOS and Android.
- **Wet-Finger Tank Steppers:** `[ − ]` and `[ ＋ ]` buttons around sprayer tank counts to quickly scale mix ratios without fiddling with tiny text inputs.
- **1-Tap Date Preset Chips:** Instant `[ Today ]` and `[ Yesterday ]` pills on all forms to bypass slow native calendar scroll wheels.
- **Multi-Bed Batch Selection:** Checkbox list allowing batch irrigation/spraying logs across multiple selected beds simultaneously.
- **Enlarged Touch Targets ($\ge 48\text{px}$):** Sized for gloved or dirty hands in the field.

### 3. Task Management & 1-Tap Execution
- **Today's Tasks:** Compact glance list on the Home screen showing scheduled chores for the day.
- **1-Tap `⚡ Done` Action:** Workers can mark tasks complete directly from the card with a single tap, or execute the matching activity to auto-check the task off.
- **Plan Tab:** Day-grouped forward schedule for the upcoming week, plus overdue tracking.

### 4. Spray Formulas & Dosage Calculator
- **Zero-Accordion Quick Formulas:** Horizontal swipeable formula chips inside the log sheet. Tapping a recipe instantly calculates dosages and auto-fills inputs.
- **Multi-Tank Volume Scaling:** Enter total sprayer volume (e.g. `16L`, `20L`, or `2x 16L = 32L`) to scale all ingredient measurements dynamically.
- **8 Standard Agricultural Presets:** Built-in recipes for *Bio-Botanical Pest Shield (Bio Botava + Garlic Oil)*, *Amino 18 Foliar Mix*, *Wira CalBo Bloom Set*, *Antracol Protective Spray*, *Abamectin Mite Knockdown*, and more.
- **In-App Recipe Manager:** Create, color-code, edit, and delete custom formulas on your phone.

### 5. Harvest, Sales & Unit Economics
- **Separated Harvest & Sales:** Physical harvest logging (with optional kg weights) is separated from sales transactions.
- **Crop Sales Logger:** Supports custom commercial units (`kg`, `ikat`, `bag`) with real-time revenue calculations (`RM total`).
- **Crop P&L & Cost-Per-Kg:** Automatic cost allocation across intercropped beds, calculating true net profit and cost-per-kg once harvest weights are recorded.
- **Full CSV Activity Export:** Export full date-grouped logs and sales to CSV.

### 6. Weather Forecast & Coordinates
- **Exact Coordinates:** Configured for farm coordinates `6°49'42.5"N, 116°45'56.8"E` (`6.828472, 116.765778`) in Kudat, Sabah (Timezone: `Asia/Kuching` / GMT+8).
- **Open-Meteo Integration:** 4-day forecast for temperature, precipitation probability, and weather codes without requiring an API key.

---

## 🛠️ Architecture & Stack

```
KabunFarm/
├── index.html          # Main HTML structure with bottom sheet modals
├── style.css           # Vanilla CSS (design system, tokens, bottom sheets)
├── sw.js               # Cache-first Service Worker for offline PWA
├── test.html           # Zero-dependency browser regression test suite
└── js/
    ├── state.js        # State store, date utilities, constants, color maps
    ├── calculations.js # Pure agricultural math (watering engine, dilution, P&L)
    ├── db.js           # Firestore SDK persistence, offline queues, CRUD operations
    ├── views.js        # DOM template renderers (cards, grid, chips, filters)
    └── app.js          # Main app controller, modal flows, window bridge
```

- **Runtime:** Pure Vanilla JS (Native ES Modules) + Vanilla CSS — **Zero build step, zero bundling dependencies**.
- **Database:** Firebase Cloud Firestore with bundled local compat SDK (`scripts/firebase-*-compat.js`) for reliable offline initialization.
- **Offline Reliability:** Service Worker cache-first shell + IndexedDB/Firestore local cache.
- **Security:** Farm-level PIN access control.

---

## 🧪 Testing & Verification

Open `test.html` directly in any web browser — no local server or npm install required.

The regression suite contains **78 pure-function assertions** covering:
- Date recovery from UTC ISO timestamps across month boundaries
- 3-Way watering logic (whole-farm vs plot vs bed priority and multi-day gaps)
- Fallow bed watering exclusion
- Multi-ingredient recipe parsing and extreme sprayer tank scaling (up to 1000L IBC)
- Crop P&L cost sharing, decimal rounding, and negative margin calculations
- Sequential bed gap-finding (`findNextAvailableBedNumber`), custom bed IDs, and bed restoration

---

## 🧭 Improvement Roadmap

### ✅ Tier 1: Readability, Touch Targets & Modularity (Done)
- High-contrast sunlight palette, 1-tap date preset pills, $\ge 48\text{px}$ touch targets, modular ES architecture.

### ✅ Tier 2: Mobile Ergonomics & Field Speed (Done)
- Numeric keypad optimization (`inputmode="decimal"`), sprayer tank steppers, bottom sheet modals, 2-column bed grid view, zero-accordion formula chips, 1-tap task execution, multi-bed batch logging.

### 🔮 Tier 3: Operational Intelligence & Advanced Polish (Upcoming)
1. **Optimal Spray Window Advisory:** Weather-driven foliar spray window evaluator using Open-Meteo hourly temp, wind, and rain risk.
2. **Crop Growth Stage Progress Bars:** Visual benchmarks on bed cards (e.g. *"Day 22 / Est. 65d · 34% (Vegetative)"*).
3. **Visual Offline Sync Queue Counter:** Header badge showing exact count of unsynced writes in offline queue (`⏳ 3 Pending Sync`).

---

## 📜 License
Internal commercial farm management system — Kabun Farm, Kudat, Sabah.
