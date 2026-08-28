// ============================================================================
// Kabun Farm Intelligence — Core State, Constants & Pure Utilities
// Module: js/state.js
// ============================================================================

export const STORAGE_KEY        = "offline_farm_logs";   // legacy
export const BEDS_CACHE_KEY     = "farmlog_beds_cache";
export const FORMULAS_CACHE_KEY = "farmlog_formulas_cache";
export const LOGS_CACHE_KEY     = "farmlog_logs_cache";
export const SALES_CACHE_KEY    = "farmlog_sales_cache";
export const LAST_BED_KEY       = "farmlog_last_bed";
export const BED_MAX_KEY        = "farmlog_bed_max";
export const AUTH_TOKEN_KEY     = "farmlog_auth_token";
export const CATEGORY_COLOR_KEY = "farmlog_category_colors";
export const WEATHER_CACHE_KEY  = "farmlog_weather_cache";
export const TASKS_CACHE_KEY    = "farmlog_tasks_cache";
export const PLOTS_CACHE_KEY    = "farmlog_plots_cache";

// Kudat, Sabah — farm coordinates (6°49'42.5"N 116°45'56.8"E)
export const FARM_LAT = 6.828472;
export const FARM_LON = 116.765778;
export const WEATHER_URL = `https://api.open-meteo.com/v1/forecast?latitude=${FARM_LAT}&longitude=${FARM_LON}&timezone=auto&current=temperature_2m,weather_code&daily=precipitation_probability_max,weather_code&forecast_days=4`;

export const CATEGORY_COLOR_PALETTE = [
    "#0072b3", // blue
    "#b3261e", // red
    "#a3690b", // amber
    "#7b4fb5", // purple
    "#0f8a8a", // teal
    "#c2185b", // pink
    "#4b3f9e", // indigo
    "#55606e"  // slate
];

export const DEFAULT_CATEGORY_COLORS = {
    biological:  "#0f8a8a", // teal
    botanical:   "#a3690b", // amber
    nutrition:   "#1a8f3c", // green
    fungicide:   "#7b4fb5", // purple
    insecticide: "#b3261e"  // red
};

export const MODAL_TITLES = {
    water:   "Irrigation / Fertigation",
    pest:    "Pest Control",
    harvest: "Harvest",
    crop:    "Sow Crop"
};

export const DEFAULT_CATEGORY = {
    water:   "watering",
    pest:    "pest_control",
    harvest: "harvest",
    crop:    "sowing"
};

export const CATEGORY_ICON  = { watering: "💧", pest_control: "🐛", harvest: "🧺", sowing: "🌱", sale: "💰" };
export const CATEGORY_LABEL = { watering: "Watering", pest_control: "Pest Control", harvest: "Harvest", sowing: "Sowing", sale: "Sale" };
export const TIME_SLOT_ORDER = { Morning: 0, Afternoon: 1, Evening: 2, Anytime: 3 };
export const TIME_SLOT_SHORT = { Morning: "Morn", Afternoon: "Aft", Evening: "Eve", Anytime: "Any" };

export const DEFAULT_FORMULAS = [
    {
        id: "f_bio_shield",
        name: "Weekly Preventive Bio-Shield",
        category: "Biological",
        description: "General organic preventive shield against whiteflies, aphids, thrips, and foliar fungal spores. Apply late evening (>5:30 PM).",
        recipe: "KMB Bio Botava:2.5:ml|Garlic Oil Extract:1.5:ml|Wood Vinegar:2:ml",
        status: "active"
    },
    {
        id: "f_veg_boost",
        name: "Vegetative & Stress Recovery Mix",
        category: "Nutrition",
        description: "Foliar amino acid & cytokinin boost for vigorous leafy vegetative growth, transplant recovery, and post-stress revival.",
        recipe: "KMB Amino 18:2:ml|Seaweed Extract:1.5:ml",
        status: "active"
    },
    {
        id: "f_bloom_set",
        name: "Bloom & Fruit Set Booster",
        category: "Nutrition",
        description: "Prevents blossom end rot and fruit drop; reinforces plant cell walls and flowering retention in fruiting crops.",
        recipe: "Wira CalBo:2:ml|Seaweed Extract:1:ml",
        status: "active"
    },
    {
        id: "f_caterpillar_guard",
        name: "Caterpillar & Borer Contact Spray",
        category: "Botanical",
        description: "Targeted contact deterrent for leaf-eating caterpillars, armyworms, flea beetles, and diamondback moths.",
        recipe: "KMB Pest Guard 2:3:ml|Garlic Oil Extract:1.5:ml",
        status: "active"
    },
    {
        id: "f_mite_neem",
        name: "Mite & Sucking Pest Knockdown",
        category: "Botanical",
        description: "Organic emulsion for spider mites, whiteflies, and aphids. Spray under leaves late in the evening.",
        recipe: "Neem Oil:5:ml|Garlic Oil Extract:1.5:ml",
        status: "active"
    },
    {
        id: "f_fungal_shield",
        name: "Fungal Shield (Antracol Protectant)",
        category: "Fungicide",
        description: "FRAC M02 multi-site protectant for anthracnose and leaf spots. Notice: 7-day Pre-Harvest Interval (PHI).",
        recipe: "Antracol:2:g",
        status: "active"
    }
];

export const DEFAULT_INVENTORY = [
    // Foliar & Botanical Bio Protectants (User Exact Pricing)
    { id: "bio_botava", name: "KMB Bio Botava", category: "foliar", packPrice: 94.00, packSize: 1000, unit: "ml", costPerUnit: 0.094 },
    { id: "amino_18", name: "KMB Amino 18", category: "foliar", packPrice: 35.00, packSize: 1000, unit: "ml", costPerUnit: 0.035 },
    { id: "garlic_oil", name: "Garlic Oil Extract", category: "foliar", packPrice: 35.00, packSize: 1000, unit: "ml", costPerUnit: 0.035 },
    { id: "neem_oil", name: "Neem Oil", category: "foliar", packPrice: 34.00, packSize: 1000, unit: "ml", costPerUnit: 0.034 },
    { id: "wood_vinegar", name: "Wood Vinegar", category: "foliar", packPrice: 18.00, packSize: 1000, unit: "ml", costPerUnit: 0.018 },
    { id: "seaweed", name: "Seaweed Extract", category: "foliar", packPrice: 60.00, packSize: 1000, unit: "ml", costPerUnit: 0.060 },
    { id: "pest_guard_2", name: "KMB Pest Guard 2", category: "foliar", packPrice: 75.00, packSize: 1000, unit: "ml", costPerUnit: 0.075 },
    { id: "wira_calbo", name: "Wira CalBo", category: "foliar", packPrice: 45.00, packSize: 1000, unit: "ml", costPerUnit: 0.045 },
    { id: "antracol", name: "Antracol 70 WP", category: "foliar", packPrice: 45.00, packSize: 1000, unit: "g", costPerUnit: 0.045 },
    { id: "em4", name: "EM4", category: "foliar", packPrice: 25.00, packSize: 1000, unit: "ml", costPerUnit: 0.025 },
    { id: "abamectin", name: "Abamectin", category: "foliar", packPrice: 38.00, packSize: 1000, unit: "ml", costPerUnit: 0.038 },
    { id: "cypermethrin", name: "Cypermethrin", category: "foliar", packPrice: 35.00, packSize: 1000, unit: "ml", costPerUnit: 0.035 },

    // Granular & Soil Fertilizers
    { id: "npk_11_11_11", name: "RealStrong NPK 11-11-11", category: "fertilizer", packPrice: 115.00, packSize: 25, unit: "kg", costPerUnit: 4.60 },
    { id: "npk_8_8_29", name: "RealStrong NPK 8-8-29", category: "fertilizer", packPrice: 140.00, packSize: 25, unit: "kg", costPerUnit: 5.60 },
    { id: "bluvita_16_16_16", name: "Bluvita NPK 16-16-16", category: "fertilizer", packPrice: 185.00, packSize: 50, unit: "kg", costPerUnit: 3.70 },
    { id: "dolomite", name: "Dolomite (Kapur Pertanian)", category: "fertilizer", packPrice: 20.00, packSize: 25, unit: "kg", costPerUnit: 0.80 }
];

// --- Mutable Runtime State Store ---
export const state = {
    bedsData: [],
    formulasData: [],
    tasksData: [],
    plotsData: [],
    inventoryData: [],
    expensesData: [],
    selectedTaskFormulaId: null,
    selectedQuickFormulaId: null,
    maxBedNumber: (typeof localStorage !== "undefined" ? parseInt(localStorage.getItem(BED_MAX_KEY), 10) : 0) || 0,
    selectedBedForLog: null,
    addBedPending: false,
    activeLogFilter: "all",
    activeTypeFilter: "all",
    finPeriod: "week",
    bedViewMode: (typeof localStorage !== "undefined" ? localStorage.getItem("farmlog_view_mode") : "list") || "list",
    lastWeatherData: null,
    editingFormulaIndex: null,
    selectedCategoryColor: null,
    editingPlotId: null,
    currentPlotId: null,
    bedDetailReturnPlotId: null,
    archivedBedsData: [],
    showCompletedTasks: false,
    expandedPlots: {},
    lastAutoPopulatedFormulaText: null
};

export function findNextAvailableBedNumber(bedsList) {
    const list = bedsList || state.bedsData || [];
    const existing = new Set(list.map(b => Number(b.bedNumber)).filter(n => !isNaN(n) && n > 0));
    let num = 1;
    while (existing.has(num)) {
        num++;
    }
    return num;
}

// --- String & Date Utilities ---
export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function localDateStr(d) {
    return d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");
}

export function ymd(dateStr) {
    if (!dateStr) return "";
    const s = String(dateStr);
    if (s.length <= 10) return s;
    const d = new Date(s);
    return isNaN(d) ? s.slice(0, 10) : localDateStr(d);
}

export function todayString() {
    return localDateStr(new Date());
}

export function daysSince(dateStr) {
    const planted = new Date(ymd(dateStr) + "T00:00:00");
    const today   = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today - planted) / 86400000);
}

export function daysAgoStr(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return localDateStr(d);
}

export function shortDate(dateStr) {
    const d = new Date(ymd(dateStr) + "T00:00:00");
    return d.toLocaleDateString("en-MY", { month: "short", day: "numeric" });
}

export function dateGroupLabel(dateStr) {
    const today     = todayString();
    const d         = new Date(); d.setDate(d.getDate() - 1);
    const yesterday = localDateStr(d);
    if (dateStr === today)     return "Today · "     + shortDate(dateStr);
    if (dateStr === yesterday) return "Yesterday · " + shortDate(dateStr);
    return shortDate(dateStr);
}

export function getKnownCropNames() {
    const names = new Set();
    const list = (typeof window !== "undefined" && window.bedsData) || state.bedsData;
    list.forEach(b => {
        (b.crops || []).forEach(c => c.cropName && names.add(c.cropName));
        (b.cropHistory || []).forEach(c => c.cropName && names.add(c.cropName));
    });
    const sales = JSON.parse(localStorage.getItem(SALES_CACHE_KEY) || "[]");
    sales.forEach(s => s.crop && names.add(s.crop));
    return [...names].sort();
}

export function normalizeCropName(typed) {
    const trimmed = String(typed || "").trim();
    if (!trimmed) return trimmed;
    const match = getKnownCropNames().find(n => n.toLowerCase() === trimmed.toLowerCase());
    return match || trimmed;
}

export function normalizeCategoryKey(name) {
    return String(name || "").trim().toLowerCase();
}

export function getCategoryColorMap() {
    try { return JSON.parse(localStorage.getItem(CATEGORY_COLOR_KEY) || "{}"); }
    catch (e) { return {}; }
}

export function getCategoryColor(categoryName) {
    if (!categoryName) return null;
    const key = normalizeCategoryKey(categoryName);
    const custom = getCategoryColorMap();
    if (custom[key]) return custom[key];
    if (DEFAULT_CATEGORY_COLORS[key]) return DEFAULT_CATEGORY_COLORS[key];
    return null;
}

export function tintStyle(hex) {
    if (!hex) return "";
    return `background:${hex}22;color:${hex};border-color:${hex}66`;
}

export function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
}

export function weatherIcon(code) {
    if (code === 0) return "☀️";
    if (code >= 1 && code <= 3) return "⛅";
    if (code === 45 || code === 48) return "🌫️";
    if ((code >= 51 && code <= 65) || (code >= 80 && code <= 82)) return "🌧️";
    if (code >= 95) return "⛈️";
    return "⛅";
}

export function lastActivityLabel(lastActivity) {
    if (!lastActivity || !lastActivity.date) return null;
    const label = CATEGORY_LABEL[lastActivity.type] || lastActivity.type;
    const days  = daysSince(lastActivity.date);
    if (days === 0) return `Last: ${label} today`;
    if (days === 1) return `Last: ${label} yesterday`;
    return `Last: ${label} ${days}d ago`;
}

export function resolveTaskScopeMeta(task) {
    const raw = task?.bedNumber ?? task?.bedScope;
    if (!raw) return "Whole Farm";
    const bn = String(raw).trim();
    if (!bn || bn.toLowerCase() === "all" || bn.toLowerCase() === "whole farm") return "Whole Farm";
    if (bn.startsWith("plot_")) {
        const plot = getPlot(bn);
        return plot ? `🗂️ ${plot.name}` : "Plot";
    }
    if (/^(plot|blok|block)\b/i.test(bn)) {
        return `🗂️ ${bn}`;
    }
    const cleanNum = bn.replace(/^(?:batas|bed|no\.?)\s*/i, "");
    return `Bed ${cleanNum}`;
}

export function resolveLogScopeLabel(log) {
    const raw = log?.bedNumber ?? log?.bedScope;
    if (!raw) return "Whole Farm";
    const bn = String(raw).trim();
    if (!bn || bn.toLowerCase() === "all" || bn.toLowerCase() === "whole farm") return "Whole Farm";
    if (bn.startsWith("plot_")) {
        const plot = getPlot(bn);
        return plot ? plot.name : "Plot (deleted)";
    }
    if (/^(plot|blok|block)\b/i.test(bn)) {
        return bn;
    }
    const cleanNum = bn.replace(/^(?:batas|bed|no\.?)\s*/i, "");
    return `Bed ${cleanNum}`;
}

// Bed & Plot Finders
export function getBed(bedNumber) {
    if (bedNumber === null || bedNumber === undefined) return undefined;
    const rawStr = String(bedNumber).trim();
    if (!rawStr) return undefined;
    const cleanStr = rawStr.replace(/^(?:batas|bed|no\.?)\s*/i, "").trim();
    const list = (typeof window !== "undefined" && Array.isArray(window.bedsData) && window.bedsData.length) ? window.bedsData : state.bedsData;
    let found = list.find(b => String(b.bedNumber) === cleanStr || String(b.bedNumber) === rawStr);
    if (!found && typeof localStorage !== "undefined") {
        try {
            const cached = JSON.parse(localStorage.getItem(BEDS_CACHE_KEY) || "[]");
            found = cached.find(b => String(b.bedNumber) === cleanStr || String(b.bedNumber) === rawStr);
        } catch (e) {}
    }
    return found;
}

export function getPlot(plotId) {
    const list = (typeof window !== "undefined" && Array.isArray(window.plotsData) && window.plotsData.length) ? window.plotsData : state.plotsData;
    let found = list.find(p => String(p.id) === String(plotId));
    if (!found && typeof localStorage !== "undefined") {
        try {
            const cached = JSON.parse(localStorage.getItem(PLOTS_CACHE_KEY) || "[]");
            found = cached.find(p => String(p.id) === String(plotId));
        } catch (e) {}
    }
    return found;
}

export function sortBeds(beds) {
    if (!Array.isArray(beds)) return [];
    return beds.slice().sort((a, b) =>
        String(a.bedNumber || "").localeCompare(String(b.bedNumber || ""), undefined, { numeric: true, sensitivity: "base" })
    );
}

export function bedsInPlot(plotId) {
    const list = (typeof window !== "undefined" && Array.isArray(window.bedsData) && window.bedsData.length) ? window.bedsData : state.bedsData;
    let members = list.filter(b => String(b.plotId || "") === String(plotId));
    if (!members.length && typeof localStorage !== "undefined") {
        try {
            const cached = JSON.parse(localStorage.getItem(BEDS_CACHE_KEY) || "[]");
            members = cached.filter(b => String(b.plotId || "") === String(plotId));
        } catch (e) {}
    }
    return sortBeds(members);
}

export function saveBeds() {
    localStorage.setItem(BEDS_CACHE_KEY, JSON.stringify(state.bedsData));
}

if (typeof window !== "undefined") {
    Object.defineProperty(window, "bedsData", {
        get: () => state.bedsData,
        set: (v) => { state.bedsData = v; },
        configurable: true
    });
    Object.defineProperty(window, "plotsData", {
        get: () => state.plotsData,
        set: (v) => { state.plotsData = v; },
        configurable: true
    });
    Object.defineProperty(window, "formulasData", {
        get: () => state.formulasData,
        set: (v) => { state.formulasData = v; },
        configurable: true
    });
    Object.defineProperty(window, "tasksData", {
        get: () => state.tasksData,
        set: (v) => { state.tasksData = v; },
        configurable: true
    });
}

