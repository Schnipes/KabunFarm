// --- 1. Configuration ---
const STORAGE_KEY = "offline_farm_logs";
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQSzKWjoj3rD4_d045XN4csdYW5VXIHxV9qHviMBUc7iJvacGRHHuBLQPUTecMCBmswQ/exec";

const MODAL_TITLES = {
    water: "Log fertigation / watering",
    pest:  "Log pest / treatment",
    harvest: "Log harvest / sale",
    crop:  "Log crop action"
};

const DEFAULT_CATEGORY = {
    water: "watering",
    pest:  "pest_control",
    harvest: "harvest",
    crop:  "sowing"
};

const CATEGORY_ICON  = { watering: "💧", pest_control: "🐛", harvest: "🧺", sowing: "🌱" };
const CATEGORY_LABEL = { watering: "Watering", pest_control: "Pest Control", harvest: "Harvest", sowing: "Sowing" };

let bedsData = [];

// --- 2. Toast ---
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
    document.getElementById("bedScope").value = "all";
    updateBedFields();
    document.getElementById("modalOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
}

function closeModal() {
    document.getElementById("modalOverlay").classList.remove("open");
    document.body.style.overflow = "";
    document.getElementById("logForm").reset();
    document.getElementById("currentCropsField").hidden = true;
    document.getElementById("newCropField").hidden = true;
}

document.getElementById("modalOverlay").addEventListener("click", function (e) {
    if (e.target === this) closeModal();
});

// --- 4. Form — Bed & Crop Fields ---
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

    // Hide all conditional fields first
    document.getElementById("currentCropsField").hidden  = true;
    document.getElementById("harvestCropsField").hidden  = true;
    document.getElementById("newCropField").hidden       = true;
    document.getElementById("newCropName").required      = false;

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
                <input type="checkbox" name="harvestCrop" value="${c.cropName}" id="hcrop_${i}">
                <span>${c.cropName}</span>
            </label>`).join("");
            document.getElementById("harvestCropsField").hidden = false;
        }

    } else {
        const tags = document.getElementById("currentCropsTags");
        tags.innerHTML = (bed && bed.crops.length)
            ? bed.crops.map(c => `<span class="tag">${c.cropName}</span>`).join("")
            : '<span style="color:#888;font-size:13px;">Empty bed</span>';
        document.getElementById("currentCropsField").hidden = false;
    }
}

// --- 5. Offline Storage ---
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

    const bedScope   = document.getElementById("bedScope").value;
    const activity   = document.getElementById("activityCategory").value;
    const cropName   = document.getElementById("newCropName").value.trim();
    const date       = document.getElementById("logDate").value;

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

    // Sowing on a specific bed also creates a new batch record
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
    }

    // Harvest — mark checked crops as done
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
            // Optimistically remove crop from local bed state
            const bed = bedsData.find(b => String(b.bedNumber) === String(bedScope));
            if (bed) bed.crops = bed.crops.filter(c => c.cropName !== cb.value);
        });
        renderBeds(bedsData);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    updateSyncBadge();
    closeModal();
    showToast("Log saved!");
    processOfflineQueue();
}

// --- 6. Cloud Sync ---
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

// --- 7. View Switching ---
function switchView(viewName) {
    document.querySelectorAll(".view").forEach(v => v.hidden = true);
    const target = document.getElementById("view-" + viewName);
    if (target) target.hidden = false;
    document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
    const activeBtn = document.querySelector(`[data-view="${viewName}"]`);
    if (activeBtn) activeBtn.classList.add("active");
    if (viewName === "data") fetchLogs();
    if (viewName === "formulas") fetchFormulas();
}

// --- 8. Beds (Home Screen) ---
function daysSince(dateStr) {
    const planted = new Date(dateStr);
    const today   = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today - planted) / 86400000);
}

function renderBeds(beds) {
    const container = document.getElementById("batchList");
    if (!beds.length) {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">No beds yet. Tap + Add Bed to start.</p>';
        return;
    }

    const growing = beds.filter(b => b.crops.length > 0);
    const empty   = beds.filter(b => b.crops.length === 0);

    let html = "";

    if (growing.length) {
        html += `<p class="bed-group-label">Growing (${growing.length})</p>`;
        html += growing.map(bed => `
        <div class="batch-card bed-card-clickable" onclick="openBedDetail(${bed.bedNumber})">
            <div class="bed-card-header">
                <p class="batch-title">Bed ${bed.bedNumber}</p>
                <span class="bed-chevron">›</span>
            </div>
            <div class="bed-crops">
                ${bed.crops.map(c => `
                <div class="bed-crop-row">
                    <span>🌱 ${c.cropName}</span>
                    <span class="bed-day-badge">Day ${daysSince(c.plantingDate)}</span>
                </div>`).join("")}
            </div>
        </div>`).join("");
    }

    if (empty.length) {
        html += `<p class="bed-group-label" style="margin-top:16px;">Empty (${empty.length})</p>`;
        html += empty.map(bed => `
        <div class="batch-card bed-card-empty bed-card-clickable" onclick="openBedDetail(${bed.bedNumber})">
            <div class="bed-card-header">
                <p class="batch-title" style="color:#888;">Bed ${bed.bedNumber}</p>
                <span class="bed-chevron">›</span>
            </div>
            <p class="bed-empty-label">Ready to sow</p>
        </div>`).join("");
    }

    container.innerHTML = html;
}

function openBedDetail(bedNum) {
    const bed = bedsData.find(b => String(b.bedNumber) === String(bedNum));
    if (!bed) return;

    document.getElementById("bedDetailTitle").textContent = "Bed " + bedNum;

    const content = document.getElementById("bedDetailContent");
    if (!bed.crops.length) {
        content.innerHTML = '<p style="color:#888;padding:12px 0 8px;">Empty — ready to sow.</p>';
    } else {
        content.innerHTML = bed.crops.map(c => `
        <div class="bed-detail-crop">
            <div class="bed-detail-row">
                <span class="bed-detail-icon">🌱</span>
                <div class="bed-detail-info">
                    <p class="bed-detail-name">${c.cropName}</p>
                    <p class="bed-detail-meta">Planted ${c.plantingDate}</p>
                </div>
                <span class="bed-day-badge">Day ${daysSince(c.plantingDate)}</span>
            </div>
        </div>`).join("");
    }

    document.getElementById("bedDetailLogBtn").dataset.bed = bedNum;
    document.getElementById("bedDetailOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
}

function closeBedDetail() {
    document.getElementById("bedDetailOverlay").classList.remove("open");
    document.body.style.overflow = "";
}

function logForBed() {
    const bedNum = document.getElementById("bedDetailLogBtn").dataset.bed;
    closeBedDetail();
    openModal("water");
    document.getElementById("bedScope").value = bedNum;
    updateBedFields();
}

document.getElementById("bedDetailOverlay").addEventListener("click", function(e) {
    if (e.target === this) closeBedDetail();
});

function addBed() {
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

    // Optimistically update local state
    bedsData.push({ bedNumber: nextNum, location: "commercial", crops: [] });
    renderBeds(bedsData);
    populateBedDropdown();

    // Queue and sync
    const queue = getOfflineLogs();
    queue.push(newBed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    updateSyncBadge();
    showToast(`Bed ${nextNum} added!`);
    processOfflineQueue();
}

async function fetchBeds() {
    try {
        const res  = await fetch(GOOGLE_SCRIPT_URL + "?action=getBeds");
        const data = await res.json();
        if (data.beds) {
            bedsData = data.beds;
            renderBeds(bedsData);
            populateBedDropdown();
        }
    } catch (e) {
        console.error("Could not load beds:", e);
    }
}

// --- 9. Formulas Tab ---
function renderFormulas(formulas) {
    const container = document.getElementById("formulaList");
    if (!formulas.length) {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">No formulas yet. Add them in the Formulas sheet tab.</p>';
        return;
    }
    container.innerHTML = formulas.map(f => `
        <div class="formula-card">
            <div class="formula-header">
                <p class="formula-name">${f.name}</p>
                ${f.category ? `<span class="tag">${f.category}</span>` : ""}
            </div>
            ${f.description ? `<p class="formula-desc">${f.description}</p>` : ""}
            ${f.recipe ? `<pre class="formula-recipe">${f.recipe}</pre>` : ""}
        </div>`).join("");
}

async function fetchFormulas() {
    const container = document.getElementById("formulaList");
    container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">Loading formulas...</p>';
    try {
        const res  = await fetch(GOOGLE_SCRIPT_URL + "?action=getFormulas");
        const data = await res.json();
        renderFormulas(data.formulas || []);
    } catch (e) {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">Could not load formulas.</p>';
    }
}

// --- 10. Log Data (Data Tab) ---
function renderLogs(logs) {
    const container = document.getElementById("logList");
    if (!logs.length) {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">No logs yet.</p>';
        return;
    }
    container.innerHTML = logs.map(log => {
        const icon        = CATEGORY_ICON[log.activityCategory]  || "📝";
        const label       = CATEGORY_LABEL[log.activityCategory] || log.activityCategory;
        const dateDisplay = log.date ? log.date.toString().slice(0, 10) : "";
        const scopeLabel  = log.bedNumber && log.bedNumber !== "all" ? `Bed ${log.bedNumber}` : "Whole Farm";
        const cropLine    = log.cropName ? `<p class="log-inputs">🌱 ${log.cropName}</p>` : "";
        const inputLine   = log.inputsUsed ? `<p class="log-inputs">${log.inputsUsed}</p>` : "";
        const financials  = (log.costRM || log.revenueRM) ? `
            <div class="log-financials">
                ${log.costRM    ? `<span>Cost: RM ${parseFloat(log.costRM).toFixed(2)}</span>` : ""}
                ${log.revenueRM ? `<span>Revenue: RM ${parseFloat(log.revenueRM).toFixed(2)}</span>` : ""}
            </div>` : "";
        return `
        <div class="log-card">
            <div class="log-header">
                <span class="log-icon">${icon}</span>
                <div class="log-meta">
                    <p class="log-title">${label}</p>
                    <p class="log-date">${dateDisplay} &middot; <span class="tag">${scopeLabel}</span></p>
                </div>
            </div>
            ${cropLine}${inputLine}${financials}
        </div>`;
    }).join("");
}

async function fetchLogs() {
    const container = document.getElementById("logList");
    container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">Loading logs...</p>';
    try {
        const res  = await fetch(GOOGLE_SCRIPT_URL + "?action=getLogs");
        const data = await res.json();
        renderLogs(data.logs || []);
    } catch (e) {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">Could not load logs.</p>';
    }
}

// --- 10. App Initialization ---
window.addEventListener("online", processOfflineQueue);

document.addEventListener("DOMContentLoaded", () => {
    updateSyncBadge();
    processOfflineQueue();
    fetchBeds();

    document.getElementById("activityCategory").addEventListener("change", updateBedFields);
    document.getElementById("bedScope").addEventListener("change", updateBedFields);

    document.querySelectorAll(".nav-btn[data-view]").forEach(btn => {
        btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js")
            .then(reg => console.log("SW registered:", reg.scope))
            .catch(err => console.error("SW registration failed:", err));
    }
});
