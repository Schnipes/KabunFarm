// --- 1. Configuration ---
const STORAGE_KEY        = "offline_farm_logs";   // kept for legacy cache-clear on migration
const BEDS_CACHE_KEY     = "farmlog_beds_cache";
const FORMULAS_CACHE_KEY = "farmlog_formulas_cache";
const LOGS_CACHE_KEY     = "farmlog_logs_cache";
const SALES_CACHE_KEY    = "farmlog_sales_cache";
const LAST_BED_KEY       = "farmlog_last_bed";
const BED_MAX_KEY        = "farmlog_bed_max";
const AUTH_TOKEN_KEY     = "farmlog_auth_token";
const CATEGORY_COLOR_KEY = "farmlog_category_colors";
const WEATHER_CACHE_KEY  = "farmlog_weather_cache";
const TASKS_CACHE_KEY    = "farmlog_tasks_cache";
const PLOTS_CACHE_KEY    = "farmlog_plots_cache";

// ---------------------------------------------------------------------------
// Firebase setup (Compat SDK v10 — loaded via <script> tags in index.html)
// Replace the firebaseConfig object below with your own from:
//   Firebase Console → Project Settings → Your apps → Web app → SDK setup
// ---------------------------------------------------------------------------
const firebaseConfig = {
    apiKey: "AIzaSyBCCbJqzgC8E1JwAZBW31-0hVjYPJe9-Fc",
    authDomain: "kabunfarm.firebaseapp.com",
    projectId: "kabunfarm",
    storageBucket: "kabunfarm.firebasestorage.app",
    messagingSenderId: "9924250387",
    appId: "1:9924250387:web:81e137d46973a9d489e8e6"
};

let db = null;
function getDb() {
    if (db) return db;
    if (typeof firebase !== "undefined") {
        try {
            if (!firebase.apps || !firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            db = firebase.firestore();
            db.enablePersistence({ synchronizeTabs: true }).catch(err => {
                console.warn('Firestore persistence note:', err.code);
            });
            return db;
        } catch (e) {
            console.error("Firebase initialization failed:", e);
            return null;
        }
    } else {
        console.error("Firebase SDK not loaded on window.");
        return null;
    }
}
getDb();


// Kudat, Sabah — hardcoded since this is a single-farm app.
const FARM_LAT = 6.887;
const FARM_LON = 116.825;
const WEATHER_URL = `https://api.open-meteo.com/v1/forecast?latitude=${FARM_LAT}&longitude=${FARM_LON}&timezone=auto&current=temperature_2m,weather_code&daily=precipitation_probability_max,weather_code&forecast_days=4`;

// WMO weather codes -> emoji. Collapses the full table into the handful of
// conditions that actually matter for a farm (clear/cloud/rain/storm).
function weatherIcon(code) {
    if (code === 0) return "☀️";
    if (code >= 1 && code <= 3) return "⛅";
    if (code === 45 || code === 48) return "🌫️";
    if ((code >= 51 && code <= 65) || (code >= 80 && code <= 82)) return "🌧️";
    if (code >= 95) return "⛈️";
    return "⛅";
}

// Preset palette for formula-category tags. Kept small and fixed (not a full
// color picker) so choices stay visually consistent across the app.
const CATEGORY_COLOR_PALETTE = [
    "#0072b3", // blue
    "#b3261e", // red
    "#a3690b", // amber
    "#7b4fb5", // purple
    "#0f8a8a", // teal
    "#c2185b", // pink
    "#4b3f9e", // indigo
    "#55606e"  // slate
];

const MODAL_TITLES = {
    water:   "Irrigation / Fertigation",
    pest:    "Pest Control",
    harvest: "Harvest",
    crop:    "Sow Crop"
};

const DEFAULT_CATEGORY = {
    water:   "watering",
    pest:    "pest_control",
    harvest: "harvest",
    crop:    "sowing"
};

const CATEGORY_ICON  = { watering: "💧", pest_control: "🐛", harvest: "🧺", sowing: "🌱", sale: "💰" };
const CATEGORY_LABEL = { watering: "Watering", pest_control: "Pest Control", harvest: "Harvest", sowing: "Sowing", sale: "Sale" };
const TIME_SLOT_ORDER = { Morning: 0, Afternoon: 1, Evening: 2, Anytime: 3 };
// Short forms shown on the compact Today's Tasks row — same vocabulary as the
// Add Task modal's pill picker, just abbreviated for a one-line list.
const TIME_SLOT_SHORT = { Morning: "Morn", Afternoon: "Aft", Evening: "Eve", Anytime: "Any" };

let bedsData          = [];
let formulasData      = [];
let tasksData         = [];
let plotsData         = [];
let selectedTaskFormulaId = null;
// Highest bed number ever used (retired beds included). Persisted so numbers
// are never reused, even across reloads while offline.
let maxBedNumber      = parseInt(localStorage.getItem(BED_MAX_KEY), 10) || 0;
let selectedBedForLog = null;
let addBedPending     = false;
let activeLogFilter   = "all";
let activeTypeFilter  = "all";
let finPeriod         = "week";

// --- 2. Utilities ---
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Union of every crop name the app has seen (active crops, crop history, sales).
// Used to power name suggestions and to snap typed names onto an existing one.
function getKnownCropNames() {
    const names = new Set();
    bedsData.forEach(b => {
        b.crops.forEach(c => c.cropName && names.add(c.cropName));
        (b.cropHistory || []).forEach(c => c.cropName && names.add(c.cropName));
    });
    const sales = JSON.parse(localStorage.getItem(SALES_CACHE_KEY) || "[]");
    sales.forEach(s => s.crop && names.add(s.crop));
    return [...names].sort();
}

// Trim + case-insensitively snap onto an existing crop name so "kangkong" and
// "Kangkong" end up as the same crop instead of silently forking in half.
function normalizeCropName(typed) {
    const trimmed = String(typed || "").trim();
    if (!trimmed) return trimmed;
    const match = getKnownCropNames().find(n => n.toLowerCase() === trimmed.toLowerCase());
    return match || trimmed;
}

// Refresh the crop-name suggestion lists (sowing form + sale form) from
// whatever crop names are currently known.
function refreshCropDatalists() {
    const names = getKnownCropNames();
    const optionsHtml = names.map(n => `<option value="${escapeHtml(n)}">`).join("");
    const cropList = document.getElementById("cropNameList");
    if (cropList) cropList.innerHTML = optionsHtml;
    const saleList = document.getElementById("activeCropsList");
    if (saleList) saleList.innerHTML = optionsHtml;
}

// --- Formula category colors ---
// Color is assigned per category NAME (trim + case-insensitive), not per
// formula, so every formula sharing a category shows the same tag color
// automatically. Stored client-side — per-device, not synced via Sheets.
function normalizeCategoryKey(name) {
    return String(name || "").trim().toLowerCase();
}

// Default color palette mappings for standard agricultural formula categories
const DEFAULT_CATEGORY_COLORS = {
    biological:  "#0f8a8a", // teal
    botanical:   "#a3690b", // amber
    nutrition:   "#1a8f3c", // green
    fungicide:   "#7b4fb5", // purple
    insecticide: "#b3261e"  // red
};

function getCategoryColorMap() {
    try { return JSON.parse(localStorage.getItem(CATEGORY_COLOR_KEY) || "{}"); }
    catch (e) { return {}; }
}

function getCategoryColor(categoryName) {
    const key = normalizeCategoryKey(categoryName);
    if (!key) return null;
    return getCategoryColorMap()[key] || DEFAULT_CATEGORY_COLORS[key] || null;
}

function setCategoryColor(categoryName, hex) {
    const key = normalizeCategoryKey(categoryName);
    if (!key) return;
    const map = getCategoryColorMap();
    if (hex) map[key] = hex; else delete map[key];
    localStorage.setItem(CATEGORY_COLOR_KEY, JSON.stringify(map));
}

// Builds a tinted pill style from a base color: light background, solid text,
// medium border — same visual language as the app's existing plain .tag.
function tintStyle(hex) {
    return `background:${hex}22;color:${hex};border-color:${hex}66`;
}

function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
}

// --- 3. Modal Controls ---
function localDateStr(d) {
    return d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");
}

// Normalize a date coming from anywhere — a plain "YYYY-MM-DD" string, or a
// Date-typed Sheets cell that serializes as full ISO like
// "2026-07-08T16:00:00.000Z" — into a consistent local "YYYY-MM-DD". Without
// this, appending "T00:00:00" to an already-ISO string produces an invalid
// Date (NaN day counts, broken watering alerts) whenever a Sheets column's
// cell format is Date instead of plain text.
function ymd(dateStr) {
    if (!dateStr) return "";
    const s = String(dateStr);
    if (s.length <= 10) return s;              // already "YYYY-MM-DD"
    const d = new Date(s);                     // full ISO from a Date-typed cell
    return isNaN(d) ? s.slice(0, 10) : localDateStr(d);
}

// ---------------------------------------------------------------------------
// Auth — PIN verified once against Firestore config/auth, then cached locally.
// Same UX as before: single prompt, no login screen.
// ---------------------------------------------------------------------------
async function checkPin() {
    let cached = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!cached) {
        cached = window.prompt("Enter farm PIN:") || "";
        if (cached) localStorage.setItem(AUTH_TOKEN_KEY, cached);
    }
    if (!cached) return false;

    try {
        const docRef = db.collection("config").doc("auth");
        const snap = await docRef.get();
        if (!snap.exists) {
            // First run: save this PIN as the farm PIN in Firestore
            await docRef.set({ pin: cached });
            return true;
        }
        if (snap.data().pin === cached) {
            return true;
        }
        alert("Incorrect PIN. Please clear cache and try again.");
        localStorage.removeItem(AUTH_TOKEN_KEY);
        return false;
    } catch (e) {
        console.warn("PIN verification note:", e);
        return true;
    }
}

function todayString() {
    return localDateStr(new Date());
}

function openModal(type) {
    document.getElementById("modalTitle").textContent = MODAL_TITLES[type] || "Log activity";
    document.getElementById("logDate").value = todayString();
    document.getElementById("activityCategory").value = DEFAULT_CATEGORY[type] || "";

    // Restore last-used bed/plot if it still exists
    const lastBed = localStorage.getItem(LAST_BED_KEY);
    const scopeEl = document.getElementById("bedScope");
    const stillValid = lastBed && (
        lastBed === "all" ||
        bedsData.some(b => String(b.bedNumber) === String(lastBed)) ||
        (lastBed.startsWith("plot_") && !!getPlot(lastBed))
    );
    scopeEl.value = stillValid ? lastBed : "all";

    updateBedFields();
    if (document.getElementById("logTankCount")) {
        document.getElementById("logTankCount").value = 1;
    }
    selectedQuickFormulaId = null;
    updateSprayerTotalDisplay();
    renderQuickFormulaChips();
    updateQuickFormulaDosePreview();
    document.getElementById("modalOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
}

function closeModal() {
    document.getElementById("modalOverlay").classList.remove("open");
    document.body.style.overflow = "";
    document.getElementById("logForm").reset();
    selectedQuickFormulaId = null;
    document.getElementById("currentCropsField").hidden  = true;
    document.getElementById("harvestCropsField").hidden  = true;
    document.getElementById("harvestWeightField").hidden = true;
    document.getElementById("newCropField").hidden       = true;
    document.getElementById("bedContextBar").hidden      = true;
    document.getElementById("quickFormulaSection").hidden = true;
    document.getElementById("quickFormulaDoseCard").hidden = true;
    document.getElementById("inputsField").hidden        = true;
    document.getElementById("financialsField").hidden    = true;
    document.getElementById("toggleInputsBtn").textContent     = "＋ Extra notes";
    document.getElementById("toggleFinancialsBtn").textContent = "＋ Add cost";
    document.getElementById("logDate").classList.remove("invalid");
    document.getElementById("activityCategory").classList.remove("invalid");
    document.getElementById("newCropName").classList.remove("invalid");
}

document.getElementById("modalOverlay").addEventListener("click", function (e) {
    if (e.target === this) closeModal();
});

// --- 4. Collapsible form extras ---
function toggleInputs() {
    const field = document.getElementById("inputsField");
    const btn   = document.getElementById("toggleInputsBtn");
    field.hidden = !field.hidden;
    btn.textContent = field.hidden ? "＋ Add inputs / notes" : "− Remove inputs / notes";
}

function toggleFinancials() {
    const field = document.getElementById("financialsField");
    const btn   = document.getElementById("toggleFinancialsBtn");
    field.hidden = !field.hidden;
    btn.textContent = field.hidden ? "＋ Add cost" : "− Remove cost";
}

// --- 5. Form — Bed & Crop Fields ---
function populateBedDropdown() {
    const plotGroup = document.getElementById("plotScopeGroup");
    const bedGroup  = document.getElementById("bedScopeGroup");
    plotGroup.innerHTML = "";
    bedGroup.innerHTML  = "";
    plotsData.forEach(plot => {
        // plot.id already reads "plot_<timestamp>" (ID-generation convention,
        // not a wrapper prefix) — used directly, not re-prefixed, to match
        // latestPlotWatering()/getBeds()'s plot-watering blend.
        const opt = document.createElement("option");
        opt.value = plot.id;
        opt.textContent = plot.name;
        plotGroup.appendChild(opt);
    });
    bedsData.forEach(bed => {
        const opt = document.createElement("option");
        opt.value = bed.bedNumber;
        opt.textContent = "Bed " + bed.bedNumber;
        bedGroup.appendChild(opt);
    });
}

function updateBedFields() {
    const scope      = document.getElementById("bedScope").value;
    const activity   = document.getElementById("activityCategory").value;
    const isSowing   = activity === "sowing";
    const isHarvest  = activity === "harvest";
    const isPlot     = scope.startsWith("plot_");
    const isSpecific = scope !== "all" && !isPlot; // true only for a single real bed

    // Sowing needs exactly one bed (a sown crop batch belongs to one bed) —
    // whole-farm and plot scope both get forced to the first real bed.
    if (isSowing && (scope === "all" || isPlot) && bedsData.length) {
        document.getElementById("bedScope").value = bedsData[0].bedNumber;
        showToast("Sowing requires a specific bed — switched to Bed " + bedsData[0].bedNumber);
        updateBedFields();
        return;
    }

    document.getElementById("currentCropsField").hidden  = true;
    document.getElementById("harvestCropsField").hidden  = true;
    document.getElementById("harvestWeightField").hidden = true;
    document.getElementById("newCropField").hidden       = true;
    document.getElementById("newCropName").required      = false;

    // Sprayer volume and quick formula chips only matter for spray-based activities
    const sprayVolRow = document.getElementById("logSprayerVolRow");
    const quickFormSec = document.getElementById("quickFormulaSection");
    const isSpray = (activity === "pest_control" || activity === "watering");
    if (sprayVolRow) sprayVolRow.hidden = !isSpray;
    if (quickFormSec) {
        quickFormSec.hidden = !isSpray;
        if (isSpray) renderQuickFormulaChips();
    }
    if (!sprayVolRow?.hidden) {
        document.getElementById("logSprayerVol").value = document.getElementById("globalSprayerVol").value;
        updateSprayerTotalDisplay();
        updateQuickFormulaDosePreview();
    }

    // Update bed context bar
    const contextBar = document.getElementById("bedContextBar");
    if (isSpecific) {
        const bed = getBed(scope);
        if (bed && bed.crops.length) {
            contextBar.innerHTML = bed.crops.map(c =>
                `<span>🌱 ${escapeHtml(c.cropName)} · Day ${daysSince(c.plantingDate)}</span>`
            ).join("");
        } else {
            contextBar.innerHTML = '<span style="color:#888;">Empty bed — ready to sow</span>';
        }
        contextBar.hidden = false;
    } else if (isPlot) {
        // Aggregate context — union of crop names across every bed in the plot.
        const members = bedsInPlot(scope);
        const names = [...new Set(members.flatMap(b => b.crops.map(c => c.cropName)))];
        contextBar.innerHTML = names.length
            ? names.map(n => `<span>🌱 ${escapeHtml(n)}</span>`).join("")
            : '<span style="color:#888;">No crops growing in this plot</span>';
        contextBar.hidden = false;
    } else {
        contextBar.hidden = true;
    }

    if (isPlot && !isHarvest) return; // sowing already redirected above; nothing else to fill in for a plot
    if (!isSpecific && !isPlot) return;

    const bed = isSpecific ? getBed(scope) : null;

    if (isSowing) {
        document.getElementById("newCropField").hidden  = false;
        document.getElementById("newCropName").required = true;

    } else if (isHarvest) {
        const list = document.getElementById("harvestCropsList");
        // Each checkbox carries data-bed so handleSubmit knows which specific
        // bed a checked crop belongs to — batches stay inherently per-bed even
        // when the log itself is plot-scoped.
        const harvestBeds = isPlot ? bedsInPlot(scope) : (bed ? [bed] : []);
        const rows = harvestBeds.flatMap((b, bi) =>
            b.crops.map((c, i) => `
            <label class="harvest-crop-check">
                <input type="checkbox" name="harvestCrop" value="${escapeHtml(String(c.id || ""))}" data-crop="${escapeHtml(c.cropName)}" data-bed="${escapeHtml(String(b.bedNumber))}" id="hcrop_${bi}_${i}">
                <span>${escapeHtml(c.cropName)}${isPlot ? ` <span style="color:#888;">· Bed ${escapeHtml(String(b.bedNumber))}</span>` : ""}</span>
            </label>`)
        );
        if (rows.length) {
            list.innerHTML = rows.join("");
            document.getElementById("harvestCropsField").hidden = false;
        }
        document.getElementById("harvestWeightField").hidden = false;

    } else {
        const tags = document.getElementById("currentCropsTags");
        tags.innerHTML = (bed && bed.crops.length)
            ? bed.crops.map(c => `<span class="tag">${escapeHtml(c.cropName)}</span>`).join("")
            : '<span style="color:#888;font-size:13px;">Empty bed</span>';
        document.getElementById("currentCropsField").hidden = false;
    }
}

// --- 6. Offline Storage ---
function saveBeds() {
    localStorage.setItem(BEDS_CACHE_KEY, JSON.stringify(bedsData));
}

// Single front door for "find this bed" — was 10 separate copies of
// `bedsData.find(b => String(b.bedNumber) === String(x))` scattered through
// the file. One place to fix if the lookup rule ever needs to change.
function getBed(bedNumber) {
    return bedsData.find(b => String(b.bedNumber) === String(bedNumber));
}

function getPlot(plotId) {
    return plotsData.find(p => String(p.id) === String(plotId));
}

// Every bed currently belonging to this plot (exclusive membership — a bed
// is in at most one plot, so this is a plain filter, no join needed).
function bedsInPlot(plotId) {
    return bedsData.filter(b => String(b.plotId || "") === String(plotId));
}

// Firestore handles the offline queue automatically via IndexedDB persistence.
// These helpers are intentionally minimal — no manual queue needed.
function updateSyncBadge() {
    const badge = document.querySelector(".status-badge");
    badge.classList.remove("status-badge-pending");
    if (navigator.onLine) {
        badge.innerHTML = `<span class="status-dot" style="background:var(--color-primary)" aria-hidden="true"></span><span>Online &amp; Synced</span>`;
        badge.style.borderColor = "var(--color-border)";
        badge.style.color = "var(--color-text)";
    } else {
        badge.innerHTML = `<span class="status-dot" style="background:#b3261e" aria-hidden="true"></span><span>Offline</span>`;
        badge.style.borderColor = "#b3261e";
        badge.style.color = "#b3261e";
    }
}

async function handleSyncBadgeClick() {
    if (!navigator.onLine) {
        showToast("Offline — changes will sync when connected");
        return;
    }
    if (!db) {
        showToast("❌ Firebase database is not initialized");
        return;
    }
    showToast("Testing Firebase Cloud connection...");
    try {
        // 1. Probe read config/auth
        const authSnap = await db.collection("config").doc("auth").get();
        // 2. Probe write & delete
        const testRef = db.collection("config").doc("_conn_probe");
        await testRef.set({ probe: true, timestamp: Date.now() });
        await testRef.delete();
        
        // Also trigger seeding if formulas collection was empty
        await seedDefaultFormulas();
        
        showToast("✅ Firebase Connected: Cloud Sync Active!");
    } catch (e) {
        console.error("Firebase connection probe failed:", e);
        alert("Firebase Cloud Connection Test\n\n❌ Status: Write Failed\nError Code: " + (e.code || "unknown") + "\nMessage: " + (e.message || e) + "\n\nTip: Check if your Firestore Rules allow writes in Firebase Console.");
    }
}


function handleSubmit(event) {
    event.preventDefault();

    const date     = document.getElementById("logDate").value;
    const activity = document.getElementById("activityCategory").value;

    const dateEl     = document.getElementById("logDate");
    const activityEl = document.getElementById("activityCategory");
    dateEl.classList.toggle("invalid", !date);
    activityEl.classList.toggle("invalid", !activity);
    if (!date || !activity) {
        showToast("Please fill in the required fields.");
        return;
    }

    const bedScope = document.getElementById("bedScope").value;
    const cropName = normalizeCropName(document.getElementById("newCropName").value.trim());

    // Sowing must name a crop — otherwise we'd log a useless entry with no batch.
    if (activity === "sowing" && !cropName) {
        document.getElementById("newCropName").classList.add("invalid");
        showToast("Please enter the crop being sown.");
        return;
    }

    // Harvest logs should only record the crop(s) actually checked off, not
    // every crop still growing in the bed — needed for accurate per-crop P&L.
    const harvestedCropNames = activity === "harvest"
        ? [...document.querySelectorAll('input[name="harvestCrop"]:checked')].map(cb => cb.dataset.crop)
        : [];

    const entry = {
        id:               "log_" + Date.now(),
        date,
        bedNumber:        bedScope,
        activityCategory: activity,
        cropName:         activity === "sowing"  ? cropName :
                           activity === "harvest" ? harvestedCropNames.join(", ") : (() => {
            if (bedScope === "all") return "";
            if (bedScope.startsWith("plot_")) {
                const names = new Set();
                bedsInPlot(bedScope).forEach(b => b.crops.forEach(c => names.add(c.cropName)));
                return [...names].join(", ");
            }
            const bed = getBed(bedScope);
            return bed && bed.crops.length ? bed.crops.map(c => c.cropName).join(", ") : "";
        })(),
        inputsUsed:       document.getElementById("inputsUsed").value,
        costRM:           document.getElementById("costRM").value,
        revenueRM:        "",
        weight:           activity === "harvest" ? document.getElementById("harvestWeight").value : "",
        status:           "active"
    };

    // Write log to Firestore (SDK buffers offline and syncs automatically).
    db.collection("logs").doc(entry.id).set(entry).catch(e => console.error("addLog failed:", e));

    if (activity === "sowing" && bedScope !== "all" && cropName) {
        const batchId = "batch_" + Date.now();
        const batch = {
            id:          batchId,
            bedNumber:   bedScope,
            cropName,
            location:    "commercial",
            plantingDate: date,
            status:      "active"
        };
        db.collection("batches").doc(batchId).set(batch).catch(e => console.error("addBatch failed:", e));
        // Optimistic update — add crop to bed immediately.
        const bed = getBed(bedScope);
        if (bed) bed.crops.push({ id: batchId, cropName, plantingDate: date });
        saveBeds();
        renderBeds(bedsData);
        populateBedDropdown();
    }

    if (activity === "harvest") {
        // Each checkbox carries data-bed, keeping batches per-bed even for plot-scoped logs.
        const checked = [...document.querySelectorAll('input[name="harvestCrop"]:checked')];
        checked.forEach(cb => {
            const batchId = cb.value;
            const cropNm  = cb.dataset.crop;
            const bedNum  = cb.dataset.bed;
            db.collection("batches").doc(batchId).update({
                status: "done",
                harvestDate: date
            }).catch(e => console.error("updateBatch failed:", e));
            const bed = getBed(bedNum);
            if (bed) {
                bed.crops = batchId
                    ? bed.crops.filter(c => String(c.id) !== String(batchId))
                    : bed.crops.filter(c => c.cropName !== cropNm);
            }
        });
        saveBeds();
        renderBeds(bedsData);
    }

    localStorage.setItem(LAST_BED_KEY, bedScope);

    // Optimistic: insert into logs cache so Activity tab reflects it immediately.
    const cachedLogs = JSON.parse(localStorage.getItem(LOGS_CACHE_KEY) || "[]");
    cachedLogs.unshift(entry);
    localStorage.setItem(LOGS_CACHE_KEY, JSON.stringify(cachedLogs));

    // Auto-complete a matching pre-planned task.
    const taskBedKey = bedScope === "all" ? "" : bedScope;
    const matchingTask = tasksData.find(t =>
        String(t.bedNumber || "") === String(taskBedKey) &&
        t.date === date &&
        t.activityCategory === activity &&
        t.status !== "done"
    );
    if (matchingTask) toggleTaskDone(matchingTask.id);

    // Optimistically update lastActivity/lastWatered on bed cards.
    if (bedScope.startsWith("plot_")) {
        const members = bedsInPlot(bedScope);
        members.forEach(b => {
            b.lastActivity = { type: activity, date };
            const bedUpdate = { lastActivity: { type: activity, date } };
            if (activity === "watering") {
                b.lastWatered = date;
                bedUpdate.lastWatered = date;
            }
            db.collection("beds").doc(String(b.bedNumber)).update(bedUpdate)
                .catch(e => console.error("updateBed plot member failed:", e));
        });
        saveBeds();
        renderBeds(bedsData);
    } else if (bedScope !== "all") {
        const bed = getBed(bedScope);
        if (bed) {
            bed.lastActivity = { type: activity, date };
            if (activity === "watering") bed.lastWatered = date;
            saveBeds();
            renderBeds(bedsData);
            const bedUpdate = { lastActivity: { type: activity, date } };
            if (activity === "watering") bedUpdate.lastWatered = date;
            db.collection("beds").doc(String(bedScope)).update(bedUpdate)
                .catch(e => console.error("updateBed activity failed:", e));
        }
    } else if (activity === "watering") {
        bedsData.forEach(b => { b.lastWatered = date; });
        saveBeds();
        renderBeds(bedsData);
    }

    closeModal();

    const bedLabel = bedScope === "all" ? "Whole Farm" :
                      bedScope.startsWith("plot_") ? (getPlot(bedScope)?.name || "Plot") :
                      `Bed ${bedScope}`;
    const actLabel = CATEGORY_LABEL[activity] || activity;
    showToast(`${actLabel} logged · ${bedLabel}`);
}


// --- 7. Cloud Sync (Firebase) ---
// Firebase Firestore SDK handles offline persistence automatically.
// No manual queue needed — writes buffer in IndexedDB and sync when online.

// --- 8. View Switching ---
function switchView(viewName) {
    document.querySelectorAll(".view").forEach(v => v.hidden = true);
    const target = document.getElementById("view-" + viewName);
    if (target) target.hidden = false;
    document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
    const activeBtn = document.querySelector(`[data-view="${viewName}"]`);
    if (activeBtn) activeBtn.classList.add("active");
    const formulasBtn = document.querySelector(".formulas-btn");
    if (formulasBtn) formulasBtn.classList.toggle("active", viewName === "formulas");
    if (viewName === "data") {
        renderBedFilterChips(); renderTypeFilterChips(); renderFinancialSummary(); renderCropPL();
        fetchLogs();
    }
    if (viewName === "formulas") fetchFormulas();
    if (viewName === "plan") {
        renderPlanView();
        fetchTasks();
    }
}

// --- 9. Beds (Home Screen) ---
function lastActivityLabel(lastActivity) {
    if (!lastActivity || !lastActivity.date) return null;
    const label = CATEGORY_LABEL[lastActivity.type] || lastActivity.type;
    const days  = daysSince(lastActivity.date);
    if (days === 0) return `Last: ${label} today`;
    if (days === 1) return `Last: ${label} yesterday`;
    return `Last: ${label} ${days}d ago`;
}

// Most recent whole-farm ("all"-scoped) watering log. The server's per-bed
// lastWatered only counts logs tied to that bed's number, so a whole-farm
// irrigation would otherwise never reset any bed's watering alert.
function latestWholeFarmWatering() {
    const logs = JSON.parse(localStorage.getItem(LOGS_CACHE_KEY) || "[]");
    let latest = "";
    logs.forEach(l => {
        if (l.activityCategory === "watering" && String(l.bedNumber) === "all" && l.status !== "deleted") {
            const d = ymd(l.date);
            if (d > latest) latest = d;
        }
    });
    return latest || null;
}

// Same idea as latestWholeFarmWatering(), keyed by plot instead of global —
// a plot-scoped watering log resets every member bed's alert the same way a
// whole-farm log resets every bed's. A plot-scoped log's bedNumber is simply
// the plot's own id (plot ids already read as "plot_<timestamp>" — that's ID
// generation convention, not a separate wrapper prefix, so no re-prefixing
// here). Kept as its own pure function (not inlined) so it stays
// independently testable.
function latestPlotWatering(plotId) {
    if (!plotId) return null;
    const logs = JSON.parse(localStorage.getItem(LOGS_CACHE_KEY) || "[]");
    let latest = "";
    logs.forEach(l => {
        if (l.activityCategory === "watering" && String(l.bedNumber) === String(plotId) && l.status !== "deleted") {
            const d = ymd(l.date);
            if (d > latest) latest = d;
        }
    });
    return latest || null;
}

// Pure decision, no HTML — returns a plain data value so anything (a bed
// card, a plot rollup like "6 of 24 beds") can reuse the same rule without
// re-deriving it or parsing a rendered string.
function getWateringStatus(bed) {
    if (!bed.crops.length) return { needsWater: false, days: null };
    // Tracks watering specifically (server-computed lastWatered), not just
    // "days since the most recent activity of any kind" — otherwise logging
    // e.g. pest control the day after watering would wrongly reset this.
    // Blend in whole-farm and plot-wide watering logs, which the server-side
    // per-bed lastWatered can't see on its own — whichever date is newest wins.
    let lastWatered = bed.lastWatered ? ymd(bed.lastWatered) : null;
    const farmWide = latestWholeFarmWatering();
    if (farmWide && (!lastWatered || farmWide > lastWatered)) lastWatered = farmWide;

    const plotWide = bed.plotId ? latestPlotWatering(bed.plotId) : null;
    if (plotWide && (!lastWatered || plotWide > lastWatered)) lastWatered = plotWide;

    const days = lastWatered ? daysSince(lastWatered) : null;
    const needsWater = !lastWatered || days >= 3;
    return { needsWater, days };
}

// Thin rendering wrapper over getWateringStatus() — same markup/behavior as
// before the split, just no longer where the actual decision lives.
function wateringAlert(bed) {
    const status = getWateringStatus(bed);
    if (!status.needsWater) return "";
    const msg = status.days === null ? "Not watered recently" : `Not watered in ${status.days}d`;
    return `<p class="bed-water-alert">💧 ${msg}</p>`;
}

function daysSince(dateStr) {
    const planted = new Date(ymd(dateStr) + "T00:00:00");
    const today   = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today - planted) / 86400000);
}

// Extracted from renderBeds() unchanged, so both the solo-bed list and the
// (unaffected) empty-beds list keep identical markup with zero duplication.
function renderGrowingBedCard(bed) {
    const lastLine = lastActivityLabel(bed.lastActivity);
    return `
    <div class="batch-card bed-card-clickable" onclick="openBedDetail(${bed.bedNumber})">
        <div class="bed-card-header">
            <p class="batch-title">Bed ${bed.bedNumber}${bed.name ? ` <span class="bed-custom-name">· ${escapeHtml(bed.name)}</span>` : ""}</p>
            <span class="bed-chevron">›</span>
        </div>
        <div class="bed-crops">
            ${bed.crops.map(c => `
            <div class="bed-crop-row">
                <span>🌱 ${escapeHtml(c.cropName)}</span>
                <span class="bed-day-badge">Day ${daysSince(c.plantingDate)}</span>
            </div>`).join("")}
        </div>
        ${lastLine ? `<p class="bed-last-activity">${escapeHtml(lastLine)}</p>` : ""}
        ${wateringAlert(bed)}
    </div>`;
}

function renderEmptyBedCard(bed) {
    const lastLine = lastActivityLabel(bed.lastActivity);
    return `
    <div class="batch-card bed-card-empty bed-card-clickable" onclick="openBedDetail(${bed.bedNumber})">
        <div class="bed-card-header">
            <p class="batch-title" style="color:#888;">Bed ${bed.bedNumber}${bed.name ? ` <span class="bed-custom-name">· ${escapeHtml(bed.name)}</span>` : ""}</p>
            <span class="bed-chevron">›</span>
        </div>
        <p class="bed-empty-label">Ready to sow</p>
        ${lastLine ? `<p class="bed-last-activity">${escapeHtml(lastLine)}</p>` : ""}
    </div>`;
}

// Partitions a bed list into plot groups and solo (unplotted, or plotted but
// the plot no longer resolves — e.g. deleted — falls back to solo rather
// than silently vanishing).
function groupByPlot(bedList) {
    const grouped = {};
    const solo = [];
    bedList.forEach(b => {
        if (b.plotId && getPlot(b.plotId)) {
            (grouped[b.plotId] = grouped[b.plotId] || []).push(b);
        } else {
            solo.push(b);
        }
    });
    return { grouped, solo };
}

// { total, flagged } — how many of a plot's beds currently need watering.
// Pure aside from reading bedsInPlot/getWateringStatus, kept separate so it's
// unit-testable without touching the DOM.
function plotWateringRollup(plotId) {
    const beds = bedsInPlot(plotId);
    const flagged = beds.filter(b => getWateringStatus(b).needsWater);
    return { total: beds.length, flagged: flagged.length };
}

function renderPlotCard(plotId, beds) {
    const plot = getPlot(plotId);
    const label = plot ? plot.name : "Plot";
    const cropNames = [...new Set(beds.flatMap(b => b.crops.map(c => c.cropName)))];
    const chips = cropNames.length
        ? cropNames.map(n => `<span class="tag">${escapeHtml(n)}</span>`).join("")
        : '<span style="color:#888;font-size:13px;">Empty</span>';

    const { total, flagged } = plotWateringRollup(plotId);
    const wateringLine = flagged
        ? `<p class="bed-water-alert">💧 ${flagged} of ${total} beds not watered</p>`
        : "";

    return `
    <div class="batch-card bed-card-clickable" onclick="openPlotDetail('${escapeHtml(String(plotId))}')">
        <div class="bed-card-header">
            <p class="batch-title">${escapeHtml(label)} <span class="bed-custom-name">· ${beds.length} bed${beds.length === 1 ? "" : "s"}</span></p>
            <span class="bed-chevron">›</span>
        </div>
        <div class="bed-crops">${chips}</div>
        ${wateringLine}
    </div>`;
}

let bedViewMode = localStorage.getItem("farmlog_view_mode") || "list";

function setBedViewMode(mode) {
    bedViewMode = mode;
    localStorage.setItem("farmlog_view_mode", mode);
    document.getElementById("btnViewList")?.classList.toggle("active", mode === "list");
    document.getElementById("btnViewGrid")?.classList.toggle("active", mode === "grid");
    const listEl = document.getElementById("batchList");
    const gridEl = document.getElementById("bedGridList");
    if (listEl) listEl.hidden = (mode === "grid");
    if (gridEl) gridEl.hidden = (mode !== "grid");
    renderBeds(bedsData);
}

function renderBedTile(bed) {
    const isGrowing = bed.crops && bed.crops.length > 0;
    const waterStatus = getWateringStatus(bed);
    const crop = isGrowing ? bed.crops[0] : null;
    const cropName = crop ? crop.cropName : "Empty";
    const dayCount = crop ? `D${daysSince(crop.plantingDate)}` : "Ready";
    const warnWater = waterStatus.needsWater;

    return `
    <div class="bed-tile${warnWater ? " needs-water" : ""}${!isGrowing ? " is-empty" : ""}" onclick="openBedDetail(${bed.bedNumber})">
        <span class="bed-tile-num">${bed.bedNumber}</span>
        <span class="bed-tile-crop">${escapeHtml(cropName)}</span>
        <div class="bed-tile-status">
            <span class="bed-tile-dot${warnWater ? " warn" : ""}"></span>
            <span>${dayCount}</span>
        </div>
    </div>`;
}

function renderBedGrid(beds) {
    const gridContainer = document.getElementById("bedGridList");
    if (!gridContainer) return;
    if (!beds.length) {
        gridContainer.innerHTML = '<p style="color:#888;font-size:13px;padding:8px 4px;">No beds created yet.</p>';
        return;
    }

    const { grouped, solo } = groupByPlot(beds);
    let html = "";

    // Plot groups
    Object.keys(grouped).forEach(plotId => {
        const plot = getPlot(plotId);
        const plotBeds = grouped[plotId];
        const { total, flagged } = plotWateringRollup(plotId);
        const waterBadge = flagged > 0 ? `<span style="color:#d97706;font-weight:700;">💧 ${flagged}/${total} unwatered</span>` : `<span>💧 All watered</span>`;

        html += `
        <div class="bed-grid-plot-group">
            <div class="bed-grid-plot-header" onclick="openPlotDetail('${escapeHtml(String(plotId))}')">
                <p class="bed-grid-plot-title">🗂️ ${escapeHtml(plot ? plot.name : "Plot")} (${plotBeds.length} beds)</p>
                <div class="bed-grid-plot-meta">${waterBadge} ›</div>
            </div>
            <div class="bed-grid-tiles">
                ${plotBeds.map(renderBedTile).join("")}
            </div>
        </div>`;
    });

    // Standalone beds
    if (solo.length) {
        html += `
        <div class="bed-grid-plot-group">
            <div class="bed-grid-plot-header">
                <p class="bed-grid-plot-title">Standalone Beds (${solo.length})</p>
            </div>
            <div class="bed-grid-tiles">
                ${solo.map(renderBedTile).join("")}
            </div>
        </div>`;
    }

    gridContainer.innerHTML = html;
}

function renderBeds(beds) {
    const listContainer = document.getElementById("batchList");
    const gridContainer = document.getElementById("bedGridList");

    if (listContainer) listContainer.hidden = (bedViewMode === "grid");
    if (gridContainer) gridContainer.hidden = (bedViewMode !== "grid");
    document.getElementById("btnViewList")?.classList.toggle("active", bedViewMode === "list");
    document.getElementById("btnViewGrid")?.classList.toggle("active", bedViewMode === "grid");

    if (!beds.length) {
        if (listContainer) {
            listContainer.innerHTML = `
            <div class="empty-beds-card" onclick="addBed()">
                <span class="empty-beds-icon">🌱</span>
                <p class="empty-beds-title">Add your first bed</p>
                <p class="empty-beds-hint">Tap to create Bed 1</p>
            </div>`;
        }
        if (gridContainer) gridContainer.innerHTML = '<p style="color:#888;font-size:13px;padding:8px 4px;">No beds created yet.</p>';
        return;
    }

    // 1. Render Grid
    renderBedGrid(beds);

    // 2. Render List
    if (!listContainer) return;
    const growing = beds.filter(b => b.crops.length > 0);
    const empty   = beds.filter(b => b.crops.length === 0);
    let html = "";

    if (growing.length) {
        html += `<p class="bed-group-label">Growing (${growing.length})</p>`;
        const { grouped, solo } = groupByPlot(growing);
        html += Object.keys(grouped).map(plotId => renderPlotCard(plotId, grouped[plotId])).join("");
        html += solo.map(renderGrowingBedCard).join("");
    }

    if (empty.length) {
        html += `<p class="bed-group-label" style="margin-top:16px;">Empty (${empty.length})</p>`;
        const { grouped, solo } = groupByPlot(empty);
        html += Object.keys(grouped).map(plotId => renderPlotCard(plotId, grouped[plotId])).join("");
        html += solo.map(renderEmptyBedCard).join("");
    }

    listContainer.innerHTML = html;
}

function openBedDetail(bedNum) {
    const bed = getBed(bedNum);
    if (!bed) return;

    selectedBedForLog = bedNum;
    const bedLabel = bed.name ? `Bed ${bedNum} · ${bed.name}` : `Bed ${bedNum}`;
    document.getElementById("bedDetailTitle").textContent = bedLabel;

    const content = document.getElementById("bedDetailContent");
    let html = "";

    if (!bed.crops.length) {
        html += '<p style="color:#888;padding:12px 0 8px;">Empty — ready to sow.</p>';
    } else {
        html += bed.crops.map(c => `
        <div class="bed-detail-crop">
            <div class="bed-detail-row">
                <span class="bed-detail-icon">🌱</span>
                <div class="bed-detail-info">
                    <p class="bed-detail-name">${escapeHtml(c.cropName)}</p>
                    <p class="bed-detail-meta">Planted ${escapeHtml(c.plantingDate)}</p>
                </div>
                <span class="bed-day-badge">Day ${daysSince(c.plantingDate)}</span>
            </div>
        </div>`).join("");
    }

    if (bed.cropHistory && bed.cropHistory.length) {
        html += `<p class="bed-history-label">Past crops</p>`;
        html += bed.cropHistory.map(c => {
            const days = c.plantingDate && c.harvestDate
                ? Math.round((new Date(ymd(c.harvestDate) + "T00:00:00") - new Date(ymd(c.plantingDate) + "T00:00:00")) / 86400000)
                : null;
            const harvestStr = c.harvestDate ? shortDate(c.harvestDate) : "—";
            return `
            <div class="bed-history-row">
                <span class="bed-history-crop">${escapeHtml(c.cropName)}</span>
                <span class="bed-history-meta">${days !== null ? days + " days · " : ""}Harvested ${harvestStr}</span>
            </div>`;
        }).join("");
    }

    content.innerHTML = html;

    const isEmpty = !bed.crops.length;
    document.querySelector(".bed-log-actions .water").hidden  = isEmpty;
    document.querySelector(".bed-log-actions .pest").hidden   = isEmpty;
    document.querySelector(".bed-log-actions .harvest").hidden = isEmpty;

    document.getElementById("bedDetailOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
}

// Set when a bed detail sheet is opened from within a plot's detail sheet,
// so closing the bed can step back into the plot instead of exiting to Home.
let bedDetailReturnPlotId = null;

function closeBedDetail() {
    document.getElementById("bedDetailOverlay").classList.remove("open");
    document.getElementById("bedRenameRow").hidden = true;
    document.getElementById("bedPlotRow").hidden = true;
    document.body.style.overflow = "";

    if (bedDetailReturnPlotId) {
        const returnPlotId = bedDetailReturnPlotId;
        bedDetailReturnPlotId = null;
        openPlotDetail(returnPlotId);
    }
}

function toggleBedRename() {
    const row = document.getElementById("bedRenameRow");
    row.hidden = !row.hidden;
    if (!row.hidden) {
        const bed = getBed(selectedBedForLog);
        document.getElementById("bedNameInput").value = bed?.name || "";
        document.getElementById("bedNameInput").focus();
    }
}

function saveBedName() {
    const name = document.getElementById("bedNameInput").value.trim();
    const bed  = getBed(selectedBedForLog);
    if (!bed) return;

    bed.name = name;
    saveBeds();
    renderBeds(bedsData);

    const label = name ? `Bed ${bed.bedNumber} · ${name}` : `Bed ${bed.bedNumber}`;
    document.getElementById("bedDetailTitle").textContent = label;
    document.getElementById("bedRenameRow").hidden = true;

    db.collection("beds").doc(String(bed.bedNumber)).update({ name })
        .catch(e => console.error("updateBed name failed:", e));
    showToast(name ? `Renamed to "${name}"` : "Name cleared");
}

// Single-bed plot reassignment — deliberately a separate, non-reconciling
// action (setBedPlot/removeBedFromPlot) rather than reusing the bulk
// assignBedsToPlot, which would wipe out every OTHER bed in the target plot.
function toggleBedPlotPicker() {
    const row = document.getElementById("bedPlotRow");
    row.hidden = !row.hidden;
    if (!row.hidden) {
        const bed = getBed(selectedBedForLog);
        const select = document.getElementById("bedPlotSelect");
        select.innerHTML = '<option value="">No plot</option>' +
            plotsData.map(p => `<option value="${escapeHtml(String(p.id))}">${escapeHtml(p.name)}</option>`).join("");
        select.value = bed?.plotId || "";
    }
}

function saveBedPlot() {
    const plotId = document.getElementById("bedPlotSelect").value;
    const bed = getBed(selectedBedForLog);
    if (!bed) return;

    bed.plotId = plotId;
    saveBeds();
    renderBeds(bedsData);
    document.getElementById("bedPlotRow").hidden = true;

    if (plotId) {
        db.collection("beds").doc(String(bed.bedNumber)).update({ plotId })
            .catch(e => console.error("setBedPlot failed:", e));
    } else {
        db.collection("beds").doc(String(bed.bedNumber)).update({ plotId: "" })
            .catch(e => console.error("removeBedFromPlot failed:", e));
    }
    showToast(plotId ? `Added to ${getPlot(plotId)?.name || "plot"}` : "Removed from plot");
}

function deleteBed() {
    const bed = getBed(selectedBedForLog);
    if (!bed) return;
    const label = bed.name ? `Bed ${bed.bedNumber} · ${bed.name}` : `Bed ${bed.bedNumber}`;
    if (!confirm(`Retire ${label}? It will be hidden from the home screen.`)) return;

    // Mark active crops on this bed as done so they don't become orphaned batches.
    if (bed.crops && bed.crops.length) {
        bed.crops.forEach(c => {
            if (c.id) {
                db.collection("batches").doc(c.id).update({ status: "done", harvestDate: todayString() })
                    .catch(e => console.error("retireBatch failed:", e));
            }
        });
    }

    bedsData = bedsData.filter(b => String(b.bedNumber) !== String(selectedBedForLog));
    saveBeds();
    renderBeds(bedsData);
    populateBedDropdown();
    bedDetailReturnPlotId = null; // bed is gone — nothing to return to
    closeBedDetail();

    db.collection("beds").doc(String(selectedBedForLog)).update({ status: "retired" })
        .catch(e => console.error("deleteBed failed:", e));
    showToast(`${label} retired`);
}

function logForBed(type) {
    bedDetailReturnPlotId = null; // logging opens another modal, not a "back" action
    closeBedDetail();
    openModal(type);
    document.getElementById("bedScope").value = selectedBedForLog;
    updateBedFields();
}

document.getElementById("bedDetailOverlay").addEventListener("click", function(e) {
    if (e.target === this) closeBedDetail();
});

// Purge / reset all beds and plots to start clean from Bed 1
async function purgeAllBedsAndPlots() {
    if (!confirm("Are you sure you want to purge all beds and plots? This will reset all bed counters back to 0.")) return;
    
    // Clear Firestore beds, plots, and active batches
    if (db) {
        try {
            const [bedsSnap, plotsSnap, batchesSnap] = await Promise.all([
                db.collection("beds").get(),
                db.collection("plots").get(),
                db.collection("batches").get()
            ]);
            const batch = db.batch();
            bedsSnap.docs.forEach(doc => batch.delete(doc.ref));
            plotsSnap.docs.forEach(doc => batch.delete(doc.ref));
            batchesSnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        } catch (e) {
            console.error("Purge Firestore failed:", e);
        }
    }

    // Reset local memory & storage
    bedsData = [];
    plotsData = [];
    maxBedNumber = 0;
    localStorage.removeItem(BEDS_CACHE_KEY);
    localStorage.removeItem(PLOTS_CACHE_KEY);
    localStorage.removeItem(BED_MAX_KEY);
    localStorage.removeItem(LAST_BED_KEY);

    renderBeds(bedsData);
    populateBedDropdown();
    renderBedFilterChips();
    showToast("All beds & plots purged! Ready to add Bed 1.");
}
window.purgeAllBedsAndPlots = purgeAllBedsAndPlots;

function addBed() {
    if (addBedPending) return;
    addBedPending = true;
    setTimeout(() => { addBedPending = false; }, 2000);

    // Calculate next bed number based on current active beds (starts at 1 if empty)
    const activeNums = bedsData.map(b => Number(b.bedNumber)).filter(n => !isNaN(n) && n > 0);
    const nextNum = activeNums.length ? Math.max(...activeNums) + 1 : 1;
    maxBedNumber = nextNum;
    localStorage.setItem(BED_MAX_KEY, String(maxBedNumber));

    const newBed = {
        bedNumber: nextNum,
        location:  "commercial",
        status:    "active",
        plotId:    "",
        crops:     [],
        lastActivity: null,
        lastWatered:  null
    };

    bedsData.push(newBed);
    saveBeds();
    renderBeds(bedsData);
    populateBedDropdown();

    db.collection("beds").doc(String(nextNum)).set(newBed)
        .catch(e => {
            console.error("addBed failed:", e);
            showToast("⚠️ Cloud sync error: " + (e.code || e.message));
        });
    showToast(`Bed ${nextNum} added!`);
}

async function fetchBeds() {
    // Paint cached data first so the screen isn't empty on slow connections.
    const cached = localStorage.getItem(BEDS_CACHE_KEY);
    if (cached) {
        try {
            bedsData = JSON.parse(cached);
            renderBeds(bedsData);
            populateBedDropdown();
            renderBedFilterChips();
            refreshCropDatalists();
        } catch (e) { /* ignore corrupt cache */ }
    }
    try {
        // Fetch beds, active batches, and done batches in parallel.
        const [bedsSnap, activeBatchSnap, doneBatchSnap] = await Promise.all([
            db.collection("beds").get(),
            db.collection("batches").where("status", "==", "active").get(),
            db.collection("batches").where("status", "==", "done").get()
        ]);

        const beds         = bedsSnap.docs.map(d => ({ ...d.data() })).filter(b => b.status !== "retired");
        const activeBatches = activeBatchSnap.docs.map(d => ({ ...d.data() }));
        const doneBatches   = doneBatchSnap.docs.map(d => ({ ...d.data() }));

        // Merge crops and history onto each bed.
        bedsData = beds.map(bed => ({
            ...bed,
            crops: activeBatches
                .filter(b => String(b.bedNumber) === String(bed.bedNumber))
                .map(b => ({ id: b.id, cropName: b.cropName, plantingDate: ymd(b.plantingDate) })),
            cropHistory: doneBatches
                .filter(b => String(b.bedNumber) === String(bed.bedNumber))
                .map(b => ({ cropName: b.cropName, plantingDate: ymd(b.plantingDate), harvestDate: ymd(b.harvestDate) }))
                .sort((a, b) => (b.harvestDate || "") > (a.harvestDate || "") ? 1 : -1)
        }));

        // Track highest bed number based on active beds
        const activeNums = bedsData.map(b => Number(b.bedNumber)).filter(n => !isNaN(n) && n > 0);
        maxBedNumber = activeNums.length ? Math.max(...activeNums) : 0;
        localStorage.setItem(BED_MAX_KEY, String(maxBedNumber));

        localStorage.setItem(BEDS_CACHE_KEY, JSON.stringify(bedsData));
        renderBeds(bedsData);
        populateBedDropdown();
        renderBedFilterChips();
        refreshCropDatalists();
    } catch (e) {
        console.error("Could not load beds:", e);
        const container = document.getElementById("batchList");
        if (!cached && container) {
            container.innerHTML = `
            <div class="empty-beds-card" onclick="addBed()">
                <span class="empty-beds-icon">🌱</span>
                <p class="empty-beds-title">Add your first bed</p>
                <p class="empty-beds-hint">${e.code === 'permission-denied' ? '⚠️ Permission denied: check Firestore Rules' : 'Tap to create Bed 1'}</p>
            </div>`;
        }
    } finally {
        if (lastWeatherData) renderWeather(lastWeatherData);
    }
}

// Third-party public API (Open-Meteo) — no Firebase auth needed.
async function fetchWeather() {
    const cached = localStorage.getItem(WEATHER_CACHE_KEY);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            renderWeather(parsed.data);
            if (Date.now() - parsed.fetchedAt < 60 * 60 * 1000) return; // fresh within the hour
        } catch (e) { /* ignore corrupt cache */ }
    }
    try {
        const res  = await fetch(WEATHER_URL);
        const data = await res.json();
        if (data.current && data.daily) {
            localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() }));
            renderWeather(data);
        }
    } catch (e) {
        console.error("Could not load weather:", e);
    }
}

// Kept so the card can re-render when bedsData changes (the tie-in hint reads
// bed watering state, and beds usually load after the first weather paint).
let lastWeatherData = null;

function renderWeather(data) {
    const container = document.getElementById("weatherCard");
    if (!container || !data.current || !data.daily) return;
    lastWeatherData = data;

    // Only worth a note when we're showing data older than the normal 1-hour
    // refresh window (e.g. a background refresh failed) — a fresh render
    // shouldn't nag with a timestamp.
    let staleNote = "";
    try {
        const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || "null");
        if (cached && cached.fetchedAt) {
            const ageMs = Date.now() - cached.fetchedAt;
            if (ageMs >= 60 * 60 * 1000) {
                const ageHrs = Math.max(1, Math.round(ageMs / (60 * 60 * 1000)));
                staleNote = `<span class="weather-stale-note">Offline — showing forecast from ${ageHrs}h ago</span>`;
            }
        }
    } catch (e) { /* ignore corrupt cache */ }

    const temp        = Math.round(data.current.temperature_2m);
    const icon         = weatherIcon(data.current.weather_code);
    const todayRain    = data.daily.precipitation_probability_max[0];
    const todayWeekday = new Date().toLocaleDateString("en-MY", { weekday: "short" });

    const dayStrip = [1, 2, 3].map(i => {
        const dateStr = data.daily.time[i];
        if (!dateStr) return "";
        const dayLabel = new Date(dateStr + "T00:00:00").toLocaleDateString("en-MY", { weekday: "short" });
        return `
        <div class="weather-day-col">
            <span class="d-label">${dayLabel}</span>
            <span class="d-icon">${weatherIcon(data.daily.weather_code[i])}</span>
            <span class="d-pct">${data.daily.precipitation_probability_max[i]}%</span>
        </div>`;
    }).join("");

    // Always-on watering recommendation, driven purely by rain%: skip if rain
    // is likely today, otherwise water — tomorrow's forecast breaks the tie
    // when today looks dry-ish but relief is coming soon.
    const tomorrowRain = data.daily.precipitation_probability_max[1];
    let recIcon, recText;
    if (todayRain >= 40) {
        recIcon = "💧";
        recText = "Skip watering — rain likely today";
    } else if (tomorrowRain >= 40) {
        recIcon = "🚿";
        recText = "Water today — rain expected tomorrow, ease up after";
    } else {
        recIcon = "🚿";
        recText = "Water today — no rain in sight";
    }

    // Tie-in with the existing per-bed watering alert: only worth a mention if
    // rain is likely AND a bed is actually flagged as needing water.
    const hintBed = todayRain >= 40 ? bedsData.find(b => getWateringStatus(b).needsWater) : null;
    const hint = hintBed ? `
        <div class="weather-hint">
            <span>🌧️</span>
            <span>Rain likely today — Bed ${escapeHtml(String(hintBed.bedNumber))} may not need watering.</span>
        </div>` : "";

    container.innerHTML = `
        <div class="weather-main-row">
            <span class="weather-icon-big">${icon}</span>
            <div class="weather-temp-block">
                <span class="weather-temp">${temp}°</span>
                <span class="weather-sub">${todayWeekday} · Farm weather</span>
            </div>
            <div class="weather-rain-pill">
                <div class="weather-rain-pct">${todayRain}%</div>
                <div class="weather-rain-label">Rain today</div>
            </div>
        </div>
        <div class="weather-recommendation">
            <span>${recIcon}</span>
            <span>${recText}</span>
        </div>
        <div class="weather-forecast-strip">${dayStrip}</div>
        ${hint}
        ${staleNote}`;
}

// --- 10. Formulas Tab & Standard Recipes ---
const DEFAULT_FORMULAS = [
    {
        id: "f_bio_botava",
        name: "Bio-Botanical Pest Shield",
        category: "Biological",
        description: "General preventive foliar spray for soft-bodied insects, whiteflies, and aphids. Apply early morning or late evening.",
        recipe: "Bio Botava:2.5:ml|Garlic Oil Extract:2:ml",
        status: "active"
    },
    {
        id: "f_pest_guard",
        name: "Pest Guard Contact Spray",
        category: "Botanical",
        description: "Broad-spectrum organic contact deterrent for caterpillars, thrips, and beetles.",
        recipe: "Pest Guard 2:3:ml|Garlic Oil Extract:1.5:ml",
        status: "active"
    },
    {
        id: "f_amino_18",
        name: "Foliar Growth & Stress Mix",
        category: "Nutrition",
        description: "Vegetative boost, root enhancement, and recovery after heavy rain, pest attacks, or transplanting.",
        recipe: "Amino 18:2:ml",
        status: "active"
    },
    {
        id: "f_wira_calbo",
        name: "Calcium-Boron Bloom & Fruit Set",
        category: "Nutrition",
        description: "Prevents blossom end rot and fruit cracking, strengthens cell walls, and improves flowering retention.",
        recipe: "Wira CalBo:2:ml",
        status: "active"
    },
    {
        id: "f_foliar_combo",
        name: "Combined Foliar Nutrition Boost",
        category: "Nutrition",
        description: "Balanced leaf spray for active vegetative growth and early flowering phases.",
        recipe: "Amino 18:1.5:ml|Wira CalBo:1.5:ml",
        status: "active"
    },
    {
        id: "f_antracol",
        name: "Antracol Protective Spray",
        category: "Fungicide",
        description: "Broad-spectrum protective contact fungicide against blight, anthracnose, and leaf spots. Spray before heavy rain cycles.",
        recipe: "Antracol:2:g",
        status: "active"
    },
    {
        id: "f_abamectin",
        name: "Abamectin Mite & Thrip Knockdown",
        category: "Insecticide",
        description: "Translaminar insecticide/miticide targeted specifically at severe leafminer, mite, and thrip outbreaks.",
        recipe: "Abamectin:1:ml",
        status: "active"
    },
    {
        id: "f_cypermethrin",
        name: "Cypermethrin Broad-Spectrum Knockdown",
        category: "Insecticide",
        description: "Synthetic pyrethroid contact spray for caterpillars, fruit borers, and persistent beetles. Use strictly as a corrective knockdown.",
        recipe: "Cypermethrin:1.5:ml",
        status: "active"
    }
];

// Seed or upsert default agricultural recipe catalog into Firestore
async function seedDefaultFormulas() {
    if (!db) return;
    try {
        const batch = db.batch();
        DEFAULT_FORMULAS.forEach(f => {
            const docRef = db.collection("formulas").doc(f.id);
            batch.set(docRef, f, { merge: true });
        });
        await batch.commit();
        console.log("Standard formulas catalog seeded to Firestore.");
    } catch (err) {
        console.warn("Batch seeding formulas fallback to doc.set:", err);
        for (const f of DEFAULT_FORMULAS) {
            try {
                await db.collection("formulas").doc(f.id).set(f, { merge: true });
            } catch (e) {
                console.error("Failed seeding formula", f.id, e);
            }
        }
    }
}

function parseRecipe(recipeStr) {
    if (!recipeStr || !recipeStr.includes(':')) return null;
    try {
        return recipeStr.split('|').map(part => {
            const [name, amount, unit] = part.split(':');
            return { name: name.trim(), amount: parseFloat(amount), unit: unit.trim() };
        });
    } catch (e) { return null; }
}

function renderIngredients(ingredients, liters) {
    const vol = parseFloat(liters) || 16;
    return ingredients.map(ing => {
        const total = ing.amount * vol;
        const calc = ing.unit === 'g'
            ? total.toFixed(1).replace(/\.0$/, '')
            : (Number.isInteger(total) ? String(total) : total.toFixed(1).replace(/\.0$/, ''));
        return `<div class="ingredient-row">
            <span class="ingredient-name">${escapeHtml(ing.name)}</span>
            <span class="ingredient-amount">${calc} ${ing.unit}</span>
        </div>`;
    }).join('');
}

function recalcAllDoses(liters) {
    formulasData.forEach((f, i) => {
        const ingredients = parseRecipe(f.recipe);
        if (!ingredients) return;
        const container = document.getElementById(`ingredients-${i}`);
        if (container) container.innerHTML = renderIngredients(ingredients, liters);
    });
}

function renderFormulas(formulas) {
    formulasData = formulas;
    const container = document.getElementById("formulaList");
    if (!formulas.length) {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">No formulas yet.</p>';
        return;
    }
    const vol = parseFloat(document.getElementById("globalSprayerVol")?.value) || 16;
    container.innerHTML = formulas.map((f, i) => {
        const ingredients = parseRecipe(f.recipe);
        const calcSection = ingredients ? `
            <div class="formula-calc">
                <div class="formula-ingredients" id="ingredients-${i}">
                    ${renderIngredients(ingredients, vol)}
                </div>
            </div>` : (f.recipe ? `<pre class="formula-recipe">${escapeHtml(f.recipe)}</pre>` : '');
        return `
        <div class="formula-card">
            <div class="formula-header">
                <p class="formula-name">${escapeHtml(f.name)}</p>
                <div class="formula-actions">
                    ${f.category ? (() => {
                        const color = getCategoryColor(f.category);
                        const style = color ? ` style="${tintStyle(color)}"` : "";
                        return `<span class="tag"${style}>${escapeHtml(f.category)}</span>`;
                    })() : ""}
                    <button class="formula-edit-btn" onclick="openFormulaModal(${i})" aria-label="Edit">✏️</button>
                    <button class="formula-delete-btn" onclick="deleteFormula(${i})" aria-label="Delete">🗑️</button>
                </div>
            </div>
            ${f.description ? `<p class="formula-desc">${escapeHtml(f.description)}</p>` : ""}
            ${calcSection}
            <button type="button" class="formula-apply-btn" onclick="applyFormulaFromLibrary(${i})">
                ⚡ Apply to Bed / Plot
            </button>
        </div>`;
    }).join("");
}

function applyFormulaFromLibrary(index) {
    const formula = formulasData[index];
    if (!formula) return;
    switchView("home");
    openModal("pest");
    selectedQuickFormulaId = formula.id;
    updateBedFields();
    renderQuickFormulaChips();
    updateQuickFormulaDosePreview();
}

async function fetchFormulas() {
    const container = document.getElementById("formulaList");
    const cached = localStorage.getItem(FORMULAS_CACHE_KEY);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length) {
                renderFormulas(parsed);
            } else {
                renderFormulas(DEFAULT_FORMULAS);
            }
        } catch (e) {
            renderFormulas(DEFAULT_FORMULAS);
        }
    } else {
        // Cold cache first paint: render standard default catalog instantly
        renderFormulas(DEFAULT_FORMULAS);
    }
    try {
        const snap = await db.collection("formulas").get();
        if (snap.empty) {
            // Seed Firestore with standard catalog on first run
            await seedDefaultFormulas();
            localStorage.setItem(FORMULAS_CACHE_KEY, JSON.stringify(DEFAULT_FORMULAS));
            renderFormulas(DEFAULT_FORMULAS);
            return;
        }
        const formulas = snap.docs
            .map(d => ({ ...d.data() }))
            .filter(f => f.status !== "deleted")
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        localStorage.setItem(FORMULAS_CACHE_KEY, JSON.stringify(formulas));
        renderFormulas(formulas);
    } catch (e) {
        console.warn("fetchFormulas note:", e);
        if (!cached && (!formulasData || !formulasData.length)) {
            renderFormulas(DEFAULT_FORMULAS);
        }
    }
}

// Plots have no dedicated list view of their own — they feed into the Home
// bed-card grouping and the log form's scope dropdown, so there's no
// container to paint a loading/error state into here; just cache + re-render
// whatever already depends on plotsData.
async function fetchPlots() {
    const cached = localStorage.getItem(PLOTS_CACHE_KEY);
    if (cached) {
        try { plotsData = JSON.parse(cached); } catch (e) { /* ignore corrupt cache */ }
    }
    try {
        const snap = await db.collection("plots").get();
        plotsData = snap.docs
            .map(d => ({ ...d.data() }))
            .filter(p => p.status !== "deleted");
        localStorage.setItem(PLOTS_CACHE_KEY, JSON.stringify(plotsData));
    } catch (e) {
        console.error("Could not load plots:", e);
    } finally {
        renderBeds(bedsData);
        populateBedDropdown();
    }
}

// --- 11. Log Data (Activity Tab) ---
function shortDate(dateStr) {
    const d = new Date(ymd(dateStr) + "T00:00:00");
    return d.toLocaleDateString("en-MY", { month: "short", day: "numeric" });
}

function dateGroupLabel(dateStr) {
    const today     = todayString();
    const d         = new Date(); d.setDate(d.getDate() - 1);
    const yesterday = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
    if (dateStr === today)     return "Today · "     + shortDate(dateStr);
    if (dateStr === yesterday) return "Yesterday · " + shortDate(dateStr);
    return shortDate(dateStr);
}

function renderBedFilterChips() {
    const container = document.getElementById("bedFilterChips");
    if (!container) return;
    const chips = [
        { label: "All beds", value: "all" },
        ...plotsData.map(p => ({ label: "🗂️ " + p.name, value: String(p.id) })),
        ...bedsData.map(b => ({ label: "Bed " + b.bedNumber, value: String(b.bedNumber) }))
    ];
    container.innerHTML = chips.map(c =>
        `<button class="bed-filter-chip${activeLogFilter === c.value ? " active" : ""}" onclick="filterLogs('${escapeHtml(c.value)}')">${escapeHtml(c.label)}</button>`
    ).join("");
}

function renderTypeFilterChips() {
    const container = document.getElementById("typeFilterChips");
    if (!container) return;
    const types = [
        { label: "All types", value: "all" },
        { label: "💧 Watering",     value: "watering" },
        { label: "🐛 Pest control", value: "pest_control" },
        { label: "🧺 Harvest",      value: "harvest" },
        { label: "🌱 Sowing",       value: "sowing" },
        { label: "💰 Sales",        value: "sale" }
    ];
    container.innerHTML = types.map(t =>
        `<button class="bed-filter-chip${activeTypeFilter === t.value ? " active" : ""}" onclick="filterByType('${t.value}')">${t.label}</button>`
    ).join("");
}

function filterLogs(bedNum) {
    activeLogFilter = bedNum;
    renderBedFilterChips();
    renderCombinedActivity();
}

function filterByType(type) {
    activeTypeFilter = type;
    renderTypeFilterChips();
    renderCombinedActivity();
}

function clearActivityFilters() {
    activeLogFilter = "all";
    activeTypeFilter = "all";
    renderBedFilterChips();
    renderTypeFilterChips();
    renderCombinedActivity();
}

function updateClearFiltersBtn() {
    const btn = document.getElementById("clearFiltersBtn");
    if (!btn) return;
    btn.hidden = activeLogFilter === "all" && activeTypeFilter === "all";
}

function renderCombinedActivity() {
    updateClearFiltersBtn();
    const logs  = JSON.parse(localStorage.getItem(LOGS_CACHE_KEY)  || "[]");
    const sales = JSON.parse(localStorage.getItem(SALES_CACHE_KEY) || "[]");
    // Normalise sales into the same shape as logs for rendering
    const saleEntries = sales.map(s => ({
        id:               s.id,
        date:             s.date,
        activityCategory: "sale",
        bedNumber:        null,
        cropName:         s.crop,
        quantity:         s.quantity,
        unit:             s.unit,
        pricePerUnit:     s.pricePerUnit,
        totalRevenue:     s.totalRevenue
    }));
    renderLogs([...logs, ...saleEntries]);
}

// Shared by renderLogs() and exportActivityCsv() — both need to turn a raw
// log.bedNumber ("all", "plot_<id>", a real bed number, or blank/sale) into
// a human label. Pure and DOM-free, so it's directly unit-testable.
function resolveLogScopeLabel(log) {
    const bn = String(log.bedNumber || "");
    if (!bn || bn === "all") return "Whole Farm";
    if (bn.startsWith("plot_")) {
        const plot = getPlot(bn);
        return plot ? plot.name : "Plot (deleted)";
    }
    return `Bed ${bn}`;
}

function csvEscape(val) {
    const s = String(val ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportActivityCsv() {
    const logs  = JSON.parse(localStorage.getItem(LOGS_CACHE_KEY)  || "[]");
    const sales = JSON.parse(localStorage.getItem(SALES_CACHE_KEY) || "[]");

    if (!logs.length && !sales.length) {
        showToast("No activity to export yet");
        return;
    }

    const rows = [["Type", "Date", "Bed", "Category/Crop", "Details", "Weight (kg)", "Cost (RM)", "Revenue (RM)"]];

    logs.forEach(l => {
        rows.push([
            "Log",
            ymd(l.date),
            resolveLogScopeLabel(l),
            CATEGORY_LABEL[l.activityCategory] || l.activityCategory,
            [l.cropName, l.inputsUsed].filter(Boolean).join(" · "),
            l.activityCategory === "harvest" ? (l.weight || "") : "",
            l.costRM || "",
            l.revenueRM || ""
        ]);
    });

    sales.forEach(s => {
        rows.push([
            "Sale",
            ymd(s.date),
            "",
            s.crop,
            `${s.quantity} ${s.unit} @ RM ${parseFloat(s.pricePerUnit).toFixed(2)}`,
            "",
            "",
            s.totalRevenue
        ]);
    });

    const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `kabun-activity-${todayString()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function deleteLogEntry(logId) {
    if (!confirm("Delete this log entry?")) return;

    const isSale = logId.startsWith("sale_");

    if (isSale) {
        const cached = localStorage.getItem(SALES_CACHE_KEY);
        if (!cached) return;
        const sales = JSON.parse(cached).filter(s => String(s.id) !== String(logId));
        localStorage.setItem(SALES_CACHE_KEY, JSON.stringify(sales));
        db.collection("sales").doc(logId).update({ status: "deleted" })
            .catch(e => console.error("deleteSale failed:", e));
    } else {
        const cached = localStorage.getItem(LOGS_CACHE_KEY);
        if (!cached) return;
        const logs = JSON.parse(cached).filter(l => String(l.id) !== String(logId));
        localStorage.setItem(LOGS_CACHE_KEY, JSON.stringify(logs));
        db.collection("logs").doc(logId).update({ status: "deleted" })
            .catch(e => console.error("deleteLog failed:", e));
    }

    renderCombinedActivity();
    renderFinancialSummary();
    renderCropPL();
    showToast("Entry deleted");
}

function renderLogs(logs) {
    const container = document.getElementById("logList");

    const filtered = logs
        .filter(log => activeLogFilter === "all" || log.activityCategory === "sale" || String(log.bedNumber) === String(activeLogFilter))
        .filter(log => activeTypeFilter === "all" || log.activityCategory === activeTypeFilter);

    if (!filtered.length) {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">No logs yet.</p>';
        return;
    }

    const groups = {};
    filtered.forEach(log => {
        const key = log.date ? ymd(log.date) : "Unknown";
        if (!groups[key]) groups[key] = [];
        groups[key].push(log);
    });

    const html = Object.keys(groups)
        .sort((a, b) => b.localeCompare(a))
        .map(dateKey => {
            const cards = [...groups[dateKey]].reverse().map(log => {
                const icon       = CATEGORY_ICON[log.activityCategory]  || "📝";
                const label      = CATEGORY_LABEL[log.activityCategory] || escapeHtml(log.activityCategory);
                const scopeLabel = escapeHtml(resolveLogScopeLabel(log));
                const isSale = log.activityCategory === "sale";

                let body = "";
                if (isSale) {
                    body = `
                    <div class="sale-log-detail">
                        <span class="sale-log-crop">🌱 ${escapeHtml(log.cropName || "")}</span>
                        <span class="sale-log-qty">${escapeHtml(String(log.quantity))} ${escapeHtml(log.unit)}</span>
                        <span class="sale-log-price">RM ${parseFloat(log.pricePerUnit).toFixed(2)}/${escapeHtml(log.unit)}</span>
                        <span class="sale-log-total">RM ${parseFloat(log.totalRevenue).toFixed(2)}</span>
                    </div>`;
                } else {
                    const cropLine   = log.cropName   ? `<p class="log-inputs">🌱 ${escapeHtml(log.cropName)}</p>`  : "";
                    const weightLine = (log.activityCategory === "harvest" && log.weight) ? `<p class="log-inputs">⚖️ ${escapeHtml(String(log.weight))} kg</p>` : "";
                    const inputLine  = log.inputsUsed ? `<p class="log-inputs">${escapeHtml(log.inputsUsed)}</p>`   : "";
                    const financials = (log.costRM || log.revenueRM) ? `
                    <div class="log-financials">
                        ${log.costRM    ? `<span>Cost: RM ${parseFloat(log.costRM).toFixed(2)}</span>`    : ""}
                        ${log.revenueRM ? `<span>Revenue: RM ${parseFloat(log.revenueRM).toFixed(2)}</span>` : ""}
                    </div>` : "";
                    body = cropLine + weightLine + inputLine + financials;
                }

                return `
                <div class="log-card${isSale ? " log-card-sale" : ""}">
                    <button class="log-delete-btn" onclick="deleteLogEntry('${escapeHtml(String(log.id))}')" aria-label="Delete log">✕</button>
                    <div class="log-header">
                        <span class="log-icon">${icon}</span>
                        <div class="log-meta">
                            <p class="log-title">${label}</p>
                            ${!isSale ? `<p class="log-date"><span class="tag">${scopeLabel}</span></p>` : ""}
                        </div>
                    </div>
                    ${body}
                </div>`;
            }).join("");
            return `<p class="log-date-group">${dateGroupLabel(dateKey)}</p>${cards}`;
        }).join("");

    container.innerHTML = html;
}

async function fetchLogs() {
    const container  = document.getElementById("logList");
    const cachedLogs = localStorage.getItem(LOGS_CACHE_KEY);
    if (cachedLogs) {
        try { renderCombinedActivity(); renderCropPL(); } catch (e) { /* ignore */ }
    } else {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">Loading logs...</p>';
    }
    try {
        const [logsSnap, salesSnap] = await Promise.all([
            db.collection("logs").orderBy("date", "desc").get(),
            db.collection("sales").orderBy("date", "desc").get()
        ]);
        const logs  = logsSnap.docs.map(d => ({ ...d.data() })).filter(l => l.status !== "deleted");
        const sales = salesSnap.docs.map(d => ({ ...d.data() })).filter(s => s.status !== "deleted");
        localStorage.setItem(LOGS_CACHE_KEY,  JSON.stringify(logs));
        localStorage.setItem(SALES_CACHE_KEY, JSON.stringify(sales));
        renderCombinedActivity();
        renderFinancialSummary();
        renderCropPL();
        refreshCropDatalists();
    } catch (e) {
        if (!cachedLogs) {
            container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">Could not load activity.</p>';
        }
    }
}

// --- 12. Zero-Accordion Quick Formula Chips & Calculator ---
let selectedQuickFormulaId = null;

function renderQuickFormulaChips() {
    const container = document.getElementById("quickFormulaChips");
    if (!container) return;
    if (!formulasData.length) {
        container.innerHTML = '<span style="color:#888;font-size:12px;">No formulas available</span>';
        return;
    }
    container.innerHTML = formulasData.map(f => {
        const isSel = String(selectedQuickFormulaId) === String(f.id);
        return `
        <button type="button" class="quick-formula-chip${isSel ? " selected" : ""}" onclick="selectQuickFormula('${escapeHtml(String(f.id))}')">
            ${escapeHtml(f.name)}
        </button>`;
    }).join("");
}

function selectQuickFormula(formulaId) {
    if (String(selectedQuickFormulaId) === String(formulaId)) {
        selectedQuickFormulaId = null;
    } else {
        selectedQuickFormulaId = formulaId;
    }
    renderQuickFormulaChips();
    updateQuickFormulaDosePreview();
}

function onSprayerParamChange() {
    updateSprayerTotalDisplay();
    updateQuickFormulaDosePreview();
}

function updateQuickFormulaDosePreview() {
    const card = document.getElementById("quickFormulaDoseCard");
    const inputsUsed = document.getElementById("inputsUsed");
    if (!selectedQuickFormulaId) {
        if (card) card.hidden = true;
        return;
    }
    const formula = formulasData.find(f => String(f.id) === String(selectedQuickFormulaId));
    if (!formula) {
        if (card) card.hidden = true;
        return;
    }

    const ingredients = parseRecipe(formula.recipe);
    const tankSize  = parseFloat(document.getElementById("logSprayerVol")?.value) || 16;
    const tankCount = parseFloat(document.getElementById("logTankCount")?.value) || 1;
    const totalVol  = tankSize * tankCount;

    if (ingredients && card) {
        const rowsHtml = ingredients.map(ing => {
            const total = ing.amount * totalVol;
            const calc = ing.unit === 'g'
                ? total.toFixed(1).replace(/\.0$/, '')
                : (Number.isInteger(total) ? String(total) : total.toFixed(1).replace(/\.0$/, ''));
            return `
            <div class="quick-dose-row">
                <span>${escapeHtml(ing.name)}</span>
                <span class="quick-dose-amount">${calc} ${ing.unit}</span>
            </div>`;
        }).join("");

        card.innerHTML = `
            <p class="quick-dose-title">🧪 ${escapeHtml(formula.name)} (${totalVol}L mix)</p>
            <div class="quick-dose-list">${rowsHtml}</div>`;
        card.hidden = false;

        const formulaParts = ingredients.map(ing => {
            const total = ing.amount * totalVol;
            const calc = ing.unit === 'g'
                ? total.toFixed(1).replace(/\.0$/, '')
                : (Number.isInteger(total) ? String(total) : total.toFixed(1).replace(/\.0$/, ''));
            return `${ing.name}: ${calc}${ing.unit}`;
        });
        const summaryText = tankCount > 1
            ? `${formula.name} (${tankCount} tanks × ${tankSize}L = ${totalVol}L)\n${formulaParts.join(", ")}`
            : `${formula.name} (${totalVol}L sprayer)\n${formulaParts.join(", ")}`;
        if (inputsUsed) inputsUsed.value = summaryText;
    }
}

function updateSprayerTotalDisplay() {
    const tankSize  = parseFloat(document.getElementById("logSprayerVol")?.value) || 16;
    const tankCount = parseFloat(document.getElementById("logTankCount")?.value) || 1;
    const total     = (tankSize * tankCount).toFixed(1).replace(/\.0$/, '');
    const disp      = document.getElementById("logSprayerTotalDisplay");
    if (disp) {
        disp.innerHTML = `Total mix: <strong>${total} L</strong> (${tankCount} tank${tankCount === 1 ? '' : 's'} × ${tankSize}L)`;
    }
}

function applyFormula(index) {
    const formula     = formulasData[index];
    if (!formula) return;
    const ingredients = parseRecipe(formula.recipe);
    const tankSize    = parseFloat(document.getElementById("logSprayerVol")?.value) || parseFloat(document.getElementById("globalSprayerVol")?.value) || 16;
    const tankCount   = parseFloat(document.getElementById("logTankCount")?.value) || 1;
    const totalVol    = tankSize * tankCount;

    let text = tankCount > 1
        ? `${formula.name} — ${tankCount} tanks × ${tankSize}L (${totalVol}L total)`
        : `${formula.name} — ${totalVol}L sprayer`;
    if (ingredients) {
        const parts = ingredients.map(ing => {
            const total = ing.amount * totalVol;
            const calc = ing.unit === 'g'
                ? total.toFixed(1).replace(/\.0$/, '')
                : (Number.isInteger(total) ? String(total) : total.toFixed(1).replace(/\.0$/, ''));
            return `${ing.name}: ${calc}${ing.unit}`;
        });
        text += `\n${parts.join(", ")}`;
    }

    const textarea = document.getElementById("inputsUsed");
    textarea.value = textarea.value ? textarea.value + "\n" + text : text;

    document.getElementById("formulaPickerList").hidden = true;
}

// --- 13. Financial Summary ---
function setFinPeriod(period) {
    finPeriod = period;
    document.getElementById("finWeekBtn").classList.toggle("active", period === "week");
    document.getElementById("finMonthBtn").classList.toggle("active", period === "month");
    renderFinancialSummary();
}

function renderFinancialSummary() {
    const now   = new Date();
    let start;

    if (finPeriod === "week") {
        // Monday of current week
        const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
        start = new Date(now);
        start.setDate(now.getDate() - day);
    } else {
        // 1st of current month
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    start.setHours(0, 0, 0, 0);

    const sales = JSON.parse(localStorage.getItem(SALES_CACHE_KEY) || "[]");
    const logs  = JSON.parse(localStorage.getItem(LOGS_CACHE_KEY)  || "[]");

    const startStr = localDateStr(start);

    const revenue = sales
        .filter(s => s.date && ymd(s.date) >= startStr)
        .reduce((sum, s) => sum + (parseFloat(s.totalRevenue) || 0), 0);

    const cost = logs
        .filter(l => l.date && ymd(l.date) >= startStr && l.costRM)
        .reduce((sum, l) => sum + (parseFloat(l.costRM) || 0), 0);

    const net = revenue - cost;

    document.getElementById("finRevenue").textContent = "RM " + revenue.toFixed(2);
    document.getElementById("finCost").textContent    = "RM " + cost.toFixed(2);

    const netEl = document.getElementById("finNet");
    netEl.textContent = (net >= 0 ? "+" : "") + "RM " + net.toFixed(2);
    netEl.className = "fin-value " + (net >= 0 ? "green" : "red");
}

// --- 13b. Profit by Crop (all-time) ---
function computeCropPL() {
    const logs  = JSON.parse(localStorage.getItem(LOGS_CACHE_KEY)  || "[]");
    const sales = JSON.parse(localStorage.getItem(SALES_CACHE_KEY) || "[]");
    const stats = {};

    function ensure(name) {
        if (!stats[name]) stats[name] = { revenue: 0, cost: 0, logCount: 0, costLoggedCount: 0, saleCount: 0, weightKg: 0 };
        return stats[name];
    }

    logs.forEach(l => {
        if (!l.cropName) return;
        // A log's cropName can be a comma-joined list (intercropped bed) —
        // split its cost (and harvest weight) evenly across the named crops
        // rather than double-counting it for each one.
        const names = String(l.cropName).split(",").map(s => s.trim()).filter(Boolean);
        if (!names.length) return;
        const cost   = parseFloat(l.costRM) || 0;
        const share  = cost / names.length;
        const weight = l.activityCategory === "harvest" ? (parseFloat(l.weight) || 0) : 0;
        const weightShare = weight / names.length;
        names.forEach(name => {
            const s = ensure(name);
            s.cost += share;
            s.weightKg += weightShare;
            s.logCount++;
            if (l.costRM) s.costLoggedCount++;
        });
    });

    sales.forEach(s => {
        if (!s.crop) return;
        const st = ensure(s.crop.trim());
        st.revenue += parseFloat(s.totalRevenue) || 0;
        st.saleCount++;
    });

    return Object.entries(stats)
        .map(([cropName, s]) => ({
            cropName,
            revenue:  s.revenue,
            cost:     s.cost,
            net:      s.revenue - s.cost,
            logCount: s.logCount,
            costLoggedCount: s.costLoggedCount,
            weightKg: s.weightKg,
            costPerKg: s.weightKg > 0 ? s.cost / s.weightKg : null
        }))
        .sort((a, b) => b.net - a.net);
}

function renderCropPL() {
    const container = document.getElementById("cropPLList");
    if (!container) return;

    const data = computeCropPL();
    if (!data.length) {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">No crop data yet — log a sale or harvest to see profit by crop.</p>';
        return;
    }

    container.innerHTML = data.map(c => {
        const netClass = c.net >= 0 ? "green" : "red";
        const coverage = c.logCount > 0 && c.costLoggedCount < c.logCount
            ? `<p class="crop-pl-coverage">Cost logged in ${c.costLoggedCount}/${c.logCount} activities — actual cost may be higher</p>`
            : "";
        const costPerKgLine = c.costPerKg !== null
            ? `<span>Cost/kg: RM ${c.costPerKg.toFixed(2)} <span style="color:#aaa;">(${c.weightKg.toFixed(1)} kg harvested)</span></span>`
            : "";
        return `
        <div class="crop-pl-row">
            <div class="crop-pl-header">
                <span class="crop-pl-name">${escapeHtml(c.cropName)}</span>
                <span class="crop-pl-net ${netClass}">${c.net >= 0 ? "+" : ""}RM ${c.net.toFixed(2)}</span>
            </div>
            <div class="crop-pl-stats">
                <span>Revenue: RM ${c.revenue.toFixed(2)}</span>
                <span>Cost: RM ${c.cost.toFixed(2)}</span>
                ${costPerKgLine}
            </div>
            ${coverage}
        </div>`;
    }).join("");
}

// --- 13. Sales Modal ---
function openSaleModal() {
    document.getElementById("saleDate").value = todayString();
    document.getElementById("saleCrop").value = "";
    document.getElementById("saleQty").value = "";
    document.getElementById("saleUnit").value = "kg";
    document.getElementById("salePricePerUnit").value = "";
    document.getElementById("saleTotalDisplay").textContent = "RM 0.00";
    document.getElementById("saleCrop").classList.remove("invalid");
    document.getElementById("saleQty").classList.remove("invalid");
    document.getElementById("salePricePerUnit").classList.remove("invalid");

    // Crop suggestions (all crops ever seen, not just currently active)
    refreshCropDatalists();

    document.getElementById("saleModalOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
}

function closeSaleModal() {
    document.getElementById("saleModalOverlay").classList.remove("open");
    document.body.style.overflow = "";
}

function calcSaleTotal() {
    const qty   = parseFloat(document.getElementById("saleQty").value) || 0;
    const price = parseFloat(document.getElementById("salePricePerUnit").value) || 0;
    const total = qty * price;
    document.getElementById("saleTotalDisplay").textContent = "RM " + total.toFixed(2);
}

function handleSaleSubmit(event) {
    event.preventDefault();

    const date         = document.getElementById("saleDate").value;
    const crop         = normalizeCropName(document.getElementById("saleCrop").value.trim());
    const qty          = document.getElementById("saleQty").value;
    const unit         = document.getElementById("saleUnit").value;
    const pricePerUnit = document.getElementById("salePricePerUnit").value;

    const cropEl  = document.getElementById("saleCrop");
    const qtyEl   = document.getElementById("saleQty");
    const priceEl = document.getElementById("salePricePerUnit");
    cropEl.classList.toggle("invalid",  !crop);
    qtyEl.classList.toggle("invalid",   !qty);
    priceEl.classList.toggle("invalid", !pricePerUnit);
    if (!crop || !qty || !pricePerUnit) {
        showToast("Please fill in all required fields.");
        return;
    }

    const totalRevenue = (parseFloat(qty) * parseFloat(pricePerUnit)).toFixed(2);

    const entry = {
        id:           "sale_" + Date.now(),
        date,
        crop,
        quantity:     qty,
        unit,
        pricePerUnit,
        totalRevenue,
        status:       "active"
    };

    // Write to Firestore (buffers offline, syncs on reconnect automatically).
    db.collection("sales").doc(entry.id).set(entry)
        .catch(e => console.error("addSale failed:", e));

    // Optimistic: prepend to sales cache
    const cached = localStorage.getItem(SALES_CACHE_KEY);
    const sales  = cached ? JSON.parse(cached) : [];
    sales.unshift(entry);
    localStorage.setItem(SALES_CACHE_KEY, JSON.stringify(sales));

    closeSaleModal();
    showToast(`Sale logged · ${qty} ${unit} ${crop} · RM ${totalRevenue}`);

    // Refresh activity tab if visible
    if (!document.getElementById("view-data").hidden) {
        renderCombinedActivity();
        renderFinancialSummary();
        renderCropPL();
    }
}

document.getElementById("saleModalOverlay").addEventListener("click", function(e) {
    if (e.target === this) closeSaleModal();
});

// --- 14. Formula Modal (Add / Edit / Delete) ---
let editingFormulaIndex = null;
let selectedCategoryColor = null;

function renderCategorySwatchPicker(currentCategory) {
    selectedCategoryColor = getCategoryColor(currentCategory);
    const container = document.getElementById("categorySwatchPicker");
    const noneHtml = `<button type="button" class="category-swatch none-swatch${!selectedCategoryColor ? " selected" : ""}" data-hex="" onclick="selectCategorySwatch(null)" aria-label="No color">✕</button>`;
    const swatchesHtml = CATEGORY_COLOR_PALETTE.map(hex => `
        <button type="button" class="category-swatch${selectedCategoryColor === hex ? " selected" : ""}"
            style="background:${hex}" data-hex="${hex}" onclick="selectCategorySwatch('${hex}')" aria-label="Choose color ${hex}"></button>
    `).join("");
    container.innerHTML = noneHtml + swatchesHtml;
}

function selectCategorySwatch(hex) {
    selectedCategoryColor = hex;
    document.querySelectorAll("#categorySwatchPicker .category-swatch").forEach(btn => {
        btn.classList.toggle("selected", (btn.dataset.hex || null) === (hex || null));
    });
}

function openFormulaModal(index = null) {
    editingFormulaIndex = index;
    const isEdit = index !== null;
    document.getElementById("formulaModalTitle").textContent = isEdit ? "Edit Formula" : "Add Formula";
    document.getElementById("formulaSubmitBtn").textContent  = isEdit ? "Save changes" : "Save formula";

    const f = isEdit ? formulasData[index] : null;
    document.getElementById("formulaName").value        = f ? f.name        : "";
    document.getElementById("formulaCategory").value   = f ? (f.category   || "") : "";
    document.getElementById("formulaDescription").value = f ? (f.description || "") : "";

    renderCategorySwatchPicker(f ? f.category : "");

    const rows = document.getElementById("ingredientRows");
    rows.innerHTML = "";
    const ingredients = f ? parseRecipe(f.recipe) : null;
    if (ingredients && ingredients.length) {
        ingredients.forEach(ing => addIngredientRow(ing.name, ing.amount, ing.unit));
    } else {
        addIngredientRow();
    }

    document.getElementById("formulaModalOverlay").classList.add("open");
}

function closeFormulaModal() {
    document.getElementById("formulaModalOverlay").classList.remove("open");
    editingFormulaIndex = null;
}

function addIngredientRow(name = "", amount = "", unit = "ml") {
    const rows = document.getElementById("ingredientRows");
    const row  = document.createElement("div");
    row.className = "ingredient-edit-row";
    row.innerHTML = `
        <input type="text"   class="ing-name"   placeholder="Ingredient" value="${escapeHtml(String(name))}" required>
        <input type="number" class="ing-amount"  placeholder="Amt" value="${escapeHtml(String(amount))}" inputmode="decimal" min="0" step="any" required>
        <select class="ing-unit">
            <option value="ml"${unit==="ml"?" selected":""}>ml</option>
            <option value="g"${unit==="g"?" selected":""}>g</option>
            <option value="L"${unit==="L"?" selected":""}>L</option>
            <option value="tsp"${unit==="tsp"?" selected":""}>tsp</option>
        </select>
        <button type="button" class="ing-remove-btn" onclick="this.parentElement.remove()">✕</button>`;
    rows.appendChild(row);
}

function serializeRecipe() {
    const rows = document.querySelectorAll("#ingredientRows .ingredient-edit-row");
    const parts = [];
    for (const row of rows) {
        const name   = row.querySelector(".ing-name").value.trim();
        const amount = row.querySelector(".ing-amount").value.trim();
        const unit   = row.querySelector(".ing-unit").value;
        if (name && amount) parts.push(`${name}:${amount}:${unit}`);
    }
    return parts.join("|");
}

async function handleFormulaSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("formulaName").value.trim();
    if (!name) { document.getElementById("formulaName").classList.add("invalid"); return; }

    const formula = {
        name,
        category:    document.getElementById("formulaCategory").value.trim(),
        description: document.getElementById("formulaDescription").value.trim(),
        recipe:      serializeRecipe()
    };

    if (formula.category) setCategoryColor(formula.category, selectedCategoryColor);

    const isEdit = editingFormulaIndex !== null;

    if (isEdit) {
        const updated = [...formulasData];
        updated[editingFormulaIndex] = { ...updated[editingFormulaIndex], ...formula };
        localStorage.setItem(FORMULAS_CACHE_KEY, JSON.stringify(updated));
        renderFormulas(updated);
        db.collection("formulas").doc(formulasData[editingFormulaIndex].id).update(formula)
            .catch(e => console.error("updateFormula failed:", e));
        showToast(`Formula updated`);
    } else {
        const newEntry = { id: "f_" + Date.now(), ...formula, status: "active" };
        const updated  = [newEntry, ...formulasData];
        localStorage.setItem(FORMULAS_CACHE_KEY, JSON.stringify(updated));
        renderFormulas(updated);
        db.collection("formulas").doc(newEntry.id).set(newEntry)
            .catch(e => console.error("addFormula failed:", e));
        showToast(`Formula added`);
    }

    closeFormulaModal();
}

function deleteFormula(index) {
    const f = formulasData[index];
    if (!confirm(`Delete "${f.name}"?`)) return;
    const updated = formulasData.filter((_, i) => i !== index);
    localStorage.setItem(FORMULAS_CACHE_KEY, JSON.stringify(updated));
    renderFormulas(updated);
    db.collection("formulas").doc(f.id).update({ status: "deleted" })
        .catch(e => console.error("deleteFormula failed:", e));
    showToast(`Formula deleted`);
}

// --- 15. Task Planning (Plan tab) ---
async function fetchTasks() {
    const cached = localStorage.getItem(TASKS_CACHE_KEY);
    if (cached) {
        try {
            tasksData = JSON.parse(cached)
                .filter(t => t && t.status !== "deleted")
                .map(t => ({ ...t, date: ymd(t.date) }));
            renderPlanView();
            renderTodayTasks();
        } catch (e) {
            renderPlanView();
            renderTodayTasks();
        }
    } else {
        // Instant first paint on cold cache: render empty plan schedule right away
        renderPlanView();
        renderTodayTasks();
    }

    if (!db) return;

    try {
        const snap = await db.collection("tasks").get();
        tasksData = snap.docs
            .map(d => ({ ...d.data() }))
            .filter(t => t && t.status !== "deleted")
            .map(t => ({ ...t, date: ymd(t.date) }));
        localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(tasksData));
        renderPlanView();
        if (typeof renderTodayTasks === "function") renderTodayTasks();
    } catch (e) {
        console.error("Could not load tasks from Firestore:", e);
        renderPlanView();
        if (typeof renderTodayTasks === "function") renderTodayTasks();
    }
}

// Forward-looking day label (today + weekday name) — distinct from the
// Activity tab's dateGroupLabel, which is backward-looking (Today/Yesterday
// only, no weekday for anything else). A week-ahead plan needs weekday names.
function planDayLabel(dateStr) {
    if (dateStr === todayString()) return "Today · " + shortDate(dateStr);
    const weekday = new Date(dateStr + "T00:00:00").toLocaleDateString("en-MY", { weekday: "short" });
    return weekday + " · " + shortDate(dateStr);
}

function resolveTaskScopeMeta(task) {
    if (!task || !task.bedNumber) return "Whole Farm";
    if (String(task.bedNumber).startsWith("plot_")) {
        const plot = getPlot(task.bedNumber);
        return plot ? `🗂️ ${plot.name}` : "Plot";
    }
    return `Bed ${task.bedNumber}`;
}

function renderTaskCard(task) {
    const formula = task.formulaId ? formulasData.find(f => String(f.id) === String(task.formulaId)) : null;
    const isDone  = task.status === "done";
    const color   = formula ? getCategoryColor(formula.category) : null;
    const tag     = formula && formula.category
        ? `<span class="tag"${color ? ` style="${tintStyle(color)}"` : ""}>${escapeHtml(formula.category)}</span>`
        : "";
    const slotPill = task.timeSlot && task.timeSlot !== "Anytime"
        ? `<span class="slot-pill">${escapeHtml(task.timeSlot)}</span>` : "";

    const title = formula ? formula.name : "Task";
    const descParts = [];
    if (formula && formula.description) descParts.push(formula.description);
    if (task.note) descParts.push(task.note);
    const desc = descParts.join(" — ");
    const scopeMeta = resolveTaskScopeMeta(task);
    const bedLine = `<p class="task-bed">${escapeHtml(scopeMeta)}</p>`;
    const execBtn = !isDone ? `
        <button type="button" class="task-exec-btn" onclick="executeTaskNow('${escapeHtml(String(task.id))}', event)">
            ⚡ Log &amp; Mark Done
        </button>` : "";

    return `
    <div class="task-card">
        <button class="task-check${isDone ? " done" : ""}" onclick="toggleTaskDone('${escapeHtml(String(task.id))}')">${isDone ? "✓" : ""}</button>
        <div class="task-main">
            <div class="task-top-row">${slotPill}${tag}</div>
            <p class="task-title${isDone ? " done-text" : ""}">${escapeHtml(title)}</p>
            ${desc ? `<p class="task-desc">${escapeHtml(desc)}</p>` : ""}
            ${bedLine}
            ${execBtn}
        </div>
    </div>`;
}

// --- 1-Tap Task Execution ---
async function executeTaskNow(taskId, event) {
    if (event) event.stopPropagation();
    const task = tasksData.find(t => String(t.id) === String(taskId));
    if (!task) return;

    const formula = task.formulaId ? formulasData.find(f => String(f.id) === String(task.formulaId)) : null;
    const activity = task.activityCategory || (formula ? "pest_control" : "watering");
    const date = todayString();
    const scope = task.bedNumber || "all";
    const logId = "log_" + Date.now();

    let inputsUsed = task.note || "";
    if (formula) {
        const ingredients = parseRecipe(formula.recipe);
        if (ingredients) {
            const parts = ingredients.map(ing => {
                const total = ing.amount * 16;
                const calc = ing.unit === 'g' ? total.toFixed(1).replace(/\.0$/, '') : (Number.isInteger(total) ? String(total) : total.toFixed(1).replace(/\.0$/, ''));
                return `${ing.name}: ${calc}${ing.unit}`;
            });
            inputsUsed = `${formula.name} — 16L sprayer\n${parts.join(", ")}` + (task.note ? `\n${task.note}` : "");
        } else {
            inputsUsed = formula.name + (task.note ? ` — ${task.note}` : "");
        }
    }

    const logEntry = {
        id: logId,
        date,
        activityCategory: activity,
        bedNumber: scope,
        cropName: (() => {
            if (scope === "all") return "";
            if (String(scope).startsWith("plot_")) {
                const names = new Set();
                bedsInPlot(scope).forEach(b => b.crops.forEach(c => names.add(c.cropName)));
                return [...names].join(", ");
            }
            const bed = getBed(scope);
            return bed && bed.crops.length ? bed.crops.map(c => c.cropName).join(", ") : "";
        })(),
        inputsUsed,
        costRM: "",
        revenueRM: "",
        weight: "",
        status: "active"
    };

    // 1. Optimistic log insert
    const cachedLogs = JSON.parse(localStorage.getItem(LOGS_CACHE_KEY) || "[]");
    cachedLogs.unshift(logEntry);
    localStorage.setItem(LOGS_CACHE_KEY, JSON.stringify(cachedLogs));

    // 2. Mark task as done
    task.status = "done";
    localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(tasksData));
    renderPlanView();
    if (typeof renderTodayTasks === "function") renderTodayTasks();

    // 3. Update bed status
    if (String(scope).startsWith("plot_")) {
        const members = bedsInPlot(scope);
        members.forEach(b => {
            b.lastActivity = { type: activity, date };
            const bedUpdate = { lastActivity: { type: activity, date } };
            if (activity === "watering") {
                b.lastWatered = date;
                bedUpdate.lastWatered = date;
            }
            if (db) db.collection("beds").doc(String(b.bedNumber)).update(bedUpdate).catch(e => console.error(e));
        });
        saveBeds();
        renderBeds(bedsData);
    } else if (scope !== "all") {
        const bed = getBed(scope);
        if (bed) {
            bed.lastActivity = { type: activity, date };
            const bedUpdate = { lastActivity: { type: activity, date } };
            if (activity === "watering") {
                bed.lastWatered = date;
                bedUpdate.lastWatered = date;
            }
            saveBeds();
            renderBeds(bedsData);
            if (db) db.collection("beds").doc(String(scope)).update(bedUpdate).catch(e => console.error(e));
        }
    }

    // 4. Cloud sync
    if (db) {
        db.collection("logs").doc(logId).set(logEntry).catch(e => console.error(e));
        db.collection("tasks").doc(String(task.id)).update({ status: "done" }).catch(e => console.error(e));
    }

    const scopeLabel = resolveTaskScopeMeta(task);
    showToast(`⚡ 1-Tap Logged: ${CATEGORY_LABEL[activity] || activity} · ${scopeLabel}`);
}

function renderPlanView() {
    const container = document.getElementById("planTaskList");
    if (!container) return;

    const start = new Date(); start.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        days.push(localDateStr(d));
    }
    const today   = days[0];
    const lastDay = days[6];

    const byDate = {};
    tasksData.forEach(t => {
        if (!byDate[t.date]) byDate[t.date] = [];
        byDate[t.date].push(t);
    });

    const slotSort = (a, b) =>
        (TIME_SLOT_ORDER[a.timeSlot] ?? 3) - (TIME_SLOT_ORDER[b.timeSlot] ?? 3);

    // Past-dated tasks that were never completed — without this they'd vanish
    // from every view the day after, looking like they were never saved.
    const overdueDates = Object.keys(byDate)
        .filter(d => d && d < today && byDate[d].some(t => t.status !== "done"))
        .sort();
    const overdueHtml = overdueDates.map(dateStr => {
        const pending = byDate[dateStr].filter(t => t.status !== "done").sort(slotSort);
        return `<div class="day-heading overdue-heading">Overdue · ${planDayLabel(dateStr)}</div>`
            + pending.map(renderTaskCard).join("");
    }).join("");

    const weekHtml = days.map(dateStr => {
        const dayTasks = (byDate[dateStr] || []).slice().sort(slotSort);
        const heading = `<div class="day-heading">${planDayLabel(dateStr)}</div>`;
        if (!dayTasks.length) return heading + `<div class="empty-day">Nothing planned</div>`;
        return heading + dayTasks.map(renderTaskCard).join("");
    }).join("");

    // Tasks planned past the visible week — shown so a far-future date never
    // looks like a failed save.
    const laterDates = Object.keys(byDate).filter(d => d > lastDay).sort();
    const laterHtml = laterDates.map(dateStr => {
        const dayTasks = byDate[dateStr].slice().sort(slotSort);
        return `<div class="day-heading">${planDayLabel(dateStr)}</div>`
            + dayTasks.map(renderTaskCard).join("");
    }).join("");

    container.innerHTML = overdueHtml + weekHtml + laterHtml;
}

// --- Today's Tasks (Home) — compact glance list, not the full detail view ---
function renderTodayTaskRow(task) {
    const formula = task.formulaId ? formulasData.find(f => String(f.id) === String(task.formulaId)) : null;
    const isDone  = task.status === "done";
    const color   = formula ? getCategoryColor(formula.category) : null;
    const icon    = CATEGORY_ICON[task.activityCategory] || "📝";
    const title   = formula ? formula.name : (task.note || "Task");
    const bedMeta = resolveTaskScopeMeta(task);
    const slotShort = task.timeSlot && task.timeSlot !== "Anytime" ? TIME_SLOT_SHORT[task.timeSlot] : "";
    const meta = slotShort ? `${bedMeta} · ${slotShort}` : bedMeta;
    const execMini = !isDone ? `
        <button type="button" class="task-row-exec" onclick="executeTaskNow('${escapeHtml(String(task.id))}', event)">
            ⚡ Log
        </button>` : "";

    return `
    <div class="task-row${isDone ? " is-done" : ""}" style="border-left-color:${color || "var(--color-border)"};">
        <button class="task-check-mini${isDone ? " done" : ""}" onclick="toggleTaskDone('${escapeHtml(String(task.id))}')"><span class="check-dot">${isDone ? "✓" : ""}</span></button>
        <span class="task-row-icon">${icon}</span>
        <span class="task-row-title${isDone ? " done-text" : ""}">${escapeHtml(title)}</span>
        <span class="task-row-meta">${escapeHtml(meta)}</span>
        ${execMini}
    </div>`;
}

function renderTodayTasks() {
    const container  = document.getElementById("todayTasksList");
    const dateLabel  = document.getElementById("todayTasksDate");
    if (!container) return;
    if (dateLabel) dateLabel.textContent = shortDate(todayString());

    const today = todayString();
    const todays = tasksData
        .filter(t => t.date === today)
        .sort((a, b) => (TIME_SLOT_ORDER[a.timeSlot] ?? 3) - (TIME_SLOT_ORDER[b.timeSlot] ?? 3))
        // Stable sort (ES2019+): pending tasks stay first, completed ones sink
        // to the bottom without losing their time-slot order within each group.
        .sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0));

    if (!todays.length) {
        container.innerHTML = '<div class="empty-today">Nothing planned for today</div>';
        return;
    }
    container.innerHTML = `<div class="today-list">${todays.map(renderTodayTaskRow).join("")}</div>`;
}

function toggleTaskDone(taskId) {
    const task = tasksData.find(t => String(t.id) === String(taskId));
    if (!task) return;
    const newStatus = task.status === "done" ? "active" : "done";
    task.status = newStatus;
    localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(tasksData));
    renderPlanView();
    if (typeof renderTodayTasks === "function") renderTodayTasks();
    db.collection("tasks").doc(String(task.id)).update({ status: newStatus })
        .catch(e => console.error("updateTaskStatus failed:", e));
}

function selectTaskSlot(btn) {
    document.querySelectorAll("#taskSlotRow .pill-choice").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
}

function selectTaskFormula(id) {
    selectedTaskFormulaId = selectedTaskFormulaId === id ? null : id;
    populateTaskFormulaList();
}

function populateTaskFormulaList() {
    const container = document.getElementById("taskFormulaList");
    if (!formulasData.length) {
        container.innerHTML = '<p style="color:#888;font-size:13px;padding:6px 0;">No formulas yet.</p>';
        return;
    }
    container.innerHTML = formulasData.map(f => `
        <div class="formula-pick-item${selectedTaskFormulaId === f.id ? " selected" : ""}" onclick="selectTaskFormula('${escapeHtml(String(f.id))}')">
            <span class="formula-pick-name">${escapeHtml(f.name)}</span>
            ${f.category ? `<span class="formula-pick-cat">${escapeHtml(f.category)}</span>` : ""}
        </div>`
    ).join("");
}

function openTaskModal() {
    document.getElementById("taskDate").value = todayString();
    document.getElementById("taskNote").value = "";
    document.getElementById("taskRepeat").checked = false;
    document.getElementById("taskActivityCategory").value = "";
    document.getElementById("taskDate").classList.remove("invalid");
    selectedTaskFormulaId = null;

    document.querySelectorAll("#taskSlotRow .pill-choice").forEach(b =>
        b.classList.toggle("selected", b.dataset.slot === "Anytime")
    );

    const plotGroup = document.getElementById("taskPlotScopeGroup");
    const bedGroup  = document.getElementById("taskBedScopeGroup");
    if (plotGroup && bedGroup) {
        plotGroup.innerHTML = "";
        bedGroup.innerHTML  = "";
        plotsData.forEach(plot => {
            const opt = document.createElement("option");
            opt.value = plot.id;
            opt.textContent = plot.name;
            plotGroup.appendChild(opt);
        });
        bedsData.forEach(bed => {
            const opt = document.createElement("option");
            opt.value = bed.bedNumber;
            opt.textContent = "Bed " + bed.bedNumber;
            bedGroup.appendChild(opt);
        });
    } else {
        const bedSelect = document.getElementById("taskBed");
        while (bedSelect.options.length > 1) bedSelect.remove(1);
        bedsData.forEach(bed => {
            const opt = document.createElement("option");
            opt.value = bed.bedNumber;
            opt.textContent = "Bed " + bed.bedNumber;
            bedSelect.appendChild(opt);
        });
    }

    populateTaskFormulaList();

    document.getElementById("taskModalOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
}

function closeTaskModal() {
    document.getElementById("taskModalOverlay").classList.remove("open");
    document.body.style.overflow = "";
}

document.getElementById("taskModalOverlay").addEventListener("click", function (e) {
    if (e.target === this) closeTaskModal();
});

function handleTaskSubmit(event) {
    event.preventDefault();

    const date = document.getElementById("taskDate").value;
    document.getElementById("taskDate").classList.toggle("invalid", !date);
    if (!date) {
        showToast("Please pick a date.");
        return;
    }

    const slotBtn  = document.querySelector("#taskSlotRow .pill-choice.selected");
    const timeSlot = slotBtn ? slotBtn.dataset.slot : "Anytime";
    const bedNumber = document.getElementById("taskBed").value;
    const activityCategory = document.getElementById("taskActivityCategory").value;
    const note   = document.getElementById("taskNote").value.trim();
    const repeat = document.getElementById("taskRepeat").checked;

    const dayCount   = repeat ? 7 : 1;
    const startDate  = new Date(date + "T00:00:00");

    for (let i = 0; i < dayCount; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const newTask = {
            id:               "task_" + Date.now() + "_" + i,
            date:             localDateStr(d),
            timeSlot,
            bedNumber,
            activityCategory,
            formulaId:        selectedTaskFormulaId || "",
            note,
            status:           "active"
        };
        tasksData.push(newTask);
        db.collection("tasks").doc(newTask.id).set(newTask)
            .catch(e => console.error("addTask failed:", e));
    }

    localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(tasksData));
    renderPlanView();
    if (typeof renderTodayTasks === "function") renderTodayTasks();
    closeTaskModal();
    showToast(repeat ? "Tasks added for the week" : "Task added");
}

// --- 16. Plots (group beds for bulk logging + a collapsed Home view) ---
let editingPlotId = null;
let currentPlotId = null; // which plot's detail sheet is currently open

function openPlotAssignModal(plotId = null) {
    editingPlotId = plotId;
    const plot = plotId ? getPlot(plotId) : null;
    document.getElementById("plotModalTitle").textContent = plot ? "Edit Plot" : "New Plot";
    document.getElementById("plotSubmitBtn").textContent  = plot ? "Save changes" : "Save plot";
    document.getElementById("plotName").value = plot ? plot.name : "";
    document.getElementById("plotName").classList.remove("invalid");

    // Checklist of every bed — pre-checked if already in this plot. A bed
    // currently in a DIFFERENT plot still shows, with a small note, since
    // checking it here moves it (exclusive membership).
    const list = document.getElementById("plotBedChecklist");
    list.innerHTML = bedsData.map(b => {
        const checked = plotId && String(b.plotId || "") === String(plotId);
        const otherPlot = b.plotId && String(b.plotId) !== String(plotId) ? getPlot(b.plotId) : null;
        const note = otherPlot ? ` <span style="color:#888;">(currently in ${escapeHtml(otherPlot.name)})</span>` : "";
        return `
        <label class="harvest-crop-check">
            <input type="checkbox" name="plotBed" value="${escapeHtml(String(b.bedNumber))}"${checked ? " checked" : ""}>
            <span>Bed ${escapeHtml(String(b.bedNumber))}${b.name ? " · " + escapeHtml(b.name) : ""}${note}</span>
        </label>`;
    }).join("");

    document.getElementById("plotModalOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
}

function closePlotAssignModal() {
    document.getElementById("plotModalOverlay").classList.remove("open");
    document.body.style.overflow = "";
    editingPlotId = null;
}

document.getElementById("plotModalOverlay").addEventListener("click", function (e) {
    if (e.target === this) closePlotAssignModal();
});

function handlePlotSubmit(event) {
    event.preventDefault();
    const name = document.getElementById("plotName").value.trim();
    if (!name) {
        document.getElementById("plotName").classList.add("invalid");
        return;
    }

    const checkedBeds = [...document.querySelectorAll('input[name="plotBed"]:checked')].map(cb => cb.value);

    const isEdit = editingPlotId !== null;
    const plotId = isEdit ? editingPlotId : "plot_" + Date.now();

    if (isEdit) {
        const plot = getPlot(plotId);
        if (plot) plot.name = name;
        db.collection("plots").doc(plotId).update({ name })
            .catch(e => console.error("renamePlot failed:", e));
    } else {
        plotsData.push({ id: plotId, name, status: "active" });
        db.collection("plots").doc(plotId).set({ id: plotId, name, status: "active" })
            .catch(e => console.error("addPlot failed:", e));
    }
    localStorage.setItem(PLOTS_CACHE_KEY, JSON.stringify(plotsData));

    // Optimistic bed reassignment.
    bedsData.forEach(b => {
        const isChecked = checkedBeds.includes(String(b.bedNumber));
        const wasInThisPlot = String(b.plotId || "") === String(plotId);
        if (isChecked) {
            b.plotId = plotId;
            db.collection("beds").doc(String(b.bedNumber)).update({ plotId })
                .catch(e => console.error("assignBedToPlot failed:", e));
        } else if (wasInThisPlot) {
            b.plotId = "";
            db.collection("beds").doc(String(b.bedNumber)).update({ plotId: "" })
                .catch(e => console.error("removeBedFromPlot failed:", e));
        }
    });
    saveBeds();

    renderBeds(bedsData);
    populateBedDropdown();
    closePlotAssignModal();
    showToast(isEdit ? "Plot updated" : "Plot created");
}

function openPlotDetail(plotId) {
    currentPlotId = plotId;
    const plot = getPlot(plotId);
    document.getElementById("plotDetailTitle").textContent = plot ? plot.name : "Plot";

    const members = bedsInPlot(plotId);
    const content = document.getElementById("plotDetailContent");
    content.innerHTML = members.length ? members.map(b => `
        <div class="bed-detail-row" style="cursor:pointer;" onclick="openBedFromPlot('${escapeHtml(String(plotId))}', ${b.bedNumber})">
            <div class="bed-detail-info">
                <p class="bed-detail-name">Bed ${escapeHtml(String(b.bedNumber))}${b.name ? " · " + escapeHtml(b.name) : ""}</p>
                <p class="bed-detail-meta">${b.crops.length} crop${b.crops.length === 1 ? "" : "s"}</p>
            </div>
            <span class="bed-chevron">›</span>
        </div>`).join("") : '<p style="color:#888;padding:12px 0;">No beds assigned yet.</p>';

    document.getElementById("plotDetailOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
}

function closePlotDetail() {
    document.getElementById("plotDetailOverlay").classList.remove("open");
    document.body.style.overflow = "";
    currentPlotId = null;
}

document.getElementById("plotDetailOverlay").addEventListener("click", function (e) {
    if (e.target === this) closePlotDetail();
});

function deletePlot() {
    const plot = getPlot(currentPlotId);
    if (!plot) return;
    if (!confirm(`Delete plot "${plot.name}"? Beds keep their own data but leave the plot.`)) return;

    const plotId = currentPlotId;
    plotsData = plotsData.filter(p => String(p.id) !== String(plotId));
    localStorage.setItem(PLOTS_CACHE_KEY, JSON.stringify(plotsData));
    bedsData.forEach(b => { if (String(b.plotId || "") === String(plotId)) b.plotId = ""; });
    saveBeds();

    db.collection("plots").doc(plotId).update({ status: "deleted" })
        .catch(e => console.error("deletePlot failed:", e));
    renderBeds(bedsData);
    populateBedDropdown();
    closePlotDetail();
    showToast("Plot deleted");
}

// Trigger quick logging directly for an entire plot from inside the Plot Detail sheet
function logForPlot(type) {
    const plotId = currentPlotId;
    if (!plotId) return;
    closePlotDetail();

    if (type === "spray") {
        openModal("pest");
        document.getElementById("bedScope").value = plotId;
        updateBedFields();
        if (document.getElementById("inputsField").hidden) toggleInputs();
        toggleFormulaPicker();
    } else {
        openModal(type);
        document.getElementById("bedScope").value = plotId;
        updateBedFields();
    }
}

// Helper: open a bed detail from inside a plot detail sheet.
// Avoids inline assignment of module-scoped variable in onclick HTML.
function openBedFromPlot(plotId, bedNum) {
    bedDetailReturnPlotId = plotId;
    closePlotDetail();
    openBedDetail(bedNum);
}

// --- 17. App Initialization ---
// Refresh the sync badge whenever connectivity changes.
window.addEventListener("online",  updateSyncBadge);
window.addEventListener("offline", updateSyncBadge);

document.addEventListener("DOMContentLoaded", async () => {
    updateSyncBadge();

    // Wire UI event listeners immediately so navigation and modals are always responsive.
    document.getElementById("activityCategory")?.addEventListener("change", updateBedFields);
    document.getElementById("bedScope")?.addEventListener("change", updateBedFields);

    document.querySelectorAll(".nav-btn[data-view]").forEach(btn => {
        btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    // Verify PIN and load farm data
    const authed = await checkPin();
    if (authed) {
        fetchBeds();
        fetchFormulas();
        fetchTasks();
        fetchPlots();
    }
    fetchWeather(); // third-party API, independent of Firebase auth

    // Pull-to-refresh
    const mainEl = document.querySelector("main");
    let ptr_startY = 0;
    let ptr_active = false;
    const PTR_THRESHOLD = 80;

    mainEl.addEventListener("touchstart", e => {
        if (mainEl.scrollTop === 0) {
            ptr_startY = e.touches[0].clientY;
            ptr_active = true;
        }
    }, { passive: true });

    mainEl.addEventListener("touchmove", e => {
        if (!ptr_active) return;
        const pull = e.touches[0].clientY - ptr_startY;
        const indicator = document.getElementById("ptrIndicator");
        if (pull > 0 && pull < PTR_THRESHOLD + 20) {
            indicator.style.height = Math.min(pull * 0.6, 44) + "px";
            indicator.style.opacity = Math.min(pull / PTR_THRESHOLD, 1);
        }
    }, { passive: true });

    mainEl.addEventListener("touchend", e => {
        if (!ptr_active) return;
        ptr_active = false;
        const pull = e.changedTouches[0].clientY - ptr_startY;
        const indicator = document.getElementById("ptrIndicator");
        indicator.style.height = "0";
        indicator.style.opacity = "0";
        if (pull >= PTR_THRESHOLD) {
            fetchBeds();
            fetchFormulas();
            fetchLogs();
            fetchTasks();
            fetchPlots();
            fetchWeather();
        }
    }, { passive: true });

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js")
            .then(reg => {
                console.log("SW registered:", reg.scope);
                reg.update();
            })
            .catch(err => console.error("SW registration failed:", err));
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            document.getElementById("updateBanner").hidden = false;
        });
    }
});
