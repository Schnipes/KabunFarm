// ============================================================================
// Kabun Farm Intelligence — Root Application Controller & Window Bridge
// Module: js/app.js
// ============================================================================

import {
    state,
    BEDS_CACHE_KEY,
    FORMULAS_CACHE_KEY,
    LOGS_CACHE_KEY,
    SALES_CACHE_KEY,
    TASKS_CACHE_KEY,
    PLOTS_CACHE_KEY,
    LAST_BED_KEY,
    CATEGORY_COLOR_KEY,
    MODAL_TITLES,
    DEFAULT_CATEGORY,
    CATEGORY_LABEL,
    localDateStr,
    ymd,
    todayString,
    daysSince,
    showToast,
    saveBeds,
    normalizeCropName,
    normalizeCategoryKey,
    getCategoryColorMap,
    getBed,
    getPlot,
    bedsInPlot,
    resolveTaskScopeMeta
} from "./state.js";

import {
    parseRecipe,
    recalcAllDoses,
    calcSaleTotal,
    exportActivityCsv
} from "./calculations.js";

import {
    getDb,
    checkPin,
    updateSyncBadge,
    handleSyncBadgeClick,
    fetchBeds,
    fetchFormulas,
    fetchTasks,
    fetchPlots,
    fetchLogs,
    fetchWeather,
    addBed,
    deleteBed,
    saveBedName,
    saveBedPlot,
    purgeAllBedsAndPlots,
    deletePlot,
    deleteLogEntry
} from "./db.js";

import {
    renderBeds,
    populateBedDropdown,
    renderBedFilterChips,
    renderTypeFilterChips,
    renderCombinedActivity,
    renderFinancialSummary,
    renderCropPL,
    filterLogs,
    filterByType,
    clearActivityFilters,
    renderCategorySwatchPicker,
    renderQuickFormulaChips,
    selectQuickFormula,
    updateSprayerTotalDisplay,
    updateQuickFormulaDosePreview,
    onSprayerParamChange,
    renderPlanView,
    renderTodayTasks,
    populateTaskFormulaList,
    refreshCropDatalists
} from "./views.js";

// --- 1. View Switching ---
export function switchView(viewName) {
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

export function setBedViewMode(mode) {
    state.bedViewMode = mode;
    localStorage.setItem("farmlog_view_mode", mode);
    document.getElementById("btnViewList")?.classList.toggle("active", mode === "list");
    document.getElementById("btnViewGrid")?.classList.toggle("active", mode === "grid");
    const listEl = document.getElementById("batchList");
    const gridEl = document.getElementById("bedGridList");
    if (listEl) listEl.hidden = (mode === "grid");
    if (gridEl) gridEl.hidden = (mode !== "grid");
    renderBeds(state.bedsData);
}

export function setFinPeriod(period) {
    state.finPeriod = period;
    document.getElementById("finWeekBtn")?.classList.toggle("active", period === "week");
    document.getElementById("finMonthBtn")?.classList.toggle("active", period === "month");
    renderFinancialSummary();
}

// --- 2. 1-Tap Date Presets ---
export function setDatePreset(inputId, offsetDays, btnElement) {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    const dateVal = localDateStr(d);
    const input = document.getElementById(inputId);
    if (input) {
        input.value = dateVal;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const container = document.getElementById(inputId + "Pills");
    if (container) {
        container.querySelectorAll(".date-pill-btn").forEach(btn => btn.classList.remove("active"));
        if (btnElement) {
            btnElement.classList.add("active");
        }
    }
}

export function syncDatePresets(inputId) {
    const input = document.getElementById(inputId);
    const container = document.getElementById(inputId + "Pills");
    if (!input || !container) return;
    const currentVal = input.value;
    const todayVal = todayString();
    const dYesterday = new Date();
    dYesterday.setDate(dYesterday.getDate() - 1);
    const yesterdayVal = localDateStr(dYesterday);

    const buttons = container.querySelectorAll(".date-pill-btn");
    buttons.forEach(btn => {
        const text = btn.textContent.trim().toLowerCase();
        if (text === "today") {
            btn.classList.toggle("active", currentVal === todayVal);
        } else if (text === "yesterday") {
            btn.classList.toggle("active", currentVal === yesterdayVal);
        } else {
            btn.classList.remove("active");
        }
    });
}

// --- 3. Activity Log Modal ---
export function openModal(type, targetBed) {
    document.getElementById("modalTitle").textContent = MODAL_TITLES[type] || "Log activity";
    document.getElementById("logDate").value = todayString();
    syncDatePresets("logDate");
    document.getElementById("activityCategory").value = DEFAULT_CATEGORY[type] || "";

    populateBedDropdown();

    const scopeEl = document.getElementById("bedScope");
    const lastBed = localStorage.getItem(LAST_BED_KEY);
    const chosen = targetBed || (type === "crop" && state.selectedBedForLog) || lastBed;

    if (scopeEl) {
        if (targetBed) {
            scopeEl.value = String(targetBed);
        } else if (chosen && (type !== "crop" || (chosen !== "all" && !String(chosen).startsWith("plot_") && chosen !== "multi"))) {
            scopeEl.value = String(chosen);
        } else if (type === "crop" && state.bedsData.length) {
            scopeEl.value = String(state.bedsData[0].bedNumber);
        } else {
            scopeEl.value = "all";
        }
    }

    updateBedFields();
    if (document.getElementById("logTankCount")) {
        document.getElementById("logTankCount").value = "1";
    }
    state.selectedQuickFormulaId = null;
    updateSprayerTotalDisplay();
    renderQuickFormulaChips();
    updateQuickFormulaDosePreview();
    document.getElementById("modalOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
}

export function closeModal() {
    document.getElementById("modalOverlay")?.classList.remove("open");
    document.body.style.overflow = "";
    document.getElementById("logForm")?.reset();
    state.selectedQuickFormulaId = null;
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
    document.getElementById("logDate")?.classList.remove("invalid");
    document.getElementById("activityCategory")?.classList.remove("invalid");
    document.getElementById("newCropName")?.classList.remove("invalid");
}

export function toggleInputs() {
    const field = document.getElementById("inputsField");
    const btn   = document.getElementById("toggleInputsBtn");
    if (!field || !btn) return;
    field.hidden = !field.hidden;
    btn.textContent = field.hidden ? "＋ Extra notes" : "− Remove notes";
}

export function toggleFinancials() {
    const field = document.getElementById("financialsField");
    const btn   = document.getElementById("toggleFinancialsBtn");
    if (!field || !btn) return;
    field.hidden = !field.hidden;
    btn.textContent = field.hidden ? "＋ Add cost" : "− Remove cost";
}

export function stepTankCount(delta) {
    const input = document.getElementById("logTankCount");
    if (!input) return;
    let val = (parseInt(input.value, 10) || 1) + delta;
    if (val < 1) val = 1;
    if (val > 50) val = 50;
    input.value = String(val);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function toggleSelectAllBeds(btn) {
    const cbs = document.querySelectorAll('input[name="multiBedSelect"]');
    const allChecked = [...cbs].every(cb => cb.checked);
    cbs.forEach(cb => { cb.checked = !allChecked; });
    if (btn) btn.textContent = allChecked ? "Select all" : "Deselect all";
}

export function updateBedFields() {
    const scope      = document.getElementById("bedScope")?.value || "all";
    const activity   = document.getElementById("activityCategory")?.value || "";
    const isSowing   = activity === "sowing";
    const isHarvest  = activity === "harvest";
    const isPlot     = scope.startsWith("plot_");
    const isMulti    = scope === "multi";
    const isSpecific = scope !== "all" && !isPlot && !isMulti;

    if (isSowing && (scope === "all" || isPlot || isMulti) && state.bedsData.length) {
        document.getElementById("bedScope").value = state.bedsData[0].bedNumber;
        showToast("Sowing requires a specific bed — switched to Bed " + state.bedsData[0].bedNumber);
        updateBedFields();
        return;
    }

    document.getElementById("currentCropsField").hidden  = true;
    document.getElementById("harvestCropsField").hidden  = true;
    document.getElementById("harvestWeightField").hidden = true;
    document.getElementById("newCropField").hidden       = true;
    document.getElementById("newCropName").required      = false;
    document.getElementById("multiBedField").hidden      = !isMulti;

    if (isMulti) {
        const list = document.getElementById("multiBedChecklist");
        if (list) {
            list.innerHTML = state.bedsData.map((b, i) => {
                const cropNames = (b.crops || []).map(c => c.cropName).join(", ");
                const cropStr = cropNames ? ` · 🌱 ${cropNames}` : " · Empty";
                return `
                <label class="harvest-crop-check">
                    <input type="checkbox" name="multiBedSelect" value="${escapeHtml(String(b.bedNumber))}" checked id="mbed_${i}">
                    <span>Bed ${escapeHtml(String(b.bedNumber))}${b.name ? " · " + escapeHtml(b.name) : ""}<span style="color:#4b5563;font-size:12px;">${escapeHtml(cropStr)}</span></span>
                </label>`;
            }).join("");
        }
    }

    const isSpraying = activity === "pest_control" || activity === "watering";
    const quickSection = document.getElementById("quickFormulaSection");
    const sprayerRow   = document.getElementById("logSprayerVolRow");
    if (quickSection) quickSection.hidden = !isSpraying;
    if (sprayerRow)   sprayerRow.hidden   = !isSpraying;

    const contextBar = document.getElementById("bedContextBar");
    if (isSpecific) {
        const bed = getBed(scope);
        if (bed && bed.crops && bed.crops.length) {
            contextBar.innerHTML = bed.crops.map(c =>
                `<span>🌱 ${escapeHtml(c.cropName)} · Day ${daysSince(c.plantingDate)}</span>`
            ).join("");
        } else {
            contextBar.innerHTML = '<span style="color:#888;">Empty bed — ready to sow</span>';
        }
        contextBar.hidden = false;
    } else if (isPlot) {
        const members = bedsInPlot(scope);
        const names = [...new Set(members.flatMap(b => (b.crops || []).map(c => c.cropName)))];
        contextBar.innerHTML = names.length
            ? names.map(n => `<span>🌱 ${escapeHtml(n)}</span>`).join("")
            : '<span style="color:#888;">No crops growing in this plot</span>';
        contextBar.hidden = false;
    } else {
        contextBar.hidden = true;
    }

    if ((isPlot || isMulti) && !isHarvest) return;
    if (!isSpecific && !isPlot && !isMulti) return;

    const bed = isSpecific ? getBed(scope) : null;

    if (isSowing) {
        document.getElementById("newCropField").hidden  = false;
        document.getElementById("newCropName").required = true;
    } else if (isHarvest) {
        const list = document.getElementById("harvestCropsList");
        const harvestBeds = isPlot ? bedsInPlot(scope) :
                            isMulti ? [...document.querySelectorAll('input[name="multiBedSelect"]:checked')].map(cb => getBed(cb.value)).filter(Boolean) :
                            (bed ? [bed] : []);
        const rows = harvestBeds.flatMap((b, bi) =>
            (b.crops || []).map((c, i) => `
            <label class="harvest-crop-check">
                <input type="checkbox" name="harvestCrop" value="${escapeHtml(String(c.id || ""))}" data-crop="${escapeHtml(c.cropName)}" data-bed="${escapeHtml(String(b.bedNumber))}" id="hcrop_${bi}_${i}">
                <span>${escapeHtml(c.cropName)}${isPlot || isMulti ? ` <span style="color:#888;">· Bed ${escapeHtml(String(b.bedNumber))}</span>` : ""}</span>
            </label>`)
        );
        if (rows.length && list) {
            list.innerHTML = rows.join("");
            document.getElementById("harvestCropsField").hidden = false;
        }
        document.getElementById("harvestWeightField").hidden = false;
    } else {
        const tags = document.getElementById("currentCropsTags");
        if (tags) {
            tags.innerHTML = (bed && bed.crops && bed.crops.length)
                ? bed.crops.map(c => `<span class="tag">${escapeHtml(c.cropName)}</span>`).join("")
                : '<span style="color:#888;font-size:13px;">Empty bed</span>';
        }
        document.getElementById("currentCropsField").hidden = false;
    }
}

export function handleSubmit(event) {
    event.preventDefault();

    const date     = document.getElementById("logDate")?.value;
    const activity = document.getElementById("activityCategory")?.value;

    const dateEl     = document.getElementById("logDate");
    const activityEl = document.getElementById("activityCategory");
    dateEl?.classList.toggle("invalid", !date);
    activityEl?.classList.toggle("invalid", !activity);
    if (!date || !activity) {
        showToast("Please fill in the required fields.");
        return;
    }

    const bedScope = document.getElementById("bedScope")?.value;
    const cropName = normalizeCropName(document.getElementById("newCropName")?.value.trim());

    if (activity === "sowing" && !cropName) {
        document.getElementById("newCropName")?.classList.add("invalid");
        showToast("Please enter the crop being sown.");
        return;
    }

    const isMulti = bedScope === "multi";
    const selectedBedNums = isMulti
        ? [...document.querySelectorAll('input[name="multiBedSelect"]:checked')].map(cb => cb.value)
        : (bedScope === "all" ? ["all"] : [bedScope]);

    if (isMulti && !selectedBedNums.length) {
        showToast("Please select at least one bed to log.");
        return;
    }

    const harvestedCropNames = activity === "harvest"
        ? [...document.querySelectorAll('input[name="harvestCrop"]:checked')].map(cb => cb.dataset.crop)
        : [];

    const firestore = getDb();
    const inputsUsed = document.getElementById("inputsUsed")?.value || "";
    const costRM = document.getElementById("costRM")?.value || "";
    const weight = activity === "harvest" ? (document.getElementById("harvestWeight")?.value || "") : "";

    selectedBedNums.forEach((targetScope, idx) => {
        const entry = {
            id:               "log_" + Date.now() + "_" + idx,
            date,
            bedNumber:        targetScope,
            activityCategory: activity,
            cropName:         activity === "sowing"  ? cropName :
                               activity === "harvest" ? harvestedCropNames.join(", ") : (() => {
                if (targetScope === "all") return "";
                if (targetScope.startsWith("plot_")) {
                    const names = new Set();
                    bedsInPlot(targetScope).forEach(b => (b.crops || []).forEach(c => names.add(c.cropName)));
                    return [...names].join(", ");
                }
                const bed = getBed(targetScope);
                return bed && bed.crops && bed.crops.length ? bed.crops.map(c => c.cropName).join(", ") : "";
            })(),
            inputsUsed,
            costRM,
            revenueRM:        "",
            weight,
            status:           "active"
        };

        if (firestore) {
            firestore.collection("logs").doc(entry.id).set(entry).catch(e => console.error("addLog failed:", e));
        }

        // Cache update
        const logs = JSON.parse(localStorage.getItem(LOGS_CACHE_KEY) || "[]");
        logs.unshift(entry);
        localStorage.setItem(LOGS_CACHE_KEY, JSON.stringify(logs));

        // Update bed metadata
        if (targetScope && targetScope.startsWith("plot_")) {
            const members = bedsInPlot(targetScope);
            members.forEach(b => {
                b.lastActivity = { type: activity, date };
                if (activity === "watering") b.lastWatered = date;
                const bedUpdate = { lastActivity: { type: activity, date } };
                if (activity === "watering") bedUpdate.lastWatered = date;
                if (firestore) firestore.collection("beds").doc(String(b.bedNumber)).update(bedUpdate).catch(e => console.error(e));
            });
        } else if (targetScope !== "all") {
            const bed = getBed(targetScope);
            if (bed) {
                bed.lastActivity = { type: activity, date };
                if (activity === "watering") bed.lastWatered = date;
                const bedUpdate = { lastActivity: { type: activity, date } };
                if (activity === "watering") bedUpdate.lastWatered = date;
                if (firestore) firestore.collection("beds").doc(String(targetScope)).update(bedUpdate).catch(e => console.error(e));
            }
        } else if (activity === "watering") {
            state.bedsData.forEach(b => { b.lastWatered = date; });
        }
    });

    if (activity === "sowing" && bedScope !== "all" && !isMulti && cropName) {
        const batchId = "batch_" + Date.now();
        const batch = {
            id:          batchId,
            bedNumber:   bedScope,
            cropName,
            location:    "commercial",
            plantingDate: date,
            status:      "active"
        };
        if (firestore) firestore.collection("batches").doc(batchId).set(batch).catch(e => console.error("addBatch failed:", e));
        const bed = getBed(bedScope);
        if (bed) {
            bed.crops = bed.crops || [];
            bed.crops.push({ id: batchId, cropName, plantingDate: date });
        }
        populateBedDropdown();
    }

    if (activity === "harvest") {
        const checkedCbs = [...document.querySelectorAll('input[name="harvestCrop"]:checked')];
        const checkedIds = checkedCbs.map(cb => cb.value).filter(Boolean);

        const harvestBeds = bedScope.startsWith("plot_")
            ? bedsInPlot(bedScope)
            : isMulti ? selectedBedNums.map(bn => getBed(bn)).filter(Boolean)
            : (getBed(bedScope) ? [getBed(bedScope)] : []);

        harvestBeds.forEach(b => {
            const retiring = (b.crops || []).filter(c =>
                c.id ? checkedIds.includes(c.id) : checkedCbs.some(cb => cb.dataset.bed === String(b.bedNumber) && cb.dataset.crop === c.cropName)
            );
            b.cropHistory = b.cropHistory || [];
            retiring.forEach(c => {
                b.cropHistory.unshift({ cropName: c.cropName, plantingDate: c.plantingDate, harvestDate: date });
                if (c.id && firestore) {
                    firestore.collection("batches").doc(c.id).update({ status: "done", harvestDate: date })
                        .catch(e => console.error("retireBatch failed:", e));
                }
            });
            b.crops = (b.crops || []).filter(c => !retiring.includes(c));
        });
        populateBedDropdown();
    }

    saveBeds();
    renderBeds(state.bedsData);
    closeModal();

    const bedLabel = bedScope === "all" ? "Whole Farm" :
                      bedScope === "multi" ? `${selectedBedNums.length} Beds` :
                      bedScope.startsWith("plot_") ? (getPlot(bedScope)?.name || "Plot") :
                      `Bed ${bedScope}`;
    const actLabel = CATEGORY_LABEL[activity] || activity;
    showToast(`${actLabel} logged · ${bedLabel}`);
}

// --- 4. Bed Detail Modal ---
export function openBedDetail(bedNum) {
    const bed = getBed(bedNum);
    if (!bed) {
        console.warn("openBedDetail: Bed not found for", bedNum);
        return;
    }

    state.selectedBedForLog = bedNum;
    const bedLabel = bed.name ? `Bed ${bedNum} · ${bed.name}` : `Bed ${bedNum}`;
    const titleEl = document.getElementById("bedDetailTitle");
    if (titleEl) titleEl.textContent = bedLabel;

    const content = document.getElementById("bedDetailContent");
    let html = "";

    if (!bed.crops || !bed.crops.length) {
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

    if (content) content.innerHTML = html;

    const isEmpty = !bed.crops || !bed.crops.length;
    const waterBtn = document.querySelector(".bed-log-actions .water");
    if (waterBtn) waterBtn.hidden = isEmpty;
    const pestBtn = document.querySelector(".bed-log-actions .pest");
    if (pestBtn) pestBtn.hidden = isEmpty;
    const harvestBtn = document.querySelector(".bed-log-actions .harvest");
    if (harvestBtn) harvestBtn.hidden = isEmpty;

    document.getElementById("bedDetailOverlay")?.classList.add("open");
    document.body.style.overflow = "hidden";
}

export function closeBedDetail() {
    document.getElementById("bedDetailOverlay")?.classList.remove("open");
    document.body.style.overflow = "";
    const renameRow = document.getElementById("bedRenameRow");
    const plotRow   = document.getElementById("bedPlotRow");
    if (renameRow) renameRow.hidden = true;
    if (plotRow)   plotRow.hidden   = true;
    if (state.bedDetailReturnPlotId) {
        const retId = state.bedDetailReturnPlotId;
        state.bedDetailReturnPlotId = null;
        openPlotDetail(retId);
    }
}

export function toggleBedRename() {
    const row = document.getElementById("bedRenameRow");
    if (!row) return;
    row.hidden = !row.hidden;
    if (!row.hidden) {
        const bed = getBed(state.selectedBedForLog);
        const input = document.getElementById("bedNameInput");
        if (input) {
            input.value = bed?.name || "";
            input.focus();
        }
    }
}

export function toggleBedPlotPicker() {
    const row = document.getElementById("bedPlotRow");
    if (!row) return;
    row.hidden = !row.hidden;
    if (!row.hidden) {
        const bed = getBed(state.selectedBedForLog);
        const select = document.getElementById("bedPlotSelect");
        if (select) {
            select.innerHTML = '<option value="">No plot</option>' +
                state.plotsData.map(p => `<option value="${escapeHtml(String(p.id))}">${escapeHtml(p.name)}</option>`).join("");
            select.value = bed?.plotId || "";
        }
    }
}

export function logForBed(type) {
    const targetBed = state.selectedBedForLog;
    state.bedDetailReturnPlotId = null;
    closeBedDetail();
    openModal(type, targetBed);
}

export function logForPlot(type) {
    const plotId = state.currentPlotId;
    closePlotDetail();
    openModal(type === "spray" ? "water" : type, plotId);
}

// --- 5. Sales Modal ---
export function openSaleModal() {
    document.getElementById("saleDate").value = todayString();
    syncDatePresets("saleDate");
    document.getElementById("saleCrop").value = "";
    document.getElementById("saleQty").value = "";
    document.getElementById("saleUnit").value = "kg";
    document.getElementById("salePricePerUnit").value = "";
    document.getElementById("saleTotalDisplay").textContent = "RM 0.00";
    document.getElementById("saleCrop")?.classList.remove("invalid");
    document.getElementById("saleQty")?.classList.remove("invalid");
    document.getElementById("salePricePerUnit")?.classList.remove("invalid");

    refreshCropDatalists();
    document.getElementById("saleModalOverlay")?.classList.add("open");
    document.body.style.overflow = "hidden";
}

export function closeSaleModal() {
    document.getElementById("saleModalOverlay")?.classList.remove("open");
    document.body.style.overflow = "";
}

export function handleSaleSubmit(event) {
    event.preventDefault();

    const date         = document.getElementById("saleDate")?.value;
    const crop         = normalizeCropName(document.getElementById("saleCrop")?.value.trim());
    const qty          = document.getElementById("saleQty")?.value;
    const unit         = document.getElementById("saleUnit")?.value;
    const pricePerUnit = document.getElementById("salePricePerUnit")?.value;

    const cropEl  = document.getElementById("saleCrop");
    const qtyEl   = document.getElementById("saleQty");
    const priceEl = document.getElementById("salePricePerUnit");
    cropEl?.classList.toggle("invalid",  !crop);
    qtyEl?.classList.toggle("invalid",   !qty);
    priceEl?.classList.toggle("invalid", !pricePerUnit);
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

    const firestore = getDb();
    if (firestore) {
        firestore.collection("sales").doc(entry.id).set(entry).catch(e => console.error("addSale failed:", e));
    }

    const cached = localStorage.getItem(SALES_CACHE_KEY);
    const sales  = cached ? JSON.parse(cached) : [];
    sales.unshift(entry);
    localStorage.setItem(SALES_CACHE_KEY, JSON.stringify(sales));

    closeSaleModal();
    showToast(`Sale logged · ${qty} ${unit} ${crop} · RM ${totalRevenue}`);

    if (!document.getElementById("view-data").hidden) {
        renderCombinedActivity();
        renderFinancialSummary();
        renderCropPL();
    }
}

// --- 6. Task Modal & 1-Tap Execution ---
export function openTaskModal() {
    document.getElementById("taskDate").value = todayString();
    syncDatePresets("taskDate");
    document.getElementById("taskNote").value = "";
    document.getElementById("taskRepeat").checked = false;
    document.getElementById("taskActivityCategory").value = "";
    document.getElementById("taskDate")?.classList.remove("invalid");
    state.selectedTaskFormulaId = null;

    document.querySelectorAll("#taskSlotRow .pill-choice").forEach(b =>
        b.classList.toggle("selected", b.dataset.slot === "Anytime")
    );

    const plotGroup = document.getElementById("taskPlotScopeGroup");
    const bedGroup  = document.getElementById("taskBedScopeGroup");
    if (plotGroup && bedGroup) {
        plotGroup.innerHTML = "";
        bedGroup.innerHTML  = "";
        state.plotsData.forEach(plot => {
            const opt = document.createElement("option");
            opt.value = plot.id;
            opt.textContent = plot.name;
            plotGroup.appendChild(opt);
        });
        state.bedsData.forEach(bed => {
            const opt = document.createElement("option");
            opt.value = bed.bedNumber;
            opt.textContent = "Bed " + bed.bedNumber;
            bedGroup.appendChild(opt);
        });
    }

    populateTaskFormulaList();
    document.getElementById("taskModalOverlay")?.classList.add("open");
    document.body.style.overflow = "hidden";
}

export function closeTaskModal() {
    document.getElementById("taskModalOverlay")?.classList.remove("open");
    document.body.style.overflow = "";
    state.selectedTaskFormulaId = null;
}

export function selectTaskSlot(btn) {
    document.querySelectorAll("#taskSlotRow .pill-choice").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
}

export function selectTaskFormula(id) {
    state.selectedTaskFormulaId = state.selectedTaskFormulaId === id ? null : id;
    populateTaskFormulaList();
}

export function handleTaskSubmit(event) {
    event.preventDefault();
    const date = document.getElementById("taskDate")?.value;
    const dateEl = document.getElementById("taskDate");
    dateEl?.classList.toggle("invalid", !date);
    if (!date) {
        showToast("Please pick a date for the task.");
        return;
    }

    const timeSlot         = document.querySelector("#taskSlotRow .pill-choice.selected")?.dataset.slot || "Anytime";
    const bedNumber        = document.getElementById("taskBed")?.value || "";
    const activityCategory = document.getElementById("taskActivityCategory")?.value || "";
    const note             = document.getElementById("taskNote")?.value.trim() || "";
    const repeat           = document.getElementById("taskRepeat")?.checked;

    const dayCount  = repeat ? 7 : 1;
    const startDate = new Date(date + "T00:00:00");
    const firestore = getDb();

    for (let i = 0; i < dayCount; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const newTask = {
            id:               "task_" + Date.now() + "_" + i,
            date:             localDateStr(d),
            timeSlot,
            bedNumber,
            activityCategory,
            formulaId:        state.selectedTaskFormulaId || "",
            note,
            status:           "active"
        };
        state.tasksData.push(newTask);
        if (firestore) {
            firestore.collection("tasks").doc(newTask.id).set(newTask).catch(e => console.error("addTask failed:", e));
        }
    }

    localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(state.tasksData));
    renderPlanView();
    renderTodayTasks();
    closeTaskModal();
    showToast(repeat ? "Tasks added for the week" : "Task added");
}

export function toggleTaskDone(taskId) {
    const task = state.tasksData.find(t => String(t.id) === String(taskId));
    if (!task) return;
    const newStatus = task.status === "done" ? "active" : "done";
    task.status = newStatus;
    localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(state.tasksData));
    renderPlanView();
    renderTodayTasks();
    const firestore = getDb();
    if (firestore) {
        firestore.collection("tasks").doc(String(task.id)).update({ status: newStatus }).catch(e => console.error(e));
    }
}

export async function executeTaskNow(taskId, event) {
    if (event) event.stopPropagation();
    const task = state.tasksData.find(t => String(t.id) === String(taskId));
    if (!task) return;

    const formula = task.formulaId ? state.formulasData.find(f => String(f.id) === String(task.formulaId)) : null;
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
                bedsInPlot(scope).forEach(b => (b.crops || []).forEach(c => names.add(c.cropName)));
                return [...names].join(", ");
            }
            const bed = getBed(scope);
            return bed && bed.crops && bed.crops.length ? bed.crops.map(c => c.cropName).join(", ") : "";
        })(),
        inputsUsed,
        costRM: "",
        revenueRM: "",
        weight: "",
        status: "active"
    };

    const cachedLogs = JSON.parse(localStorage.getItem(LOGS_CACHE_KEY) || "[]");
    cachedLogs.unshift(logEntry);
    localStorage.setItem(LOGS_CACHE_KEY, JSON.stringify(cachedLogs));

    task.status = "done";
    localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(state.tasksData));
    renderPlanView();
    renderTodayTasks();

    const firestore = getDb();
    if (String(scope).startsWith("plot_")) {
        const members = bedsInPlot(scope);
        members.forEach(b => {
            b.lastActivity = { type: activity, date };
            const bedUpdate = { lastActivity: { type: activity, date } };
            if (activity === "watering") {
                b.lastWatered = date;
                bedUpdate.lastWatered = date;
            }
            if (firestore) firestore.collection("beds").doc(String(b.bedNumber)).update(bedUpdate).catch(e => console.error(e));
        });
        saveBeds();
        renderBeds(state.bedsData);
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
            renderBeds(state.bedsData);
            if (firestore) firestore.collection("beds").doc(String(scope)).update(bedUpdate).catch(e => console.error(e));
        }
    }

    if (firestore) {
        firestore.collection("logs").doc(logId).set(logEntry).catch(e => console.error(e));
        firestore.collection("tasks").doc(String(task.id)).update({ status: "done" }).catch(e => console.error(e));
    }

    const scopeLabel = resolveTaskScopeMeta(task);
    showToast(`⚡ 1-Tap Logged: ${CATEGORY_LABEL[activity] || activity} · ${scopeLabel}`);
}

// --- 7. Formula Modal ---
export function openFormulaModal(index = null) {
    state.editingFormulaIndex = index;
    const isEdit = index !== null;
    const formula = isEdit ? state.formulasData[index] : null;

    document.getElementById("formulaModalTitle").textContent = isEdit ? "Edit formula" : "New formula";
    document.getElementById("formulaSubmitBtn").textContent  = isEdit ? "Save changes" : "Save formula";
    document.getElementById("formulaName").value = formula ? formula.name : "";
    document.getElementById("formulaCategory").value = formula ? (formula.category || "") : "";
    document.getElementById("formulaDesc").value = formula ? (formula.description || "") : "";
    document.getElementById("formulaName")?.classList.remove("invalid");

    renderCategorySwatchPicker(formula ? formula.category : "");

    const ingList = document.getElementById("ingredientList");
    if (ingList) ingList.innerHTML = "";
    if (formula && formula.recipe) {
        const parsed = parseRecipe(formula.recipe);
        if (parsed && parsed.length) {
            parsed.forEach(ing => addIngredientRow(ing.name, ing.amount, ing.unit));
        } else {
            addIngredientRow();
        }
    } else {
        addIngredientRow();
    }

    document.getElementById("formulaModalOverlay")?.classList.add("open");
    document.body.style.overflow = "hidden";
}

export function closeFormulaModal() {
    document.getElementById("formulaModalOverlay")?.classList.remove("open");
    document.body.style.overflow = "";
    state.editingFormulaIndex = null;
    state.selectedCategoryColor = null;
}

export function selectCategorySwatch(hex) {
    state.selectedCategoryColor = hex;
    document.querySelectorAll("#categorySwatchPicker .category-swatch").forEach(btn => {
        btn.classList.toggle("selected", (btn.dataset.hex || null) === (hex || null));
    });
}

export function addIngredientRow(name = "", amount = "", unit = "ml") {
    const list = document.getElementById("ingredientList");
    if (!list) return;
    const row = document.createElement("div");
    row.className = "ingredient-edit-row";
    row.innerHTML = `
        <input type="text" placeholder="Ingredient" value="${escapeHtml(name)}" class="ing-name">
        <input type="number" placeholder="Dose/L" value="${amount !== "" ? amount : ""}" min="0" step="any" class="ing-amount">
        <select class="ing-unit">
            <option value="ml"${unit === "ml" ? " selected" : ""}>ml/L</option>
            <option value="g"${unit === "g" ? " selected" : ""}>g/L</option>
        </select>
        <button type="button" class="ing-remove-btn" onclick="this.closest('.ingredient-edit-row').remove()" aria-label="Remove ingredient">✕</button>
    `;
    list.appendChild(row);
}

export function handleFormulaSubmit(event) {
    event.preventDefault();
    const name = document.getElementById("formulaName")?.value.trim();
    if (!name) {
        document.getElementById("formulaName")?.classList.add("invalid");
        return;
    }

    const category = document.getElementById("formulaCategory")?.value.trim();
    const desc     = document.getElementById("formulaDesc")?.value.trim();

    if (category && state.selectedCategoryColor !== undefined) {
        const catKey = normalizeCategoryKey(category);
        const map = getCategoryColorMap();
        if (state.selectedCategoryColor) {
            map[catKey] = state.selectedCategoryColor;
        } else {
            delete map[catKey];
        }
        localStorage.setItem(CATEGORY_COLOR_KEY, JSON.stringify(map));
    }

    const rows = [...document.querySelectorAll("#ingredientList .ingredient-edit-row")];
    const ingredients = [];
    rows.forEach(r => {
        const iName   = r.querySelector(".ing-name")?.value.trim();
        const iAmount = parseFloat(r.querySelector(".ing-amount")?.value);
        const iUnit   = r.querySelector(".ing-unit")?.value || "ml";
        if (iName && !isNaN(iAmount) && iAmount > 0) {
            ingredients.push(`${iName}:${iAmount}:${iUnit}`);
        }
    });
    const recipe = ingredients.join("|");

    const isEdit = state.editingFormulaIndex !== null;
    const formulaId = isEdit ? state.formulasData[state.editingFormulaIndex].id : "f_" + Date.now();

    const entry = {
        id: formulaId,
        name,
        category,
        description: desc,
        recipe,
        status: "active"
    };

    const firestore = getDb();
    if (isEdit) {
        state.formulasData[state.editingFormulaIndex] = entry;
        if (firestore) firestore.collection("formulas").doc(formulaId).set(entry).catch(e => console.error(e));
    } else {
        state.formulasData.push(entry);
        if (firestore) firestore.collection("formulas").doc(formulaId).set(entry).catch(e => console.error(e));
    }

    localStorage.setItem(FORMULAS_CACHE_KEY, JSON.stringify(state.formulasData));
    renderFormulas(state.formulasData);
    closeFormulaModal();
    showToast(isEdit ? "Formula updated" : "Formula created");
}

export function deleteFormula(index) {
    const f = state.formulasData[index];
    if (!f || !confirm(`Delete "${f.name}"?`)) return;

    state.formulasData.splice(index, 1);
    localStorage.setItem(FORMULAS_CACHE_KEY, JSON.stringify(state.formulasData));
    renderFormulas(state.formulasData);

    const firestore = getDb();
    if (firestore) {
        firestore.collection("formulas").doc(f.id).update({ status: "deleted" }).catch(e => console.error(e));
    }
    showToast(`"${f.name}" deleted`);
}

export function applyFormulaFromLibrary(index) {
    const formula = state.formulasData[index];
    if (!formula) return;
    switchView("home");
    openModal("pest");
    state.selectedQuickFormulaId = formula.id;
    updateBedFields();
    renderQuickFormulaChips();
    updateQuickFormulaDosePreview();
}

// --- 8. Plot Modal & Detail ---
export function openPlotAssignModal(plotId = null) {
    state.editingPlotId = plotId;
    const plot = plotId ? getPlot(plotId) : null;
    document.getElementById("plotModalTitle").textContent = plot ? "Edit Plot" : "New Plot";
    document.getElementById("plotSubmitBtn").textContent  = plot ? "Save changes" : "Save plot";
    document.getElementById("plotName").value = plot ? plot.name : "";
    document.getElementById("plotName")?.classList.remove("invalid");

    const list = document.getElementById("plotBedChecklist");
    if (list) {
        list.innerHTML = state.bedsData.map(b => {
            const checked = plotId && String(b.plotId || "") === String(plotId);
            const otherPlot = b.plotId && String(b.plotId) !== String(plotId) ? getPlot(b.plotId) : null;
            const note = otherPlot ? ` <span style="color:#888;">(currently in ${escapeHtml(otherPlot.name)})</span>` : "";
            return `
            <label class="harvest-crop-check">
                <input type="checkbox" name="plotBed" value="${escapeHtml(String(b.bedNumber))}"${checked ? " checked" : ""}>
                <span>Bed ${escapeHtml(String(b.bedNumber))}${b.name ? " · " + escapeHtml(b.name) : ""}${note}</span>
            </label>`;
        }).join("");
    }

    document.getElementById("plotModalOverlay")?.classList.add("open");
    document.body.style.overflow = "hidden";
}

export function closePlotAssignModal() {
    document.getElementById("plotModalOverlay")?.classList.remove("open");
    document.body.style.overflow = "";
    state.editingPlotId = null;
}

export function handlePlotSubmit(event) {
    event.preventDefault();
    const name = document.getElementById("plotName")?.value.trim();
    if (!name) {
        document.getElementById("plotName")?.classList.add("invalid");
        return;
    }

    const checkedBeds = [...document.querySelectorAll('input[name="plotBed"]:checked')].map(cb => cb.value);
    const isEdit = state.editingPlotId !== null;
    const plotId = isEdit ? state.editingPlotId : "plot_" + Date.now();
    const firestore = getDb();

    if (isEdit) {
        const plot = getPlot(plotId);
        if (plot) plot.name = name;
        if (firestore) firestore.collection("plots").doc(plotId).update({ name }).catch(e => console.error(e));
    } else {
        state.plotsData.push({ id: plotId, name, status: "active" });
        if (firestore) firestore.collection("plots").doc(plotId).set({ id: plotId, name, status: "active" }).catch(e => console.error(e));
    }
    localStorage.setItem(PLOTS_CACHE_KEY, JSON.stringify(state.plotsData));

    state.bedsData.forEach(b => {
        const isChecked = checkedBeds.includes(String(b.bedNumber));
        const wasInThisPlot = String(b.plotId || "") === String(plotId);
        if (isChecked) {
            b.plotId = plotId;
            if (firestore) firestore.collection("beds").doc(String(b.bedNumber)).update({ plotId }).catch(e => console.error(e));
        } else if (wasInThisPlot) {
            b.plotId = "";
            if (firestore) firestore.collection("beds").doc(String(b.bedNumber)).update({ plotId: "" }).catch(e => console.error(e));
        }
    });
    saveBeds();

    renderBeds(state.bedsData);
    populateBedDropdown();
    closePlotAssignModal();
    showToast(isEdit ? "Plot updated" : "Plot created");
}

export function openPlotDetail(plotId) {
    state.currentPlotId = plotId;
    const plot = getPlot(plotId);
    document.getElementById("plotDetailTitle").textContent = plot ? plot.name : "Plot";

    const members = bedsInPlot(plotId);
    const content = document.getElementById("plotDetailContent");
    if (content) {
        content.innerHTML = members.length ? members.map(b => `
            <div class="bed-detail-row" style="cursor:pointer;" onclick="openBedFromPlot('${escapeHtml(String(plotId))}', ${b.bedNumber})">
                <div class="bed-detail-info">
                    <p class="bed-detail-name">Bed ${escapeHtml(String(b.bedNumber))}${b.name ? " · " + escapeHtml(b.name) : ""}</p>
                    <p class="bed-detail-meta">${(b.crops || []).length} crop${(b.crops || []).length === 1 ? "" : "s"}</p>
                </div>
                <span class="bed-chevron">›</span>
            </div>`).join("") : '<p style="color:#888;padding:12px 0;">No beds assigned yet.</p>';
    }

    document.getElementById("plotDetailOverlay")?.classList.add("open");
    document.body.style.overflow = "hidden";
}

export function closePlotDetail() {
    document.getElementById("plotDetailOverlay")?.classList.remove("open");
    document.body.style.overflow = "";
    state.currentPlotId = null;
}

export function openBedFromPlot(plotId, bedNum) {
    state.bedDetailReturnPlotId = plotId;
    closePlotDetail();
    openBedDetail(bedNum);
}

// --- 9. Pull to Refresh ---
export function setupPullToRefresh() {
    const ptr = document.getElementById("ptrIndicator");
    if (!ptr) return;
    let startY = 0;
    let pulling = false;

    window.addEventListener("touchstart", (e) => {
        if (window.scrollY === 0) {
            startY = e.touches[0].clientY;
            pulling = true;
        }
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
        if (!pulling) return;
        const dist = e.touches[0].clientY - startY;
        if (dist > 10 && dist < 120 && window.scrollY === 0) {
            ptr.style.height = `${Math.min(dist, 48)}px`;
            ptr.style.opacity = `${Math.min(dist / 48, 1)}`;
        }
    }, { passive: true });

    window.addEventListener("touchend", async (e) => {
        if (!pulling) return;
        pulling = false;
        const dist = (e.changedTouches[0]?.clientY || 0) - startY;
        if (dist >= 60 && window.scrollY === 0) {
            ptr.textContent = "Refreshing…";
            ptr.style.height = "36px";
            ptr.style.opacity = "1";
            try {
                await Promise.all([fetchBeds(), fetchPlots(), fetchFormulas(), fetchWeather()]);
                showToast("Refreshed!");
            } catch (err) { /* ignore */ }
        }
        ptr.style.height = "0";
        ptr.style.opacity = "0";
        ptr.textContent = "↓ Refreshing…";
    });
}

// --- 10. Initialization Routine ---
export async function initApp() {
    setupPullToRefresh();
    updateSyncBadge();

    // Bottom Navigation Listeners
    document.querySelectorAll(".bottom-nav .nav-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const view = btn.getAttribute("data-view");
            if (view) switchView(view);
        });
    });

    // Delegated click listeners for bed tiles and cards
    document.getElementById("bedGridList")?.addEventListener("click", (e) => {
        const header = e.target.closest(".bed-grid-plot-header");
        if (header && header.dataset.plot) {
            openPlotDetail(header.dataset.plot);
            return;
        }
        const tile = e.target.closest(".bed-tile");
        if (tile && tile.dataset.bed) {
            openBedDetail(tile.dataset.bed);
        }
    });

    document.getElementById("batchList")?.addEventListener("click", (e) => {
        const card = e.target.closest(".bed-card");
        if (card && card.dataset.bed && !e.target.closest("button")) {
            openBedDetail(card.dataset.bed);
        }
    });

    // Backdrop clicks
    document.getElementById("modalOverlay")?.addEventListener("click", function (e) { if (e.target === this) closeModal(); });
    document.getElementById("bedDetailOverlay")?.addEventListener("click", function (e) { if (e.target === this) closeBedDetail(); });
    document.getElementById("saleModalOverlay")?.addEventListener("click", function (e) { if (e.target === this) closeSaleModal(); });
    document.getElementById("taskModalOverlay")?.addEventListener("click", function (e) { if (e.target === this) closeTaskModal(); });
    document.getElementById("formulaModalOverlay")?.addEventListener("click", function (e) { if (e.target === this) closeFormulaModal(); });
    document.getElementById("plotModalOverlay")?.addEventListener("click", function (e) { if (e.target === this) closePlotAssignModal(); });
    document.getElementById("plotDetailOverlay")?.addEventListener("click", function (e) { if (e.target === this) closePlotDetail(); });

    // Sync listeners
    window.addEventListener("online", updateSyncBadge);
    window.addEventListener("offline", updateSyncBadge);

    // Initial Data Fetch
    await fetchPlots();
    await Promise.all([fetchBeds(), fetchFormulas(), fetchWeather(), fetchTasks()]);

    const activeViewBtn = document.querySelector(".bottom-nav .nav-btn.active");
    const activeView = activeViewBtn?.getAttribute?.("data-view") || "home";
    switchView(activeView);
}

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initApp);
    } else {
        initApp();
    }
}

// ============================================================================
// Global Window Bridge for Backward Compatibility with HTML inline handlers
// ============================================================================
if (typeof window !== "undefined") {
    Object.assign(window, {
        // Navigation & Views
        switchView,
        setBedViewMode,
        setFinPeriod,
        setDatePreset,
        syncDatePresets,

        // Modals
        openModal,
        closeModal,
        handleSubmit,
        toggleInputs,
        toggleFinancials,
        updateBedFields,

        // Beds & Plots
        addBed,
        deleteBed,
        saveBedName,
        saveBedPlot,
        toggleBedRename,
        toggleBedPlotPicker,
        logForBed,
        logForPlot,
        openBedDetail,
        closeBedDetail,
        purgeAllBedsAndPlots,
        openPlotAssignModal,
        closePlotAssignModal,
        handlePlotSubmit,
        openPlotDetail,
        closePlotDetail,
        openBedFromPlot,
        deletePlot,

        // Sales
        openSaleModal,
        closeSaleModal,
        handleSaleSubmit,
        calcSaleTotal,

        // Tasks
        openTaskModal,
        closeTaskModal,
        selectTaskSlot,
        selectTaskFormula,
        handleTaskSubmit,
        toggleTaskDone,
        executeTaskNow,

        // Formulas & Stepper
        stepTankCount,
        toggleSelectAllBeds,
        openFormulaModal,
        closeFormulaModal,
        selectCategorySwatch,
        addIngredientRow,
        handleFormulaSubmit,
        deleteFormula,
        applyFormulaFromLibrary,
        recalcAllDoses,
        selectQuickFormula,
        updateSprayerTotalDisplay,
        onSprayerParamChange,

        // Activity & Filters
        filterLogs,
        filterByType,
        clearActivityFilters,
        exportActivityCsv,
        deleteLogEntry,

        // Cloud sync
        handleSyncBadgeClick,

        // Core exports for testing
        state,
        localDateStr,
        ymd,
        todayString,
        daysSince
    });
}
