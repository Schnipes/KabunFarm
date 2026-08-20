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
        id: "f_root_plus",
        name: "Root Drench & Inoculant",
        category: "Biological",
        description: "Soil drench for seedling establishment, transplant shock mitigation, and root zone colonization.",
        recipe: "Root Plus:2:ml|Amino 18:1:ml",
        status: "active"
    },
    {
        id: "f_fungi_clear",
        name: "Bio-Fungicide Leaf Guard",
        category: "Fungicide",
        description: "Preventive bio-fungal spray for powdery mildew, downy mildew, and leaf spots. Apply during high humidity.",
        recipe: "Bio FungiClear:2:ml",
        status: "active"
    }
];

// --- Mutable Runtime State Store ---
export const state = {
    bedsData: [],
    formulasData: [],
    tasksData: [],
    plotsData: [],
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
    expandedPlots: {}
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
    if (!task || !task.bedNumber) return "Whole Farm";
    if (String(task.bedNumber).startsWith("plot_")) {
        const plot = getPlot(task.bedNumber);
        return plot ? `🗂️ ${plot.name}` : "Plot";
    }
    return `Bed ${task.bedNumber}`;
}

export function resolveLogScopeLabel(log) {
    const bn = String(log?.bedNumber || "");
    if (!bn || bn === "all") return "Whole Farm";
    if (bn.startsWith("plot_")) {
        const plot = getPlot(bn);
        return plot ? plot.name : "Plot (deleted)";
    }
    return `Bed ${bn}`;
}

// Bed & Plot Finders
export function getBed(bedNumber) {
    const list = (typeof window !== "undefined" && Array.isArray(window.bedsData) && window.bedsData.length) ? window.bedsData : state.bedsData;
    let found = list.find(b => String(b.bedNumber) === String(bedNumber));
    if (!found && typeof localStorage !== "undefined") {
        try {
            const cached = JSON.parse(localStorage.getItem(BEDS_CACHE_KEY) || "[]");
            found = cached.find(b => String(b.bedNumber) === String(bedNumber));
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

