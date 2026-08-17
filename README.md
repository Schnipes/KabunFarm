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

### 6. Operational Intelligence & Biological Growth (Tier 3)
- **Biological Crop Growth Stage Tracker:** Visual progression bars on all active bed cards tracking biological stages (`🌱 Sprout` $\to$ `🌿 Vegetative` $\to$ `🌸 Flowering/Fruiting` $\to$ `🧺 Harvest Ready`) with countdown days to harvest based on regional tropical maturity benchmarks.
- **"Today's Farm Pulse" Live Momentum:** Real-time operational scorecard at the top of Home showing hydrated beds ratio (`18/22 Beds Watered`), daily harvest weight (`38.5 kg`), and tasks cleared (`5/5 Done`) with a whole-farm completion progress bar.
- **1-Tap Quick-Water on Grid Tiles:** Direct `💧` hydration button on bed tiles with water ripple wave animation for sub-second logging without opening modals.
- **Optimal Foliar Spray Advisory:** Agronomic weather analysis evaluating temperature and rain risk to recommend the safest spray window.
- **Tactile Action "Juice":** GPU-accelerated micro-animations on logging (Water Ripple, Sprout Pop, Yield Bounce, Shield Shimmer).

### 7. Weather Forecast & Coordinates
- **Exact Coordinates:** Configured for farm coordinates `6°49'42.5"N, 116°45'56.8"E` (`6.828472, 116.765778`) in Kudat, Sabah (Timezone: `Asia/Kuching` / GMT+8).
- **Open-Meteo Integration:** 4-day forecast for temperature, precipitation probability, and weather codes without requiring an API key.

---

## 🛠️ Architecture & Stack

```
KabunFarm/
├── index.html          # Main HTML structure with bottom sheet modals & momentum pulse
├── style.css           # Vanilla CSS (design system, tokens, GPU animations)
├── sw.js               # Cache-first Service Worker for offline PWA
├── test.html           # Zero-dependency browser regression test suite
└── js/
    ├── state.js        # State store, date utilities, constants, color maps
    ├── calculations.js # Pure agricultural math (watering engine, growth stages, dilution, P&L)
    ├── db.js           # Firestore SDK persistence, offline queues, CRUD operations
    ├── views.js        # DOM template renderers (cards, grid, chips, momentum)
    └── app.js          # Main app controller, modal flows, window bridge
```

- **Runtime:** Pure Vanilla JS (Native ES Modules) + Vanilla CSS — **Zero build step, zero bundling dependencies**.
- **Database:** Firebase Cloud Firestore with bundled local compat SDK (`scripts/firebase-*-compat.js`) for reliable offline initialization.
- **Offline Reliability:** Service Worker cache-first shell + IndexedDB/Firestore local cache.
- **Security:** Farm-level PIN access control.

---

## 🧪 Testing & Verification

Open `test.html` directly in any web browser — no local server or npm install required.

The regression suite contains **90 pure-function assertions** covering:
- Date recovery from UTC ISO timestamps across month boundaries
- 3-Way watering logic (whole-farm vs plot vs bed priority and multi-day gaps)
- Fallow bed watering exclusion
- Multi-ingredient recipe parsing and extreme sprayer tank scaling (up to 1000L IBC)
- Crop P&L cost sharing, decimal rounding, and negative margin calculations
- Sequential bed gap-finding (`findNextAvailableBedNumber`), custom bed IDs, and bed restoration
- Biological crop growth stage classification (`calculateCropProgress`)
- Daily farm momentum rollups (`calculateDailyMomentum`)
- Weather-driven spray window advisory (`evaluateSprayWindow`)

---

## 🧭 Improvement Roadmap

### ✅ Tier 1: Readability, Touch Targets & Modularity (Done)
- High-contrast sunlight palette, 1-tap date preset pills, $\ge 48\text{px}$ touch targets, modular ES architecture.

### ✅ Tier 2: Mobile Ergonomics & Field Speed (Done)
- Numeric keypad optimization (`inputmode="decimal"`), sprayer tank steppers, bottom sheet modals, 2-column bed grid view, zero-accordion formula chips, 1-tap task execution, multi-bed batch logging.

### ✅ Tier 3: Operational Intelligence & Interactive Gamification (Done)
- Biological crop growth progression bars, "Today's Farm Pulse" momentum scorecard, 1-tap grid quick-water, optimal foliar spray advisory, tactile action juice animations, and 90 automated unit tests.

---

## 📜 License
Internal commercial farm management system — Kabun Farm, Kudat, Sabah.
