// --- 1. Configuration & UI Variables ---
const STORAGE_KEY = "offline_farm_logs";
// ⚠️ PASTE YOUR GOOGLE APPS SCRIPT URL BELOW ⚠️
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQSzKWjoj3rD4_d045XN4csdYW5VXIHxV9qHviMBUc7iJvacGRHHuBLQPUTecMCBmswQ/exec"
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

// --- 2. Modal Controls ---
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

// --- 3. Offline Storage Engine ---
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
    
    // Attempt to sync immediately if we happen to have internet
    processOfflineQueue();
}

// --- 4. The Cloud Sync Engine ---
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

// --- 5. App Initialization & Listeners ---
window.addEventListener("online", processOfflineQueue);

document.addEventListener("DOMContentLoaded", () => {
    updateSyncBadge();
    processOfflineQueue();

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js")
            .then(reg => console.log("Service worker registered:", reg.scope))
            .catch(err => console.error("Service worker registration failed:", err));
    }
});