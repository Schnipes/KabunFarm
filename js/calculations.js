// ============================================================================
// Kabun Farm Intelligence — Pure Agricultural & Financial Calculations
// Module: js/calculations.js
// ============================================================================

import {
    state,
    LOGS_CACHE_KEY,
    SALES_CACHE_KEY,
    ymd,
    todayString,
    daysSince,
    escapeHtml,
    getPlot,
    bedsInPlot,
    getBed
} from "./state.js";

// --- 1. Watering Decision Engine ---
export function latestWholeFarmWatering() {
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

export function latestPlotWatering(plotId) {
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

export function getWateringStatus(bed) {
    if (!bed || bed.status === "fallow" || bed.status === "retired" || !bed.crops || !bed.crops.length) {
        return { needsWater: false, days: null };
    }

    let lastWatered = bed.lastWatered ? ymd(bed.lastWatered) : null;
    const farmWide = latestWholeFarmWatering();
    if (farmWide && (!lastWatered || farmWide > lastWatered)) lastWatered = farmWide;

    const plotWide = bed.plotId ? latestPlotWatering(bed.plotId) : null;
    if (plotWide && (!lastWatered || plotWide > lastWatered)) lastWatered = plotWide;

    const days = lastWatered ? daysSince(lastWatered) : null;
    const needsWater = !lastWatered || days >= 3;
    return { needsWater, days };
}

export function wateringAlert(bed) {
    const status = getWateringStatus(bed);
    if (!status.needsWater) return "";
    const msg = status.days === null ? "Not watered recently" : `Not watered in ${status.days}d`;
    return `<p class="bed-water-alert">💧 ${msg}</p>`;
}

export function plotWateringRollup(plotId) {
    const beds = bedsInPlot(plotId);
    const flagged = beds.filter(b => getWateringStatus(b).needsWater);
    return { total: beds.length, flagged: flagged.length };
}

export function groupByPlot(bedList) {
    const grouped = {};
    const solo = [];
    (bedList || []).forEach(b => {
        if (b.plotId && getPlot(b.plotId)) {
            (grouped[b.plotId] = grouped[b.plotId] || []).push(b);
        } else {
            solo.push(b);
        }
    });
    return { grouped, solo };
}

// --- 2. Formula Recipe & Dosage Calculator ---
export function parseRecipe(recipeStr) {
    if (!recipeStr || !recipeStr.includes(':')) return null;
    try {
        return recipeStr.split('|').map(part => {
            const [name, amount, unit] = part.split(':');
            return { name: name.trim(), amount: parseFloat(amount), unit: unit.trim() };
        });
    } catch (e) { return null; }
}

export function renderIngredients(ingredients, liters) {
    if (!ingredients) return "";
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

export function recalcAllDoses(liters) {
    state.formulasData.forEach((f, i) => {
        const ingredients = parseRecipe(f.recipe);
        if (!ingredients) return;
        const container = document.getElementById(`ingredients-${i}`);
        if (container) container.innerHTML = renderIngredients(ingredients, liters);
    });
}

// --- 3. Crop Profit & Loss Engine ---
export function computeCropPL() {
    const logs  = JSON.parse(localStorage.getItem(LOGS_CACHE_KEY)  || "[]");
    const sales = JSON.parse(localStorage.getItem(SALES_CACHE_KEY) || "[]");
    const stats = {};

    function ensure(name) {
        if (!stats[name]) stats[name] = { revenue: 0, cost: 0, logCount: 0, costLoggedCount: 0, saleCount: 0, weightKg: 0 };
        return stats[name];
    }

    logs.forEach(l => {
        if (!l.cropName) return;
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

export function calcSaleTotal() {
    const qty   = parseFloat(document.getElementById("saleQty")?.value) || 0;
    const price = parseFloat(document.getElementById("salePricePerUnit")?.value) || 0;
    const total = qty * price;
    const display = document.getElementById("saleTotalDisplay");
    if (display) display.textContent = "RM " + total.toFixed(2);
}

// --- 4. CSV Exporter ---
export function csvEscape(val) {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

export function exportActivityCsv() {
    const logs  = JSON.parse(localStorage.getItem(LOGS_CACHE_KEY)  || "[]");
    const sales = JSON.parse(localStorage.getItem(SALES_CACHE_KEY) || "[]");

    const rows = [
        ["Date", "Type", "Scope", "Crop", "Quantity", "Unit", "Price/Unit (RM)", "Cost (RM)", "Revenue (RM)", "Weight (kg)", "Inputs / Notes"]
    ];

    logs.forEach(l => {
        if (l.status === "deleted") return;
        const bn = String(l.bedNumber || "");
        const scope = bn === "all" ? "Whole Farm" :
                      bn.startsWith("plot_") ? (getPlot(bn)?.name || "Plot") :
                      bn ? `Bed ${bn}` : "";
        rows.push([
            l.date || "",
            l.activityCategory || "",
            scope,
            l.cropName || "",
            "",
            "",
            "",
            l.costRM || "",
            l.revenueRM || "",
            l.weight || "",
            l.inputsUsed || ""
        ]);
    });

    sales.forEach(s => {
        if (s.status === "deleted") return;
        rows.push([
            s.date || "",
            "sale",
            "",
            s.crop || "",
            s.quantity || "",
            s.unit || "",
            s.pricePerUnit || "",
            "",
            s.totalRevenue || "",
            "",
            ""
        ]);
    });

    // Sort by date descending
    const header = rows[0];
    const dataRows = rows.slice(1).sort((a, b) => b[0].localeCompare(a[0]));
    const csvContent = [header, ...dataRows]
        .map(r => r.map(csvEscape).join(","))
        .join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `kabun_farm_activity_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// --- 5. Tier 3: Biological Crop Growth & Daily Momentum ---
export const STANDARD_CROP_DAYS = {
    "kangkong": 25,
    "bayam": 25,
    "sawi": 30,
    "pak choi": 30,
    "bok choy": 30,
    "lettuce": 35,
    "cucumber": 45,
    "timun": 45,
    "long beans": 50,
    "kacang panjang": 50,
    "okra": 55,
    "bendi": 55,
    "eggplant": 70,
    "terung": 70,
    "corn": 75,
    "jagung": 75,
    "chilli": 85,
    "chili": 85,
    "cili": 85,
    "tomato": 75
};

export function calculateCropProgress(cropName, plantingDate) {
    if (!plantingDate) {
        return { pct: 0, daysElapsed: 0, totalDays: 40, daysLeft: 40, stageLabel: "Unknown", stageIcon: "🌱", isReady: false };
    }
    const daysElapsed = Math.max(0, daysSince(plantingDate));
    const norm = (cropName || "").toLowerCase().trim();
    let totalDays = 40;
    for (const [key, days] of Object.entries(STANDARD_CROP_DAYS)) {
        if (norm.includes(key)) {
            totalDays = days;
            break;
        }
    }

    const pct = Math.min(100, Math.round((daysElapsed / totalDays) * 100));
    const daysLeft = Math.max(0, totalDays - daysElapsed);
    const isReady = daysElapsed >= totalDays;

    let stageLabel = "Sprout";
    let stageIcon = "🌱";
    if (pct >= 90) {
        stageLabel = "Harvest Ready";
        stageIcon = "🧺";
    } else if (pct >= 60) {
        stageLabel = "Flowering / Fruiting";
        stageIcon = "🌸";
    } else if (pct >= 15) {
        stageLabel = "Vegetative";
        stageIcon = "🌿";
    }

    return {
        pct,
        daysElapsed,
        totalDays,
        daysLeft,
        stageLabel,
        stageIcon,
        isReady
    };
}

export function calculateDailyMomentum() {
    const today = todayString();
    const activeBeds = (state.bedsData || []).filter(b => b.status !== "fallow" && b.status !== "retired");
    const totalActiveBeds = activeBeds.length;

    // Count beds watered today
    let wateredTodayCount = 0;
    const farmWideWatered = latestWholeFarmWatering() === today;

    activeBeds.forEach(bed => {
        if (farmWideWatered) {
            wateredTodayCount++;
        } else {
            const bedWatered = bed.lastWatered && ymd(bed.lastWatered) === today;
            const plotWatered = bed.plotId && latestPlotWatering(bed.plotId) === today;
            if (bedWatered || plotWatered) wateredTodayCount++;
        }
    });

    // Calculate total kg harvested today
    const logs = JSON.parse(localStorage.getItem(LOGS_CACHE_KEY) || "[]");
    let harvestKgToday = 0;
    logs.forEach(l => {
        if (l.date === today && l.activityCategory === "harvest" && l.status !== "deleted") {
            const w = parseFloat(l.weight);
            if (!isNaN(w) && w > 0) harvestKgToday += w;
        }
    });

    // Calculate tasks completed today vs total today
    const tasks = (state.tasksData || []).filter(t => t.date === today && t.status !== "deleted");
    const totalTasksToday = tasks.length;
    const tasksDoneToday = tasks.filter(t => t.status === "done").length;

    const hydrationPct = totalActiveBeds > 0 ? Math.round((wateredTodayCount / totalActiveBeds) * 100) : 100;
    const isAllClear = hydrationPct === 100 && (totalTasksToday === 0 || tasksDoneToday === totalTasksToday);

    return {
        wateredBeds: wateredTodayCount,
        totalBeds: totalActiveBeds,
        hydrationPct,
        harvestKg: harvestKgToday,
        tasksDone: tasksDoneToday,
        totalTasks: totalTasksToday,
        isAllClear
    };
}

export function evaluateSprayWindow(weatherData) {
    if (!weatherData || !weatherData.daily) {
        return { isGood: true, text: "Foliar window: Early morning (6:30–8:30 AM) recommended", score: "good" };
    }
    const todayRainProb = weatherData.daily.precipitation_probability_max ? weatherData.daily.precipitation_probability_max[0] : 0;

    if (todayRainProb >= 60) {
        return { isGood: false, text: "🌧️ High rain risk (" + todayRainProb + "%) — avoid foliar spray (wash-off risk)", score: "bad" };
    }
    if (todayRainProb >= 35) {
        return { isGood: true, text: "⚠️ Moderate rain risk (" + todayRainProb + "%) — spray early morning only with sticker", score: "fair" };
    }
    return { isGood: true, text: "✨ Optimal spray window: 6:30–8:30 AM (Temp < 28°C, low rain risk)", score: "good" };
}
