// ============================================================================
// Kabun Farm Intelligence — Firebase Firestore & Offline Persistence
// Module: js/db.js
// ============================================================================

import {
    state,
    AUTH_TOKEN_KEY,
    BEDS_CACHE_KEY,
    FORMULAS_CACHE_KEY,
    LOGS_CACHE_KEY,
    SALES_CACHE_KEY,
    TASKS_CACHE_KEY,
    PLOTS_CACHE_KEY,
    BED_MAX_KEY,
    LAST_BED_KEY,
    WEATHER_CACHE_KEY,
    WEATHER_URL,
    DEFAULT_FORMULAS,
    ymd,
    todayString,
    saveBeds,
    showToast,
    getBed,
    getPlot,
    bedsInPlot,
    getKnownCropNames,
    normalizeCropName
} from "./state.js";

import {
    renderBeds,
    populateBedDropdown,
    renderBedFilterChips,
    renderTypeFilterChips,
    refreshCropDatalists,
    renderWeather,
    renderFormulas,
    renderPlanView,
    renderTodayTasks,
    renderCombinedActivity,
    renderFinancialSummary,
    renderCropPL
} from "./views.js";

export const firebaseConfig = {
    apiKey: "AIzaSyBCCbJqzgC8E1JwAZBW31-0hVjYPJe9-Fc",
    authDomain: "kabunfarm.firebaseapp.com",
    projectId: "kabunfarm",
    storageBucket: "kabunfarm.firebasestorage.app",
    messagingSenderId: "9924250387",
    appId: "1:9924250387:web:81e137d46973a9d489e8e6"
};

let db = null;
export function getDb() {
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

// --- Auth & PIN Verification ---
export async function checkPin() {
    let cached = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!cached) {
        cached = window.prompt("Enter farm PIN:") || "";
        if (cached) localStorage.setItem(AUTH_TOKEN_KEY, cached);
    }
    if (!cached) return false;

    try {
        const firestore = getDb();
        if (!firestore) return true;
        const docRef = firestore.collection("config").doc("auth");
        const snap = await docRef.get();
        if (!snap.exists) {
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

// --- Sync Badge ---
export function updateSyncBadge() {
    const badge = document.querySelector(".status-badge");
    if (!badge) return;
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

export async function handleSyncBadgeClick() {
    if (!navigator.onLine) {
        showToast("Offline — changes will sync when connected");
        return;
    }
    const firestore = getDb();
    if (!firestore) {
        showToast("❌ Firebase database is not initialized");
        return;
    }
    showToast("Testing Firebase Cloud connection...");
    try {
        await firestore.collection("config").doc("auth").get();
        const testRef = firestore.collection("config").doc("_conn_probe");
        await testRef.set({ probe: true, timestamp: Date.now() });
        await testRef.delete();
        await seedDefaultFormulas();
        showToast("✅ Firebase Connected: Cloud Sync Active!");
    } catch (e) {
        console.error("Firebase connection probe failed:", e);
        alert("Firebase Cloud Connection Test\n\n❌ Status: Write Failed\nError Code: " + (e.code || "unknown") + "\nMessage: " + (e.message || e) + "\n\nTip: Check if your Firestore Rules allow writes in Firebase Console.");
    }
}

export async function seedDefaultFormulas() {
    const firestore = getDb();
    if (!firestore) return;
    try {
        const snap = await firestore.collection("formulas").get();
        if (snap.empty) {
            for (const f of DEFAULT_FORMULAS) {
                await firestore.collection("formulas").doc(f.id).set(f);
            }
        }
    } catch (e) {
        console.warn("seedDefaultFormulas note:", e);
    }
}

// --- Fetch Routines ---
export async function fetchBeds() {
    const cached = localStorage.getItem(BEDS_CACHE_KEY);
    if (cached) {
        try {
            state.bedsData = JSON.parse(cached);
            renderBeds(state.bedsData);
            populateBedDropdown();
            renderBedFilterChips();
            refreshCropDatalists();
        } catch (e) { /* ignore corrupt cache */ }
    }
    try {
        const firestore = getDb();
        if (!firestore) return;
        const [bedsSnap, activeBatchSnap, doneBatchSnap] = await Promise.all([
            firestore.collection("beds").get(),
            firestore.collection("batches").where("status", "==", "active").get(),
            firestore.collection("batches").where("status", "==", "done").get()
        ]);

        const beds          = bedsSnap.docs.map(d => ({ ...d.data() })).filter(b => b.status !== "retired");
        const activeBatches = activeBatchSnap.docs.map(d => ({ ...d.data() }));
        const doneBatches   = doneBatchSnap.docs.map(d => ({ ...d.data() }));

        state.bedsData = beds.map(bed => ({
            ...bed,
            crops: activeBatches
                .filter(b => String(b.bedNumber) === String(bed.bedNumber))
                .map(b => ({ id: b.id, cropName: b.cropName, plantingDate: ymd(b.plantingDate) })),
            cropHistory: doneBatches
                .filter(b => String(b.bedNumber) === String(bed.bedNumber))
                .map(b => ({ cropName: b.cropName, plantingDate: ymd(b.plantingDate), harvestDate: ymd(b.harvestDate) }))
                .sort((a, b) => (b.harvestDate || "") > (a.harvestDate || "") ? 1 : -1)
        }));

        const activeNums = state.bedsData.map(b => Number(b.bedNumber)).filter(n => !isNaN(n) && n > 0);
        state.maxBedNumber = activeNums.length ? Math.max(...activeNums) : 0;
        localStorage.setItem(BED_MAX_KEY, String(state.maxBedNumber));
        localStorage.setItem(BEDS_CACHE_KEY, JSON.stringify(state.bedsData));

        renderBeds(state.bedsData);
        populateBedDropdown();
        renderBedFilterChips();
        refreshCropDatalists();
    } catch (e) {
        console.error("Could not load beds:", e);
    }
}

export async function fetchFormulas() {
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
        renderFormulas(DEFAULT_FORMULAS);
    }
    try {
        const firestore = getDb();
        if (!firestore) return;
        const snap = await firestore.collection("formulas").get();
        if (snap.empty) {
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
    }
}

export async function fetchTasks() {
    const cached = localStorage.getItem(TASKS_CACHE_KEY);
    if (cached) {
        try {
            state.tasksData = JSON.parse(cached);
            renderPlanView();
            renderTodayTasks();
        } catch (e) { /* ignore */ }
    }
    try {
        const firestore = getDb();
        if (!firestore) return;
        const snap = await firestore.collection("tasks").get();
        state.tasksData = snap.docs.map(d => ({ ...d.data() })).filter(t => t.status !== "deleted");
        localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(state.tasksData));
        renderPlanView();
        renderTodayTasks();
    } catch (e) {
        console.error("Could not load tasks:", e);
    }
}

export async function fetchPlots() {
    const cached = localStorage.getItem(PLOTS_CACHE_KEY);
    if (cached) {
        try { state.plotsData = JSON.parse(cached); } catch (e) { /* ignore */ }
    }
    try {
        const firestore = getDb();
        if (!firestore) return;
        const snap = await firestore.collection("plots").get();
        state.plotsData = snap.docs
            .map(d => ({ ...d.data() }))
            .filter(p => p.status !== "deleted");
        localStorage.setItem(PLOTS_CACHE_KEY, JSON.stringify(state.plotsData));
    } catch (e) {
        console.error("Could not load plots:", e);
    } finally {
        renderBeds(state.bedsData);
        populateBedDropdown();
    }
}

export async function fetchLogs() {
    const container  = document.getElementById("logList");
    const cachedLogs = localStorage.getItem(LOGS_CACHE_KEY);
    if (cachedLogs) {
        try { renderCombinedActivity(); renderCropPL(); } catch (e) { /* ignore */ }
    } else if (container) {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">Loading logs...</p>';
    }
    try {
        const firestore = getDb();
        if (!firestore) return;
        const [logsSnap, salesSnap] = await Promise.all([
            firestore.collection("logs").orderBy("date", "desc").get(),
            firestore.collection("sales").orderBy("date", "desc").get()
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
        if (!cachedLogs && container) {
            container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">Could not load activity.</p>';
        }
    }
}

export async function fetchWeather() {
    const cached = localStorage.getItem(WEATHER_CACHE_KEY);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            renderWeather(parsed.data);
            if (Date.now() - parsed.fetchedAt < 60 * 60 * 1000) return;
        } catch (e) { /* ignore */ }
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

// --- Bed Actions ---
export function addBed() {
    if (state.addBedPending) return;
    state.addBedPending = true;
    setTimeout(() => { state.addBedPending = false; }, 2000);

    const activeNums = state.bedsData.map(b => Number(b.bedNumber)).filter(n => !isNaN(n) && n > 0);
    const nextNum = activeNums.length ? Math.max(...activeNums) + 1 : 1;
    state.maxBedNumber = nextNum;
    localStorage.setItem(BED_MAX_KEY, String(state.maxBedNumber));

    const newBed = {
        bedNumber: nextNum,
        location:  "commercial",
        status:    "active",
        plotId:    "",
        crops:     [],
        lastActivity: null,
        lastWatered:  null
    };

    state.bedsData.push(newBed);
    saveBeds();
    renderBeds(state.bedsData);
    populateBedDropdown();

    const firestore = getDb();
    if (firestore) {
        firestore.collection("beds").doc(String(nextNum)).set(newBed)
            .catch(e => showToast("⚠️ Cloud sync error: " + (e.code || e.message)));
    }
    showToast(`Bed ${nextNum} added!`);
}

export function deleteBed() {
    const bed = getBed(state.selectedBedForLog);
    if (!bed) return;
    const label = bed.name ? `Bed ${bed.bedNumber} · ${bed.name}` : `Bed ${bed.bedNumber}`;
    if (!confirm(`Retire ${label}? It will be hidden from the home screen.`)) return;

    const firestore = getDb();
    if (bed.crops && bed.crops.length && firestore) {
        bed.crops.forEach(c => {
            if (c.id) {
                firestore.collection("batches").doc(c.id).update({ status: "done", harvestDate: todayString() })
                    .catch(e => console.error("retireBatch failed:", e));
            }
        });
    }

    state.bedsData = state.bedsData.filter(b => String(b.bedNumber) !== String(state.selectedBedForLog));
    saveBeds();
    renderBeds(state.bedsData);
    populateBedDropdown();
    state.bedDetailReturnPlotId = null;

    const overlay = document.getElementById("bedDetailOverlay");
    if (overlay) overlay.classList.remove("open");
    document.body.style.overflow = "";

    if (firestore) {
        firestore.collection("beds").doc(String(state.selectedBedForLog)).update({ status: "retired" })
            .catch(e => console.error("deleteBed failed:", e));
    }
    showToast(`${label} retired`);
}

export function saveBedName() {
    const name = document.getElementById("bedNameInput")?.value.trim() || "";
    const bed = getBed(state.selectedBedForLog);
    if (!bed) return;

    bed.name = name;
    saveBeds();
    renderBeds(state.bedsData);

    const titleEl = document.getElementById("bedDetailTitle");
    if (titleEl) titleEl.textContent = name ? `Bed ${bed.bedNumber} · ${name}` : `Bed ${bed.bedNumber}`;
    const row = document.getElementById("bedRenameRow");
    if (row) row.hidden = true;

    const firestore = getDb();
    if (firestore) {
        firestore.collection("beds").doc(String(bed.bedNumber)).update({ name })
            .catch(e => console.error("renameBed failed:", e));
    }
    showToast(name ? `Renamed to "${name}"` : "Name cleared");
}

export function saveBedPlot() {
    const plotId = document.getElementById("bedPlotSelect")?.value || "";
    const bed = getBed(state.selectedBedForLog);
    if (!bed) return;

    bed.plotId = plotId;
    saveBeds();
    renderBeds(state.bedsData);
    const row = document.getElementById("bedPlotRow");
    if (row) row.hidden = true;

    const firestore = getDb();
    if (firestore) {
        if (plotId) {
            firestore.collection("beds").doc(String(bed.bedNumber)).update({ plotId })
                .catch(e => console.error("setBedPlot failed:", e));
        } else {
            firestore.collection("beds").doc(String(bed.bedNumber)).update({ plotId: "" })
                .catch(e => console.error("removeBedFromPlot failed:", e));
        }
    }
    showToast(plotId ? `Added to ${getPlot(plotId)?.name || "plot"}` : "Removed from plot");
}

export async function purgeAllBedsAndPlots() {
    if (!confirm("Are you sure you want to purge all beds and plots? This will reset all bed counters back to 0.")) return;
    
    const firestore = getDb();
    if (firestore) {
        try {
            const [bedsSnap, plotsSnap, batchesSnap] = await Promise.all([
                firestore.collection("beds").get(),
                firestore.collection("plots").get(),
                firestore.collection("batches").get()
            ]);
            const batch = firestore.batch();
            bedsSnap.docs.forEach(doc => batch.delete(doc.ref));
            plotsSnap.docs.forEach(doc => batch.delete(doc.ref));
            batchesSnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        } catch (e) {
            console.error("Purge Firestore failed:", e);
        }
    }

    state.bedsData = [];
    state.plotsData = [];
    state.maxBedNumber = 0;
    localStorage.removeItem(BEDS_CACHE_KEY);
    localStorage.removeItem(PLOTS_CACHE_KEY);
    localStorage.removeItem(BED_MAX_KEY);
    localStorage.removeItem(LAST_BED_KEY);

    renderBeds(state.bedsData);
    populateBedDropdown();
    renderBedFilterChips();
    showToast("All beds & plots purged! Ready to add Bed 1.");
}

export function deletePlot() {
    const plot = getPlot(state.currentPlotId);
    if (!plot) return;
    if (!confirm(`Delete plot "${plot.name}"? Beds keep their own data but leave the plot.`)) return;

    const plotIdToDelete = state.currentPlotId;
    const firestore = getDb();

    state.bedsData.forEach(b => {
        if (String(b.plotId || "") === String(plotIdToDelete)) {
            b.plotId = "";
            if (firestore) firestore.collection("beds").doc(String(b.bedNumber)).update({ plotId: "" }).catch(e => console.error(e));
        }
    });
    saveBeds();

    state.plotsData = state.plotsData.filter(p => String(p.id) !== String(plotIdToDelete));
    localStorage.setItem(PLOTS_CACHE_KEY, JSON.stringify(state.plotsData));

    if (firestore) {
        firestore.collection("plots").doc(plotIdToDelete).update({ status: "deleted" }).catch(e => console.error(e));
    }

    renderBeds(state.bedsData);
    populateBedDropdown();
    const overlay = document.getElementById("plotDetailOverlay");
    if (overlay) overlay.classList.remove("open");
    document.body.style.overflow = "";
    state.currentPlotId = null;
    showToast(`Plot "${plot.name}" deleted`);
}

export function deleteLogEntry(id) {
    if (!confirm("Delete this activity log?")) return;

    const logs = JSON.parse(localStorage.getItem(LOGS_CACHE_KEY) || "[]");
    const updatedLogs = logs.filter(l => String(l.id) !== String(id));
    localStorage.setItem(LOGS_CACHE_KEY, JSON.stringify(updatedLogs));

    const sales = JSON.parse(localStorage.getItem(SALES_CACHE_KEY) || "[]");
    const updatedSales = sales.filter(s => String(s.id) !== String(id));
    localStorage.setItem(SALES_CACHE_KEY, JSON.stringify(updatedSales));

    const firestore = getDb();
    if (firestore) {
        if (String(id).startsWith("sale_")) {
            firestore.collection("sales").doc(id).update({ status: "deleted" }).catch(e => console.error(e));
        } else {
            firestore.collection("logs").doc(id).update({ status: "deleted" }).catch(e => console.error(e));
        }
    }

    renderCombinedActivity();
    renderFinancialSummary();
    renderCropPL();
    showToast("Log entry deleted");
}
