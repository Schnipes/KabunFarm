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
    normalizeCropName,
    findNextAvailableBedNumber
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
let authPromise = null;

export function waitForAuth() {
    if (authPromise) return authPromise;
    if (typeof firebase === "undefined" || typeof firebase.auth !== "function") {
        return Promise.resolve(null);
    }
    authPromise = new Promise((resolve) => {
        try {
            if (!firebase.apps || !firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            const auth = firebase.auth();
            let resolved = false;
            const unsubscribe = auth.onAuthStateChanged((user) => {
                if (user && !resolved) {
                    resolved = true;
                    if (typeof unsubscribe === "function") unsubscribe();
                    resolve(user);
                } else if (!user && !resolved) {
                    auth.signInAnonymously().catch(err => {
                        console.warn("Anonymous auth note:", err?.message || err);
                        if (!resolved) {
                            resolved = true;
                            if (typeof unsubscribe === "function") unsubscribe();
                            resolve(null);
                        }
                    });
                }
            });
            // 3-second fallback for offline / disconnected environments
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    if (typeof unsubscribe === "function") unsubscribe();
                    resolve(auth.currentUser || null);
                }
            }, 3000);
        } catch (e) {
            console.warn("waitForAuth initialization note:", e);
            resolve(null);
        }
    });
    return authPromise;
}

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
if (typeof window !== "undefined") {
    waitForAuth();
}

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

        const allBeds       = bedsSnap.docs.map(d => ({ ...d.data() }));
        const activeBeds    = allBeds.filter(b => b.status !== "retired");
        state.archivedBedsData = allBeds.filter(b => b.status === "retired");
        const activeBatches = activeBatchSnap.docs.map(d => ({ ...d.data() }));
        const doneBatches   = doneBatchSnap.docs.map(d => ({ ...d.data() }));

        if (allBeds.length === 0 && cached) {
            try {
                const cachedArr = JSON.parse(cached);
                if (Array.isArray(cachedArr) && cachedArr.length > 0) {
                    state.bedsData = cachedArr;
                    renderBeds(state.bedsData);
                    populateBedDropdown();
                    renderBedFilterChips();
                    refreshCropDatalists();
                    return;
                }
            } catch (e) {}
        }

        state.bedsData = activeBeds.map(bed => ({
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

        const countEl = document.getElementById("archivedBedsCount");
        if (countEl) countEl.textContent = String(state.archivedBedsData.length);
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
        const docs = snap.docs
            .map(d => ({ ...d.data() }))
            .filter(p => p.status !== "deleted");
        if (docs.length === 0 && cached) {
            try {
                const cachedPlots = JSON.parse(cached);
                if (Array.isArray(cachedPlots) && cachedPlots.length > 0) {
                    state.plotsData = cachedPlots;
                }
            } catch (e) {}
        } else {
            state.plotsData = docs;
            localStorage.setItem(PLOTS_CACHE_KEY, JSON.stringify(state.plotsData));
        }
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
export function addBed(options) {
    if (state.addBedPending) return;
    state.addBedPending = true;
    setTimeout(() => { state.addBedPending = false; }, 1000);

    const targetBedNum = options?.bedNumber 
        ? String(options.bedNumber).trim()
        : String(findNextAvailableBedNumber(state.bedsData));

    if (!targetBedNum) {
        showToast("⚠️ Bed identifier is required");
        return;
    }

    // Check if bed is already active
    if (state.bedsData.some(b => String(b.bedNumber) === targetBedNum)) {
        showToast(`⚠️ Bed ${targetBedNum} already exists!`);
        return;
    }

    // Check if bed was previously archived
    const archivedIdx = state.archivedBedsData.findIndex(b => String(b.bedNumber) === targetBedNum);
    let newBed;
    if (archivedIdx >= 0) {
        newBed = state.archivedBedsData[archivedIdx];
        newBed.status = "active";
        if (options?.name !== undefined) newBed.name = options.name;
        if (options?.plotId !== undefined) newBed.plotId = options.plotId;
        state.archivedBedsData.splice(archivedIdx, 1);
    } else {
        newBed = {
            bedNumber: targetBedNum,
            name:      options?.name || "",
            plotId:    options?.plotId || "",
            location:  "commercial",
            status:    "active",
            crops:     [],
            cropHistory: [],
            lastActivity: null,
            lastWatered:  null
        };
    }

    state.bedsData.push(newBed);
    // Sort beds naturally (numeric ascending)
    state.bedsData.sort((a, b) => {
        const na = Number(a.bedNumber), nb = Number(b.bedNumber);
        return (!isNaN(na) && !isNaN(nb)) ? na - nb : String(a.bedNumber).localeCompare(String(b.bedNumber));
    });

    const activeNums = state.bedsData.map(b => Number(b.bedNumber)).filter(n => !isNaN(n) && n > 0);
    state.maxBedNumber = activeNums.length ? Math.max(...activeNums) : 0;
    localStorage.setItem(BED_MAX_KEY, String(state.maxBedNumber));
    saveBeds();
    renderBeds(state.bedsData);
    populateBedDropdown();
    renderBedFilterChips();

    const countEl = document.getElementById("archivedBedsCount");
    if (countEl) countEl.textContent = String(state.archivedBedsData.length);

    const firestore = getDb();
    if (firestore) {
        firestore.collection("beds").doc(String(targetBedNum)).set(newBed)
            .catch(e => showToast("⚠️ Cloud sync error: " + (e.code || e.message)));
    }
    showToast(`Bed ${targetBedNum} added!`);
}

export function bulkAddBeds(startNum, count, plotId = "") {
    const start = parseInt(startNum, 10) || 1;
    const numBeds = parseInt(count, 10) || 1;
    if (numBeds < 1 || numBeds > 50) {
        showToast("⚠️ Please enter a count between 1 and 50");
        return;
    }

    const firestore = getDb();
    const batch = firestore ? firestore.batch() : null;
    const addedNums = [];

    for (let i = 0; i < numBeds; i++) {
        const bedNumStr = String(start + i);
        if (state.bedsData.some(b => String(b.bedNumber) === bedNumStr)) continue;

        const newBed = {
            bedNumber: bedNumStr,
            name:      "",
            plotId:    plotId || "",
            location:  "commercial",
            status:    "active",
            crops:     [],
            cropHistory: [],
            lastActivity: null,
            lastWatered:  null
        };
        state.bedsData.push(newBed);
        addedNums.push(bedNumStr);

        if (batch) {
            batch.set(firestore.collection("beds").doc(bedNumStr), newBed);
        }
    }

    if (!addedNums.length) {
        showToast("⚠️ All beds in that range already exist!");
        return;
    }

    state.bedsData.sort((a, b) => {
        const na = Number(a.bedNumber), nb = Number(b.bedNumber);
        return (!isNaN(na) && !isNaN(nb)) ? na - nb : String(a.bedNumber).localeCompare(String(b.bedNumber));
    });

    const activeNums = state.bedsData.map(b => Number(b.bedNumber)).filter(n => !isNaN(n) && n > 0);
    state.maxBedNumber = activeNums.length ? Math.max(...activeNums) : 0;
    localStorage.setItem(BED_MAX_KEY, String(state.maxBedNumber));
    saveBeds();
    renderBeds(state.bedsData);
    populateBedDropdown();
    renderBedFilterChips();

    if (batch) {
        batch.commit().catch(e => console.error("Bulk add Firestore batch error:", e));
    }
    showToast(`Added ${addedNums.length} beds (Beds ${addedNums[0]}–${addedNums[addedNums.length - 1]})`);
}

export function seedDefaultFarmBeds() {
    bulkAddBeds(1, 10);
}

export function toggleBedFallow(bedNum) {
    const targetNum = bedNum || state.selectedBedForLog;
    const bed = getBed(targetNum);
    if (!bed) return;

    const isFallow = bed.status === "fallow";
    bed.status = isFallow ? "active" : "fallow";
    saveBeds();
    renderBeds(state.bedsData);

    const btn = document.getElementById("btnToggleFallow");
    if (btn) {
        btn.textContent = bed.status === "fallow" ? "🟢 Set Active" : "💤 Set Fallow";
        btn.classList.toggle("active", bed.status === "fallow");
    }

    const firestore = getDb();
    if (firestore) {
        firestore.collection("beds").doc(String(bed.bedNumber)).update({ status: bed.status })
            .catch(e => console.error("toggleBedFallow failed:", e));
    }
    showToast(bed.status === "fallow" ? `Bed ${bed.bedNumber} is now resting (fallow)` : `Bed ${bed.bedNumber} is now active`);
}

export function restoreBed(bedNum) {
    const idx = state.archivedBedsData.findIndex(b => String(b.bedNumber) === String(bedNum));
    if (idx < 0) return;

    const bed = state.archivedBedsData.splice(idx, 1)[0];
    bed.status = "active";
    state.bedsData.push(bed);
    state.bedsData.sort((a, b) => {
        const na = Number(a.bedNumber), nb = Number(b.bedNumber);
        return (!isNaN(na) && !isNaN(nb)) ? na - nb : String(a.bedNumber).localeCompare(String(b.bedNumber));
    });

    const activeNums = state.bedsData.map(b => Number(b.bedNumber)).filter(n => !isNaN(n) && n > 0);
    state.maxBedNumber = activeNums.length ? Math.max(...activeNums) : 0;
    localStorage.setItem(BED_MAX_KEY, String(state.maxBedNumber));
    saveBeds();
    renderBeds(state.bedsData);
    populateBedDropdown();
    renderBedFilterChips();

    const countEl = document.getElementById("archivedBedsCount");
    if (countEl) countEl.textContent = String(state.archivedBedsData.length);

    const firestore = getDb();
    if (firestore) {
        firestore.collection("beds").doc(String(bed.bedNumber)).update({ status: "active" })
            .catch(e => console.error("restoreBed failed:", e));
    }
    showToast(`Bed ${bed.bedNumber} restored to active beds!`);
}

export function deleteBed() {
    const bed = getBed(state.selectedBedForLog);
    if (!bed) return;
    const label = bed.name ? `Bed ${bed.bedNumber} · ${bed.name}` : `Bed ${bed.bedNumber}`;
    if (!confirm(`Retire ${label}? It will be moved to Archived Beds.`)) return;

    const firestore = getDb();
    if (bed.crops && bed.crops.length && firestore) {
        bed.crops.forEach(c => {
            if (c.id) {
                firestore.collection("batches").doc(c.id).update({ status: "done", harvestDate: todayString() })
                    .catch(e => console.error("retireBatch failed:", e));
            }
        });
    }

    const retiredBed = { ...bed, status: "retired" };
    state.bedsData = state.bedsData.filter(b => String(b.bedNumber) !== String(state.selectedBedForLog));
    state.archivedBedsData.push(retiredBed);

    saveBeds();
    renderBeds(state.bedsData);
    populateBedDropdown();
    renderBedFilterChips();
    state.bedDetailReturnPlotId = null;

    const countEl = document.getElementById("archivedBedsCount");
    if (countEl) countEl.textContent = String(state.archivedBedsData.length);

    const overlay = document.getElementById("bedDetailOverlay");
    if (overlay) overlay.classList.remove("open");
    document.body.style.overflow = "";

    if (firestore) {
        firestore.collection("beds").doc(String(state.selectedBedForLog)).update({ status: "retired" })
            .catch(e => console.error("deleteBed failed:", e));
    }
    showToast(`${label} archived`);
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
