// --- 1. Configuration & UI Variables ---
const STORAGE_KEY = "offline_farm_logs";
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQSzKWjoj3rD4_d045XN4csdYW5VXIHxV9qHviMBUc7iJvacGRHHuBLQPUTecMCBmswQ/exec";
const modalTitles = {
    water: "Log fertigation / watering",
    pest: "Log pest / treatment",
    harvest: "Log harvest / sale",
    crop: "Log crop action"
};

const defaultCategory = {
    water: "watering",
    pest: "pest_control",
    harvest: "harvest",
    crop: "sowing"
};

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
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;
}

function openModal(type) {
    document.getElementById("modalTitle").textContent = modalTitles[type] || "Log activity";
    document.getElementById("logDate").value = todayString();
    document.getElementById("activityCategory").value = defaultCategory[type] || "";
    document.getElementById("modalOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
}

function closeModal() {
    document.getElementById("modalOverlay").classList.remove("open");
    document.body.style.overflow = "";
    document.getElementById("logForm").reset();
    document.getElementById("projectLocation").value = "commercial"; // Keep default
}

document.getElementById("modalOverlay").addEventListener("click", function (event) {
    if (event.target === this) closeModal();
});

// --- 4. Offline Storage Engine ---
function getOfflineLogs() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

function updateSyncBadge() {
    const queueLength = getOfflineLogs().length;
    const badge = document.querySelector(".status-badge");
    
    if (queueLength > 0) {
        badge.innerHTML = `<span class="status-dot" style="background: #b3261e;" aria-hidden="true"></span><span>${queueLength} Offline (Pending)</span>`;
        badge.style.borderColor = "#b3261e";
        badge.style.color = "#b3261e";
    } else {
        badge.innerHTML = `<span class="status-dot" style="background: var(--color-primary);" aria-hidden="true"></span><span>Online & Synced</span>`;
        badge.style.borderColor = "var(--color-border)";
        badge.style.color = "var(--color-text)";
    }
}

function handleSubmit(event) {
    event.preventDefault();

    const entry = {
        id: "log_" + Date.now(), 
        date: document.getElementById("logDate").value,
        projectLocation: document.getElementById("projectLocation").value,
        activityCategory: document.getElementById("activityCategory").value,
        inputsUsed: document.getElementById("inputsUsed").value,
        costRM: document.getElementById("costRM").value,
        revenueRM: document.getElementById("revenueRM").value
    };

    const queue = getOfflineLogs();
    queue.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));

    updateSyncBadge();
    closeModal();
    showToast("Log saved!");
    processOfflineQueue();
}

// --- 5. The Cloud Sync Engine ---
async function processOfflineQueue() {
    // If the browser knows we are strictly offline, stop here.
    if (!navigator.onLine) return; 

    let queue = getOfflineLogs();
    if (queue.length === 0) return; // Nothing to sync

    console.log(`Attempting to sync ${queue.length} logs to Google Drive...`);

    // Process items one by one
    while (queue.length > 0) {
        const currentLog = queue[0];

        try {
            await fetch(GOOGLE_SCRIPT_URL, {
                method: "POST",
                mode: "no-cors", // Required for Google Apps Script
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(currentLog)
            });

            // If fetch succeeds, remove the item from our queue array
            queue.shift(); 
            // Update local storage to reflect the removal
            localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
            // Update the UI
            updateSyncBadge();
            console.log(`Successfully synced log: ${currentLog.id}`);

        } catch (error) {
            console.error("Sync failed. Internet might have dropped. Will retry later.", error);
            break; // Break the loop so we don't lose the remaining data
        }
    }
}

// --- 6. View Switching ---
function switchView(viewName) {
    document.querySelectorAll(".view").forEach(v => v.hidden = true);
    const target = document.getElementById("view-" + viewName);
    if (target) target.hidden = false;
    document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
    const activeBtn = document.querySelector(`[data-view="${viewName}"]`);
    if (activeBtn) activeBtn.classList.add("active");
    if (viewName === "data") fetchLogs();
}

// --- 7. Batch Cards ---
function daysSince(dateStr) {
    const planted = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today - planted) / (1000 * 60 * 60 * 24));
}

function renderBatches(batches) {
    const container = document.getElementById("batchList");
    if (!batches.length) {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">No active batches.</p>';
        return;
    }
    container.innerHTML = batches.map(b => {
        const days = daysSince(b.plantingDate);
        const isHome = b.location === "home";
        return `
        <div class="batch-card">
            <p class="batch-title">${b.cropName}</p>
            <p class="batch-meta">
                <span class="tag ${isHome ? "home" : ""}">${isHome ? "Home Fertigation" : "Commercial Project"}</span>
                <span>Day ${days}</span>
            </p>
        </div>`;
    }).join("");
}

async function fetchBatches() {
    try {
        const res = await fetch(GOOGLE_SCRIPT_URL + "?action=getBatches");
        const data = await res.json();
        if (data.batches) renderBatches(data.batches);
    } catch (e) {
        console.error("Could not load batches:", e);
    }
}

// --- 8. Log Data ---
const CATEGORY_ICON  = { watering: "💧", pest_control: "🐛", harvest: "🧺", sowing: "🌱" };
const CATEGORY_LABEL = { watering: "Watering", pest_control: "Pest Control", harvest: "Harvest", sowing: "Sowing" };

function renderLogs(logs) {
    const container = document.getElementById("logList");
    if (!logs.length) {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">No logs yet.</p>';
        return;
    }
    container.innerHTML = logs.map(log => {
        const isHome = log.projectLocation === "home";
        const icon  = CATEGORY_ICON[log.activityCategory]  || "📝";
        const label = CATEGORY_LABEL[log.activityCategory] || log.activityCategory;
        const financials = (log.costRM || log.revenueRM) ? `
            <div class="log-financials">
                ${log.costRM    ? `<span>Cost: RM ${parseFloat(log.costRM).toFixed(2)}</span>`    : ""}
                ${log.revenueRM ? `<span>Revenue: RM ${parseFloat(log.revenueRM).toFixed(2)}</span>` : ""}
            </div>` : "";
        return `
        <div class="log-card">
            <div class="log-header">
                <span class="log-icon">${icon}</span>
                <div class="log-meta">
                    <p class="log-title">${label}</p>
                    <p class="log-date">${log.date} &middot; <span class="tag ${isHome ? "home" : ""}">${isHome ? "Home" : "Commercial"}</span></p>
                </div>
            </div>
            ${log.inputsUsed ? `<p class="log-inputs">${log.inputsUsed}</p>` : ""}
            ${financials}
        </div>`;
    }).join("");
}

async function fetchLogs() {
    const container = document.getElementById("logList");
    container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">Loading logs...</p>';
    try {
        const res = await fetch(GOOGLE_SCRIPT_URL + "?action=getLogs");
        const data = await res.json();
        renderLogs(data.logs || []);
    } catch (e) {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">Could not load logs.</p>';
    }
}

// --- 9. App Initialization & Listeners ---
window.addEventListener("online", processOfflineQueue);

document.addEventListener("DOMContentLoaded", () => {
    updateSyncBadge();
    processOfflineQueue();
    fetchBatches();

    document.querySelectorAll(".nav-btn[data-view]").forEach(btn => {
        btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js")
            .then(reg => console.log("Service worker registered:", reg.scope))
            .catch(err => console.error("Service worker registration failed:", err));
    }
});