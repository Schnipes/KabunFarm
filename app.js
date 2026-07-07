// --- 1. Configuration ---
const STORAGE_KEY        = "offline_farm_logs";
const BEDS_CACHE_KEY     = "farmlog_beds_cache";
const FORMULAS_CACHE_KEY = "farmlog_formulas_cache";
const LOGS_CACHE_KEY     = "farmlog_logs_cache";
const SALES_CACHE_KEY    = "farmlog_sales_cache";
const LAST_BED_KEY       = "farmlog_last_bed";
const GOOGLE_SCRIPT_URL  = "https://script.google.com/macros/s/AKfycbyQSzKWjoj3rD4_d045XN4csdYW5VXIHxV9qHviMBUc7iJvacGRHHuBLQPUTecMCBmswQ/exec";

const MODAL_TITLES = {
    water:   "Irrigation / Fertigation",
    pest:    "Pest Control",
    harvest: "Harvest & Sale",
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

let bedsData          = [];
let formulasData      = [];
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

function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
}

// --- 3. Modal Controls ---
function todayString() {
    const d = new Date();
    return d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");
}

function openModal(type) {
    document.getElementById("modalTitle").textContent = MODAL_TITLES[type] || "Log activity";
    document.getElementById("logDate").value = todayString();
    document.getElementById("activityCategory").value = DEFAULT_CATEGORY[type] || "";

    // Restore last-used bed if it still exists in bedsData
    const lastBed = localStorage.getItem(LAST_BED_KEY);
    const scopeEl = document.getElementById("bedScope");
    if (lastBed && (lastBed === "all" || bedsData.some(b => String(b.bedNumber) === String(lastBed)))) {
        scopeEl.value = lastBed;
    } else {
        scopeEl.value = "all";
    }

    updateBedFields();
    document.getElementById("modalOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
}

function closeModal() {
    document.getElementById("modalOverlay").classList.remove("open");
    document.body.style.overflow = "";
    document.getElementById("logForm").reset();
    document.getElementById("currentCropsField").hidden  = true;
    document.getElementById("harvestCropsField").hidden  = true;
    document.getElementById("newCropField").hidden       = true;
    document.getElementById("bedContextBar").hidden      = true;
    document.getElementById("inputsField").hidden        = true;
    document.getElementById("financialsField").hidden    = true;
    document.getElementById("toggleInputsBtn").textContent     = "＋ Add inputs / notes";
    document.getElementById("toggleFinancialsBtn").textContent = "＋ Add financials";
    document.getElementById("logDate").classList.remove("invalid");
    document.getElementById("activityCategory").classList.remove("invalid");
    document.getElementById("formulaPickerList").hidden = true;
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
    btn.textContent = field.hidden ? "＋ Add financials" : "− Remove financials";
}

// --- 5. Form — Bed & Crop Fields ---
function populateBedDropdown() {
    const select = document.getElementById("bedScope");
    while (select.options.length > 1) select.remove(1);
    bedsData.forEach(bed => {
        const opt = document.createElement("option");
        opt.value = bed.bedNumber;
        opt.textContent = "Bed " + bed.bedNumber;
        select.appendChild(opt);
    });
}

function updateBedFields() {
    const scope      = document.getElementById("bedScope").value;
    const activity   = document.getElementById("activityCategory").value;
    const isSowing   = activity === "sowing";
    const isHarvest  = activity === "harvest";
    const isSpecific = scope !== "all";

    document.getElementById("currentCropsField").hidden  = true;
    document.getElementById("harvestCropsField").hidden  = true;
    document.getElementById("newCropField").hidden       = true;
    document.getElementById("newCropName").required      = false;

    // Update bed context bar
    const contextBar = document.getElementById("bedContextBar");
    if (isSpecific) {
        const bed = bedsData.find(b => String(b.bedNumber) === String(scope));
        if (bed && bed.crops.length) {
            contextBar.innerHTML = bed.crops.map(c =>
                `<span>🌱 ${escapeHtml(c.cropName)} · Day ${daysSince(c.plantingDate)}</span>`
            ).join("");
        } else {
            contextBar.innerHTML = '<span style="color:#888;">Empty bed — ready to sow</span>';
        }
        contextBar.hidden = false;
    } else {
        contextBar.hidden = true;
    }

    if (!isSpecific) return;

    const bed = bedsData.find(b => String(b.bedNumber) === String(scope));

    if (isSowing) {
        document.getElementById("newCropField").hidden  = false;
        document.getElementById("newCropName").required = true;

    } else if (isHarvest) {
        const list = document.getElementById("harvestCropsList");
        if (bed && bed.crops.length) {
            list.innerHTML = bed.crops.map((c, i) => `
            <label class="harvest-crop-check">
                <input type="checkbox" name="harvestCrop" value="${escapeHtml(c.cropName)}" id="hcrop_${i}">
                <span>${escapeHtml(c.cropName)}</span>
            </label>`).join("");
            document.getElementById("harvestCropsField").hidden = false;
        }

    } else {
        const tags = document.getElementById("currentCropsTags");
        tags.innerHTML = (bed && bed.crops.length)
            ? bed.crops.map(c => `<span class="tag">${escapeHtml(c.cropName)}</span>`).join("")
            : '<span style="color:#888;font-size:13px;">Empty bed</span>';
        document.getElementById("currentCropsField").hidden = false;
    }
}

// --- 6. Offline Storage ---
function getOfflineLogs() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

function updateSyncBadge() {
    const queueLength = getOfflineLogs().length;
    const badge = document.querySelector(".status-badge");
    if (queueLength > 0) {
        badge.innerHTML = `<span class="status-dot" style="background:#b3261e" aria-hidden="true"></span><span>${queueLength} Offline (Pending)</span>`;
        badge.style.borderColor = "#b3261e";
        badge.style.color = "#b3261e";
    } else {
        badge.innerHTML = `<span class="status-dot" style="background:var(--color-primary)" aria-hidden="true"></span><span>Online & Synced</span>`;
        badge.style.borderColor = "var(--color-border)";
        badge.style.color = "var(--color-text)";
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
    const cropName = document.getElementById("newCropName").value.trim();

    const entry = {
        action:           "addLog",
        id:               "log_" + Date.now(),
        date,
        bedNumber:        bedScope,
        activityCategory: activity,
        cropName:         activity === "sowing" ? cropName : "",
        inputsUsed:       document.getElementById("inputsUsed").value,
        costRM:           document.getElementById("costRM").value,
        revenueRM:        document.getElementById("revenueRM").value
    };

    const queue = getOfflineLogs();
    queue.push(entry);

    if (activity === "sowing" && bedScope !== "all" && cropName) {
        queue.push({
            action:       "addBatch",
            id:           "batch_" + Date.now(),
            bedNumber:    bedScope,
            cropName,
            location:     "commercial",
            plantingDate: date,
            status:       "active"
        });
        // Optimistic update — add crop to bed immediately
        const bed = bedsData.find(b => String(b.bedNumber) === String(bedScope));
        if (bed) bed.crops.push({ cropName, plantingDate: date });
        renderBeds(bedsData);
        populateBedDropdown();
    }

    if (activity === "harvest" && bedScope !== "all") {
        const checked = [...document.querySelectorAll('input[name="harvestCrop"]:checked')];
        checked.forEach(cb => {
            queue.push({
                action:      "updateBatch",
                id:          "update_" + Date.now() + "_" + cb.value,
                bedNumber:   bedScope,
                cropName:    cb.value,
                harvestDate: date,
                status:      "done"
            });
            const bed = bedsData.find(b => String(b.bedNumber) === String(bedScope));
            if (bed) bed.crops = bed.crops.filter(c => c.cropName !== cb.value);
        });
        renderBeds(bedsData);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    localStorage.setItem(LAST_BED_KEY, bedScope);
    updateSyncBadge();
    closeModal();

    // Richer toast: "Harvest logged · Bed 2"
    const bedLabel = bedScope === "all" ? "Whole Farm" : `Bed ${bedScope}`;
    const actLabel = CATEGORY_LABEL[activity] || activity;
    showToast(`${actLabel} logged · ${bedLabel}`);

    processOfflineQueue();
}

// --- 7. Cloud Sync ---
async function processOfflineQueue() {
    if (!navigator.onLine) return;
    let queue = getOfflineLogs();
    if (!queue.length) return;

    while (queue.length > 0) {
        const item = queue[0];
        try {
            await fetch(GOOGLE_SCRIPT_URL, {
                method: "POST",
                mode:   "no-cors",
                headers: { "Content-Type": "application/json" },
                body:   JSON.stringify(item)
            });
            queue.shift();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
            updateSyncBadge();
        } catch (err) {
            console.error("Sync failed, will retry later.", err);
            break;
        }
    }
}

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
    if (viewName === "data") { renderBedFilterChips(); renderTypeFilterChips(); renderFinancialSummary(); fetchLogs(); }
    if (viewName === "formulas") fetchFormulas();
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

function daysSince(dateStr) {
    const planted = new Date(dateStr);
    const today   = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today - planted) / 86400000);
}

function renderBeds(beds) {
    const container = document.getElementById("batchList");
    if (!beds.length) {
        container.innerHTML = `
        <div class="empty-beds-card" onclick="addBed()">
            <span class="empty-beds-icon">🌱</span>
            <p class="empty-beds-title">Add your first bed</p>
            <p class="empty-beds-hint">Tap to create Bed 1</p>
        </div>`;
        return;
    }

    const growing = beds.filter(b => b.crops.length > 0);
    const empty   = beds.filter(b => b.crops.length === 0);
    let html = "";

    if (growing.length) {
        html += `<p class="bed-group-label">Growing (${growing.length})</p>`;
        html += growing.map(bed => {
        const lastLine = lastActivityLabel(bed.lastActivity);
        return `
        <div class="batch-card bed-card-clickable" onclick="openBedDetail(${bed.bedNumber})">
            <div class="bed-card-header">
                <p class="batch-title">Bed ${bed.bedNumber}</p>
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
        </div>`;
    }).join("");
    }

    if (empty.length) {
        html += `<p class="bed-group-label" style="margin-top:16px;">Empty (${empty.length})</p>`;
        html += empty.map(bed => {
            const lastLine = lastActivityLabel(bed.lastActivity);
            return `
        <div class="batch-card bed-card-empty bed-card-clickable" onclick="openBedDetail(${bed.bedNumber})">
            <div class="bed-card-header">
                <p class="batch-title" style="color:#888;">Bed ${bed.bedNumber}</p>
                <span class="bed-chevron">›</span>
            </div>
            <p class="bed-empty-label">Ready to sow</p>
            ${lastLine ? `<p class="bed-last-activity">${escapeHtml(lastLine)}</p>` : ""}
        </div>`;
        }).join("");
    }

    container.innerHTML = html;
}

function openBedDetail(bedNum) {
    const bed = bedsData.find(b => String(b.bedNumber) === String(bedNum));
    if (!bed) return;

    selectedBedForLog = bedNum;
    document.getElementById("bedDetailTitle").textContent = "Bed " + bedNum;

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
                ? Math.round((new Date(c.harvestDate) - new Date(c.plantingDate)) / 86400000)
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

function closeBedDetail() {
    document.getElementById("bedDetailOverlay").classList.remove("open");
    document.body.style.overflow = "";
}

function logForBed(type) {
    closeBedDetail();
    openModal(type);
    document.getElementById("bedScope").value = selectedBedForLog;
    updateBedFields();
}

document.getElementById("bedDetailOverlay").addEventListener("click", function(e) {
    if (e.target === this) closeBedDetail();
});

function addBed() {
    if (addBedPending) return;
    addBedPending = true;
    setTimeout(() => { addBedPending = false; }, 2000);

    const nextNum = bedsData.length > 0
        ? Math.max(...bedsData.map(b => Number(b.bedNumber))) + 1
        : 1;

    const newBed = {
        action:    "addBed",
        id:        "bed_" + Date.now(),
        bedNumber: nextNum,
        location:  "commercial",
        status:    "active"
    };

    bedsData.push({ bedNumber: nextNum, location: "commercial", crops: [] });
    renderBeds(bedsData);
    populateBedDropdown();

    const queue = getOfflineLogs();
    queue.push(newBed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    updateSyncBadge();
    showToast(`Bed ${nextNum} added!`);
    processOfflineQueue();
}

async function fetchBeds() {
    const cached = localStorage.getItem(BEDS_CACHE_KEY);
    if (cached) {
        try {
            bedsData = JSON.parse(cached);
            renderBeds(bedsData);
            populateBedDropdown();
            renderBedFilterChips();
        } catch (e) { /* ignore corrupt cache */ }
    }
    try {
        const res  = await fetch(GOOGLE_SCRIPT_URL + "?action=getBeds");
        const data = await res.json();
        if (data.beds) {
            bedsData = data.beds;
            localStorage.setItem(BEDS_CACHE_KEY, JSON.stringify(data.beds));
            renderBeds(bedsData);
            populateBedDropdown();
            renderBedFilterChips();
        }
    } catch (e) {
        console.error("Could not load beds:", e);
    }
}

// --- 10. Formulas Tab ---
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
        const calc = ing.unit === 'g'
            ? (ing.amount * vol).toFixed(1).replace(/\.0$/, '')
            : Math.round(ing.amount * vol);
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
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">No formulas yet. Add them in the Formulas sheet tab.</p>';
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
                ${f.category ? `<span class="tag">${escapeHtml(f.category)}</span>` : ""}
            </div>
            ${f.description ? `<p class="formula-desc">${escapeHtml(f.description)}</p>` : ""}
            ${calcSection}
        </div>`;
    }).join("");
}

async function fetchFormulas() {
    const container = document.getElementById("formulaList");
    const cached = localStorage.getItem(FORMULAS_CACHE_KEY);
    if (cached) {
        try { renderFormulas(JSON.parse(cached)); } catch (e) { /* ignore */ }
    } else {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">Loading formulas...</p>';
    }
    try {
        const res      = await fetch(GOOGLE_SCRIPT_URL + "?action=getFormulas");
        const data     = await res.json();
        const formulas = data.formulas || [];
        localStorage.setItem(FORMULAS_CACHE_KEY, JSON.stringify(formulas));
        renderFormulas(formulas);
    } catch (e) {
        if (!cached) {
            container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">Could not load formulas.</p>';
        }
    }
}

// --- 11. Log Data (Activity Tab) ---
function shortDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
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
    const chips = [{ label: "All beds", value: "all" }, ...bedsData.map(b => ({ label: "Bed " + b.bedNumber, value: String(b.bedNumber) }))];
    container.innerHTML = chips.map(c =>
        `<button class="bed-filter-chip${activeLogFilter === c.value ? " active" : ""}" onclick="filterLogs('${c.value}')">${c.label}</button>`
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

function renderCombinedActivity() {
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

function deleteLogEntry(logId) {
    if (!confirm("Delete this log entry?")) return;
    const cached = localStorage.getItem(LOGS_CACHE_KEY);
    if (!cached) return;
    const logs = JSON.parse(cached).filter(l => String(l.id) !== String(logId));
    localStorage.setItem(LOGS_CACHE_KEY, JSON.stringify(logs));
    renderLogs(logs);
    const queue = getOfflineLogs();
    queue.push({ action: "deleteLog", logId });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    updateSyncBadge();
    showToast("Log deleted");
    processOfflineQueue();
}

function renderLogs(logs) {
    const container = document.getElementById("logList");

    const filtered = logs
        .filter(log => activeLogFilter === "all" || (log.activityCategory === "sale" ? activeLogFilter === "all" : String(log.bedNumber) === String(activeLogFilter)))
        .filter(log => activeTypeFilter === "all" || log.activityCategory === activeTypeFilter);

    if (!filtered.length) {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">No logs yet.</p>';
        return;
    }

    const groups = {};
    filtered.forEach(log => {
        const key = log.date ? log.date.toString().slice(0, 10) : "Unknown";
        if (!groups[key]) groups[key] = [];
        groups[key].push(log);
    });

    const html = Object.keys(groups)
        .sort((a, b) => b.localeCompare(a))
        .map(dateKey => {
            const cards = groups[dateKey].map(log => {
                const icon       = CATEGORY_ICON[log.activityCategory]  || "📝";
                const label      = CATEGORY_LABEL[log.activityCategory] || escapeHtml(log.activityCategory);
                const bedNum     = log.bedNumber && log.bedNumber !== "all" ? log.bedNumber : null;
                const scopeLabel = bedNum ? `Bed ${escapeHtml(String(bedNum))}` : "Whole Farm";
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
                    const cropLine  = log.cropName   ? `<p class="log-inputs">🌱 ${escapeHtml(log.cropName)}</p>`  : "";
                    const inputLine = log.inputsUsed ? `<p class="log-inputs">${escapeHtml(log.inputsUsed)}</p>`   : "";
                    const financials = (log.costRM || log.revenueRM) ? `
                    <div class="log-financials">
                        ${log.costRM    ? `<span>Cost: RM ${parseFloat(log.costRM).toFixed(2)}</span>`    : ""}
                        ${log.revenueRM ? `<span>Revenue: RM ${parseFloat(log.revenueRM).toFixed(2)}</span>` : ""}
                    </div>` : "";
                    body = cropLine + inputLine + financials;
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
        try { renderCombinedActivity(); } catch (e) { /* ignore */ }
    } else {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">Loading logs...</p>';
    }
    try {
        const [logsRes, salesRes] = await Promise.all([
            fetch(GOOGLE_SCRIPT_URL + "?action=getLogs"),
            fetch(GOOGLE_SCRIPT_URL + "?action=getSales")
        ]);
        const logsData  = await logsRes.json();
        const salesData = await salesRes.json();
        const logs  = logsData.logs   || [];
        const sales = salesData.sales || [];
        localStorage.setItem(LOGS_CACHE_KEY,  JSON.stringify(logs));
        localStorage.setItem(SALES_CACHE_KEY, JSON.stringify(sales));
        renderCombinedActivity();
        renderFinancialSummary();
    } catch (e) {
        if (!cachedLogs) {
            container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">Could not load activity.</p>';
        }
    }
}

// --- 12. Formula Picker ---
function toggleFormulaPicker() {
    const list = document.getElementById("formulaPickerList");
    if (!list.hidden) { list.hidden = true; return; }

    if (!formulasData.length) {
        list.innerHTML = '<p style="color:#888;font-size:13px;padding:6px 0;">No formulas loaded.</p>';
        list.hidden = false;
        return;
    }

    list.innerHTML = formulasData.map((f, i) => `
        <button type="button" class="formula-pick-item" onclick="applyFormula(${i})">
            <span class="formula-pick-name">${escapeHtml(f.name)}</span>
            ${f.category ? `<span class="formula-pick-cat">${escapeHtml(f.category)}</span>` : ""}
        </button>`
    ).join("");
    list.hidden = false;
}

function applyFormula(index) {
    const formula     = formulasData[index];
    if (!formula) return;
    const ingredients = parseRecipe(formula.recipe);
    const vol         = parseFloat(document.getElementById("globalSprayerVol")?.value) || 16;

    let text = `${formula.name} — ${vol}L sprayer`;
    if (ingredients) {
        const parts = ingredients.map(ing => {
            const calc = ing.unit === 'g'
                ? (ing.amount * vol).toFixed(1).replace(/\.0$/, '')
                : Math.round(ing.amount * vol);
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

    const revenue = sales
        .filter(s => s.date && new Date(s.date) >= start)
        .reduce((sum, s) => sum + (parseFloat(s.totalRevenue) || 0), 0);

    const cost = logs
        .filter(l => l.date && new Date(l.date) >= start && l.costRM)
        .reduce((sum, l) => sum + (parseFloat(l.costRM) || 0), 0);

    const net = revenue - cost;

    document.getElementById("finRevenue").textContent = "RM " + revenue.toFixed(2);
    document.getElementById("finCost").textContent    = "RM " + cost.toFixed(2);

    const netEl = document.getElementById("finNet");
    netEl.textContent = (net >= 0 ? "+" : "") + "RM " + net.toFixed(2);
    netEl.className = "fin-value " + (net >= 0 ? "green" : "red");
}

// --- 13. Sales ---
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

    // Populate crop datalist from active beds
    const datalist = document.getElementById("activeCropsList");
    const crops = [...new Set(bedsData.flatMap(b => b.crops.map(c => c.cropName)))];
    datalist.innerHTML = crops.map(c => `<option value="${escapeHtml(c)}">`).join("");

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
    const crop         = document.getElementById("saleCrop").value.trim();
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
        action:       "addSale",
        id:           "sale_" + Date.now(),
        date,
        crop,
        quantity:     qty,
        unit,
        pricePerUnit,
        totalRevenue
    };

    const queue = getOfflineLogs();
    queue.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));

    // Optimistic: prepend to sales cache
    const cached = localStorage.getItem(SALES_CACHE_KEY);
    const sales  = cached ? JSON.parse(cached) : [];
    sales.unshift(entry);
    localStorage.setItem(SALES_CACHE_KEY, JSON.stringify(sales));

    updateSyncBadge();
    closeSaleModal();
    showToast(`Sale logged · ${qty} ${unit} ${crop} · RM ${totalRevenue}`);
    processOfflineQueue();

    // Refresh activity tab if visible
    if (!document.getElementById("view-data").hidden) renderCombinedActivity();
}

document.getElementById("saleModalOverlay").addEventListener("click", function(e) {
    if (e.target === this) closeSaleModal();
});

async function fetchSales() {
    const cached = localStorage.getItem(SALES_CACHE_KEY);
    try {
        const res   = await fetch(GOOGLE_SCRIPT_URL + "?action=getSales");
        const data  = await res.json();
        const sales = data.sales || [];
        localStorage.setItem(SALES_CACHE_KEY, JSON.stringify(sales));
        return sales;
    } catch (e) {
        return cached ? JSON.parse(cached) : [];
    }
}

// --- 13. App Initialization ---
window.addEventListener("online", processOfflineQueue);

document.addEventListener("DOMContentLoaded", () => {
    updateSyncBadge();
    processOfflineQueue();
    fetchBeds();
    fetchFormulas();

    document.getElementById("activityCategory").addEventListener("change", updateBedFields);
    document.getElementById("bedScope").addEventListener("change", updateBedFields);

    document.querySelectorAll(".nav-btn[data-view]").forEach(btn => {
        btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js")
            .then(reg => console.log("SW registered:", reg.scope))
            .catch(err => console.error("SW registration failed:", err));
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            document.getElementById("updateBanner").hidden = false;
        });
    }
});
