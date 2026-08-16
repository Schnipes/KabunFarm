// ============================================================================
// Kabun Farm Intelligence — DOM View Renderers
// Module: js/views.js
// ============================================================================

import {
    state,
    LOGS_CACHE_KEY,
    SALES_CACHE_KEY,
    CATEGORY_ICON,
    CATEGORY_LABEL,
    TIME_SLOT_ORDER,
    TIME_SLOT_SHORT,
    CATEGORY_COLOR_PALETTE,
    escapeHtml,
    ymd,
    todayString,
    daysSince,
    shortDate,
    dateGroupLabel,
    getKnownCropNames,
    getCategoryColor,
    tintStyle,
    weatherIcon,
    lastActivityLabel,
    resolveTaskScopeMeta,
    resolveLogScopeLabel,
    getBed,
    getPlot,
    bedsInPlot,
    saveBeds,
    showToast
} from "./state.js";

import {
    getWateringStatus,
    wateringAlert,
    plotWateringRollup,
    groupByPlot,
    parseRecipe,
    renderIngredients,
    computeCropPL
} from "./calculations.js";

// --- 1. Form Datalists & Scope Dropdowns ---
export function refreshCropDatalists() {
    const names = getKnownCropNames();
    const optionsHtml = names.map(n => `<option value="${escapeHtml(n)}">`).join("");
    const cropList = document.getElementById("cropNameList");
    if (cropList) cropList.innerHTML = optionsHtml;
    const saleList = document.getElementById("activeCropsList");
    if (saleList) saleList.innerHTML = optionsHtml;
}

export function populateBedDropdown() {
    const plotGroup = document.getElementById("plotScopeGroup");
    const bedGroup  = document.getElementById("bedScopeGroup");
    if (plotGroup) plotGroup.innerHTML = "";
    if (bedGroup) bedGroup.innerHTML = "";

    state.plotsData.forEach(plot => {
        if (!plotGroup) return;
        const opt = document.createElement("option");
        opt.value = plot.id;
        opt.textContent = plot.name;
        plotGroup.appendChild(opt);
    });

    state.bedsData.forEach(bed => {
        if (!bedGroup) return;
        const opt = document.createElement("option");
        opt.value = bed.bedNumber;
        opt.textContent = "Bed " + bed.bedNumber;
        bedGroup.appendChild(opt);
    });
}

// --- 2. Bed List & Grid Renderers ---
export function renderGrowingBedCard(bed) {
    const lastLine = lastActivityLabel(bed.lastActivity);
    return `
    <div class="batch-card bed-card-clickable" onclick="openBedDetail(${bed.bedNumber})">
        <div class="bed-card-header">
            <p class="batch-title">Bed ${bed.bedNumber}${bed.name ? ` <span class="bed-custom-name">· ${escapeHtml(bed.name)}</span>` : ""}</p>
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
        ${wateringAlert(bed)}
    </div>`;
}

export function renderEmptyBedCard(bed) {
    const lastLine = lastActivityLabel(bed.lastActivity);
    return `
    <div class="batch-card bed-card-empty bed-card-clickable" onclick="openBedDetail(${bed.bedNumber})">
        <div class="bed-card-header">
            <p class="batch-title" style="color:#888;">Bed ${bed.bedNumber}${bed.name ? ` <span class="bed-custom-name">· ${escapeHtml(bed.name)}</span>` : ""}</p>
            <span class="bed-chevron">›</span>
        </div>
        <p class="bed-empty-label">Ready to sow</p>
        ${lastLine ? `<p class="bed-last-activity">${escapeHtml(lastLine)}</p>` : ""}
    </div>`;
}

export function renderPlotCard(plotId, beds) {
    const plot = getPlot(plotId);
    const label = plot ? plot.name : "Plot";
    const cropNames = [...new Set(beds.flatMap(b => b.crops.map(c => c.cropName)))];
    const chips = cropNames.length
        ? cropNames.map(n => `<span class="tag">${escapeHtml(n)}</span>`).join("")
        : '<span style="color:#888;font-size:13px;">Empty</span>';

    const { total, flagged } = plotWateringRollup(plotId);
    const wateringLine = flagged
        ? `<p class="bed-water-alert">💧 ${flagged} of ${total} beds not watered</p>`
        : "";

    return `
    <div class="batch-card bed-card-clickable" onclick="openPlotDetail('${escapeHtml(String(plotId))}')">
        <div class="bed-card-header">
            <p class="batch-title">${escapeHtml(label)} <span class="bed-custom-name">· ${beds.length} bed${beds.length === 1 ? "" : "s"}</span></p>
            <span class="bed-chevron">›</span>
        </div>
        <div class="bed-crops">${chips}</div>
        ${wateringLine}
    </div>`;
}

export function renderBedTile(bed) {
    const isGrowing = bed.crops && bed.crops.length > 0;
    const waterStatus = getWateringStatus(bed);
    const crop = isGrowing ? bed.crops[0] : null;
    const cropName = crop ? crop.cropName : "Empty";
    const dayCount = crop ? `D${daysSince(crop.plantingDate)}` : "Ready";
    const warnWater = waterStatus.needsWater;

    return `
    <div class="bed-tile${warnWater ? " needs-water" : ""}${!isGrowing ? " is-empty" : ""}" onclick="openBedDetail(${bed.bedNumber})">
        <span class="bed-tile-num">${bed.bedNumber}</span>
        <span class="bed-tile-crop">${escapeHtml(cropName)}</span>
        <div class="bed-tile-status">
            <span class="bed-tile-dot${warnWater ? " warn" : ""}"></span>
            <span>${dayCount}</span>
        </div>
    </div>`;
}

export function renderBedGrid(beds) {
    const gridContainer = document.getElementById("bedGridList");
    if (!gridContainer) return;
    if (!beds.length) {
        gridContainer.innerHTML = '<p style="color:#888;font-size:13px;padding:8px 4px;">No beds created yet.</p>';
        return;
    }

    const { grouped, solo } = groupByPlot(beds);
    let html = "";

    Object.keys(grouped).forEach(plotId => {
        const plot = getPlot(plotId);
        const plotBeds = grouped[plotId];
        const { total, flagged } = plotWateringRollup(plotId);
        const waterBadge = flagged > 0 ? `<span style="color:#d97706;font-weight:700;">💧 ${flagged}/${total} unwatered</span>` : `<span>💧 All watered</span>`;

        html += `
        <div class="bed-grid-plot-group">
            <div class="bed-grid-plot-header" onclick="openPlotDetail('${escapeHtml(String(plotId))}')">
                <p class="bed-grid-plot-title">🗂️ ${escapeHtml(plot ? plot.name : "Plot")} (${plotBeds.length} beds)</p>
                <div class="bed-grid-plot-meta">${waterBadge} ›</div>
            </div>
            <div class="bed-grid-tiles">
                ${plotBeds.map(renderBedTile).join("")}
            </div>
        </div>`;
    });

    if (solo.length) {
        html += `
        <div class="bed-grid-plot-group">
            <div class="bed-grid-plot-header">
                <p class="bed-grid-plot-title">Standalone Beds (${solo.length})</p>
            </div>
            <div class="bed-grid-tiles">
                ${solo.map(renderBedTile).join("")}
            </div>
        </div>`;
    }

    gridContainer.innerHTML = html;
}

export function renderBeds(beds) {
    const listContainer = document.getElementById("batchList");
    const gridContainer = document.getElementById("bedGridList");

    if (listContainer) listContainer.hidden = (state.bedViewMode === "grid");
    if (gridContainer) gridContainer.hidden = (state.bedViewMode !== "grid");
    document.getElementById("btnViewList")?.classList.toggle("active", state.bedViewMode === "list");
    document.getElementById("btnViewGrid")?.classList.toggle("active", state.bedViewMode === "grid");

    if (!beds.length) {
        if (listContainer) {
            listContainer.innerHTML = `
            <div class="empty-beds-card" onclick="addBed()">
                <span class="empty-beds-icon">🌱</span>
                <p class="empty-beds-title">Add your first bed</p>
                <p class="empty-beds-hint">Tap to create Bed 1</p>
            </div>`;
        }
        if (gridContainer) gridContainer.innerHTML = '<p style="color:#888;font-size:13px;padding:8px 4px;">No beds created yet.</p>';
        return;
    }

    renderBedGrid(beds);

    if (!listContainer) return;
    const growing = beds.filter(b => b.crops && b.crops.length > 0);
    const empty   = beds.filter(b => !b.crops || b.crops.length === 0);
    let html = "";

    if (growing.length) {
        html += `<p class="bed-group-label">Growing (${growing.length})</p>`;
        const { grouped, solo } = groupByPlot(growing);
        html += Object.keys(grouped).map(plotId => renderPlotCard(plotId, grouped[plotId])).join("");
        html += solo.map(renderGrowingBedCard).join("");
    }

    if (empty.length) {
        html += `<p class="bed-group-label" style="margin-top:16px;">Empty (${empty.length})</p>`;
        const { grouped, solo } = groupByPlot(empty);
        html += Object.keys(grouped).map(plotId => renderPlotCard(plotId, grouped[plotId])).join("");
        html += solo.map(renderEmptyBedCard).join("");
    }

    listContainer.innerHTML = html;
}

// --- 3. Weather View ---
export function renderWeather(data) {
    const container = document.getElementById("weatherCard");
    if (!container || !data?.current || !data?.daily) return;
    state.lastWeatherData = data;

    let staleNote = "";
    try {
        const cached = JSON.parse(localStorage.getItem("farmlog_weather_cache") || "null");
        if (cached && cached.fetchedAt) {
            const ageMs = Date.now() - cached.fetchedAt;
            if (ageMs >= 60 * 60 * 1000) {
                const ageHrs = Math.max(1, Math.round(ageMs / (60 * 60 * 1000)));
                staleNote = `<span class="weather-stale-note">Offline — showing forecast from ${ageHrs}h ago</span>`;
            }
        }
    } catch (e) { /* ignore */ }

    const temp        = Math.round(data.current.temperature_2m);
    const icon        = weatherIcon(data.current.weather_code);
    const todayRain   = data.daily.precipitation_probability_max[0];
    const todayWeekday = new Date().toLocaleDateString("en-MY", { weekday: "short" });

    const dayStrip = [1, 2, 3].map(i => {
        const dateStr = data.daily.time[i];
        if (!dateStr) return "";
        const dayLabel = new Date(dateStr + "T00:00:00").toLocaleDateString("en-MY", { weekday: "short" });
        return `
        <div class="weather-day-col">
            <span class="d-label">${dayLabel}</span>
            <span class="d-icon">${weatherIcon(data.daily.weather_code[i])}</span>
            <span class="d-pct">${data.daily.precipitation_probability_max[i]}%</span>
        </div>`;
    }).join("");

    const tomorrowRain = data.daily.precipitation_probability_max[1];
    let recIcon, recText;
    if (todayRain >= 40) {
        recIcon = "💧";
        recText = "Skip watering — rain likely today";
    } else if (tomorrowRain >= 40) {
        recIcon = "🚿";
        recText = "Water today — rain expected tomorrow, ease up after";
    } else {
        recIcon = "🚿";
        recText = "Water today — no rain in sight";
    }

    const hintBed = todayRain >= 40 ? state.bedsData.find(b => getWateringStatus(b).needsWater) : null;
    const hint = hintBed ? `
        <div class="weather-hint">
            <span>🌧️</span>
            <span>Rain likely today — Bed ${escapeHtml(String(hintBed.bedNumber))} may not need watering.</span>
        </div>` : "";

    container.innerHTML = `
        <div class="weather-main-row">
            <span class="weather-icon-big">${icon}</span>
            <div class="weather-temp-block">
                <span class="weather-temp">${temp}°</span>
                <span class="weather-sub">${todayWeekday} · Farm weather</span>
            </div>
            <div class="weather-rain-pill">
                <div class="weather-rain-pct">${todayRain}%</div>
                <div class="weather-rain-label">Rain today</div>
            </div>
        </div>
        <div class="weather-recommendation">
            <span>${recIcon}</span>
            <span>${recText}</span>
        </div>
        <div class="weather-forecast-strip">${dayStrip}</div>
        ${hint}
        ${staleNote}`;
}

// --- 4. Formulas View ---
export function renderFormulas(formulas) {
    state.formulasData = formulas;
    const container = document.getElementById("formulaList");
    if (!container) return;
    if (!formulas.length) {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">No formulas yet.</p>';
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
                <div class="formula-actions">
                    ${f.category ? (() => {
                        const color = getCategoryColor(f.category);
                        const style = color ? ` style="${tintStyle(color)}"` : "";
                        return `<span class="tag"${style}>${escapeHtml(f.category)}</span>`;
                    })() : ""}
                    <button class="formula-edit-btn" onclick="openFormulaModal(${i})" aria-label="Edit">✏️</button>
                    <button class="formula-delete-btn" onclick="deleteFormula(${i})" aria-label="Delete">🗑️</button>
                </div>
            </div>
            ${f.description ? `<p class="formula-desc">${escapeHtml(f.description)}</p>` : ""}
            ${calcSection}
            <button type="button" class="formula-apply-btn" onclick="applyFormulaFromLibrary(${i})">
                ⚡ Apply to Bed / Plot
            </button>
        </div>`;
    }).join("");
}

export function renderCategorySwatchPicker(currentCategory) {
    state.selectedCategoryColor = getCategoryColor(currentCategory);
    const container = document.getElementById("categorySwatchPicker");
    if (!container) return;
    const noneHtml = `<button type="button" class="category-swatch none-swatch${!state.selectedCategoryColor ? " selected" : ""}" data-hex="" onclick="selectCategorySwatch(null)" aria-label="No color">✕</button>`;
    const swatchesHtml = CATEGORY_COLOR_PALETTE.map(hex => `
        <button type="button" class="category-swatch${state.selectedCategoryColor === hex ? " selected" : ""}"
            style="background:${hex}" data-hex="${hex}" onclick="selectCategorySwatch('${hex}')" aria-label="Choose color ${hex}"></button>
    `).join("");
    container.innerHTML = noneHtml + swatchesHtml;
}

// --- 5. Quick Formula Chips ---
export function renderQuickFormulaChips() {
    const container = document.getElementById("quickFormulaChips");
    if (!container) return;
    if (!state.formulasData.length) {
        container.innerHTML = '<span style="color:#888;font-size:12px;">No formulas available</span>';
        return;
    }
    container.innerHTML = state.formulasData.map(f => {
        const isSel = String(state.selectedQuickFormulaId) === String(f.id);
        return `
        <button type="button" class="quick-formula-chip${isSel ? " selected" : ""}" onclick="selectQuickFormula('${escapeHtml(String(f.id))}')">
            ${escapeHtml(f.name)}
        </button>`;
    }).join("");
}

export function selectQuickFormula(formulaId) {
    if (String(state.selectedQuickFormulaId) === String(formulaId)) {
        state.selectedQuickFormulaId = null;
    } else {
        state.selectedQuickFormulaId = formulaId;
    }
    renderQuickFormulaChips();
    updateQuickFormulaDosePreview();
}

export function updateSprayerTotalDisplay() {
    const vol = parseFloat(document.getElementById("logSprayerVol")?.value) || 16;
    const tanks = parseFloat(document.getElementById("logTankCount")?.value) || 1;
    const total = vol * tanks;
    const el = document.getElementById("logSprayerTotalDisplay");
    if (el) el.innerHTML = `Total mix: <strong>${total} L</strong> (${tanks} tank${tanks === 1 ? '' : 's'})`;
}

export function onSprayerParamChange() {
    updateSprayerTotalDisplay();
    updateQuickFormulaDosePreview();
}

export function updateQuickFormulaDosePreview() {
    const card = document.getElementById("quickFormulaDoseCard");
    const inputsUsed = document.getElementById("inputsUsed");
    if (!state.selectedQuickFormulaId) {
        if (card) card.hidden = true;
        return;
    }
    const formula = state.formulasData.find(f => String(f.id) === String(state.selectedQuickFormulaId));
    if (!formula) {
        if (card) card.hidden = true;
        return;
    }

    const ingredients = parseRecipe(formula.recipe);
    const tankSize  = parseFloat(document.getElementById("logSprayerVol")?.value) || 16;
    const tankCount = parseFloat(document.getElementById("logTankCount")?.value) || 1;
    const totalVol  = tankSize * tankCount;

    if (ingredients && card) {
        const rowsHtml = ingredients.map(ing => {
            const total = ing.amount * totalVol;
            const calc = ing.unit === 'g'
                ? total.toFixed(1).replace(/\.0$/, '')
                : (Number.isInteger(total) ? String(total) : total.toFixed(1).replace(/\.0$/, ''));
            return `
            <div class="quick-dose-row">
                <span>${escapeHtml(ing.name)}</span>
                <span class="quick-dose-amount">${calc} ${ing.unit}</span>
            </div>`;
        }).join("");

        card.innerHTML = `
            <p class="quick-dose-title">🧪 ${escapeHtml(formula.name)} (${totalVol}L mix)</p>
            <div class="quick-dose-list">${rowsHtml}</div>`;
        card.hidden = false;
    } else if (card) {
        card.hidden = true;
    }

    if (inputsUsed && !inputsUsed.value) {
        if (ingredients) {
            const parts = ingredients.map(ing => {
                const total = ing.amount * totalVol;
                const calc = ing.unit === 'g' ? total.toFixed(1).replace(/\.0$/, '') : (Number.isInteger(total) ? String(total) : total.toFixed(1).replace(/\.0$/, ''));
                return `${ing.name}: ${calc}${ing.unit}`;
            });
            inputsUsed.value = `${formula.name} — ${totalVol}L mix (${tankCount}x${tankSize}L)\n${parts.join(", ")}`;
        } else {
            inputsUsed.value = `${formula.name} (${totalVol}L mix)`;
        }
    }
}

// --- 6. Task & Plan View Renderers ---
export function planDayLabel(dateStr) {
    const today = todayString();
    const d = new Date(); d.setDate(d.getDate() + 1);
    const tomorrow = ymd(d.toISOString());
    if (dateStr === today)    return "Today · "    + shortDate(dateStr);
    if (dateStr === tomorrow) return "Tomorrow · " + shortDate(dateStr);
    const dayName = new Date(dateStr + "T00:00:00").toLocaleDateString("en-MY", { weekday: "long" });
    return `${dayName} · ${shortDate(dateStr)}`;
}

export function renderTaskCard(task) {
    const formula = task.formulaId ? state.formulasData.find(f => String(f.id) === String(task.formulaId)) : null;
    const isDone  = task.status === "done";
    const color   = formula ? getCategoryColor(formula.category) : null;
    const tag     = formula && formula.category
        ? `<span class="tag"${color ? ` style="${tintStyle(color)}"` : ""}>${escapeHtml(formula.category)}</span>`
        : "";
    const slotPill = task.timeSlot && task.timeSlot !== "Anytime"
        ? `<span class="slot-pill">${escapeHtml(task.timeSlot)}</span>` : "";

    const title = formula ? formula.name : "Task";
    const descParts = [];
    if (formula && formula.description) descParts.push(formula.description);
    if (task.note) descParts.push(task.note);
    const desc = descParts.join(" — ");
    const scopeMeta = resolveTaskScopeMeta(task);
    const bedLine = `<p class="task-bed">${escapeHtml(scopeMeta)}</p>`;
    const execBtn = !isDone ? `
        <button type="button" class="task-exec-btn" onclick="executeTaskNow('${escapeHtml(String(task.id))}', event)">
            ⚡ Log &amp; Mark Done
        </button>` : "";

    return `
    <div class="task-card">
        <button class="task-check${isDone ? " done" : ""}" onclick="toggleTaskDone('${escapeHtml(String(task.id))}')">${isDone ? "✓" : ""}</button>
        <div class="task-main">
            <div class="task-top-row">${slotPill}${tag}</div>
            <p class="task-title${isDone ? " done-text" : ""}">${escapeHtml(title)}</p>
            ${desc ? `<p class="task-desc">${escapeHtml(desc)}</p>` : ""}
            ${bedLine}
            ${execBtn}
        </div>
    </div>`;
}

export function renderTodayTaskRow(task) {
    const formula = task.formulaId ? state.formulasData.find(f => String(f.id) === String(task.formulaId)) : null;
    const isDone  = task.status === "done";
    const color   = formula ? getCategoryColor(formula.category) : null;
    const icon    = CATEGORY_ICON[task.activityCategory] || "📝";
    const title   = formula ? formula.name : (task.note || "Task");
    const bedMeta = resolveTaskScopeMeta(task);
    const slotShort = task.timeSlot && task.timeSlot !== "Anytime" ? TIME_SLOT_SHORT[task.timeSlot] : "";
    const meta = slotShort ? `${bedMeta} · ${slotShort}` : bedMeta;
    const execMini = !isDone ? `
        <button type="button" class="task-row-exec" onclick="executeTaskNow('${escapeHtml(String(task.id))}', event)">
            ⚡ Log
        </button>` : "";

    return `
    <div class="task-row${isDone ? " is-done" : ""}" style="border-left-color:${color || "var(--color-border)"};">
        <button class="task-check-mini${isDone ? " done" : ""}" onclick="toggleTaskDone('${escapeHtml(String(task.id))}')"><span class="check-dot">${isDone ? "✓" : ""}</span></button>
        <span class="task-row-icon">${icon}</span>
        <span class="task-row-title${isDone ? " done-text" : ""}">${escapeHtml(title)}</span>
        <span class="task-row-meta">${escapeHtml(meta)}</span>
        ${execMini}
    </div>`;
}

export function renderTodayTasks() {
    const container  = document.getElementById("todayTasksList");
    const dateLabel  = document.getElementById("todayTasksDate");
    if (!container) return;
    if (dateLabel) dateLabel.textContent = shortDate(todayString());

    const today = todayString();
    const todays = state.tasksData
        .filter(t => t.date === today)
        .sort((a, b) => (TIME_SLOT_ORDER[a.timeSlot] ?? 3) - (TIME_SLOT_ORDER[b.timeSlot] ?? 3))
        .sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0));

    if (!todays.length) {
        container.innerHTML = '<div class="empty-today">Nothing planned for today</div>';
        return;
    }
    container.innerHTML = `<div class="today-list">${todays.map(renderTodayTaskRow).join("")}</div>`;
}

export function renderPlanView() {
    const container = document.getElementById("planTaskList");
    if (!container) return;

    const start = new Date(); start.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        days.push(ymd(d.toISOString()));
    }
    const today   = days[0];
    const lastDay = days[6];

    const byDate = {};
    state.tasksData.forEach(t => {
        if (!byDate[t.date]) byDate[t.date] = [];
        byDate[t.date].push(t);
    });

    const slotSort = (a, b) => (TIME_SLOT_ORDER[a.timeSlot] ?? 3) - (TIME_SLOT_ORDER[b.timeSlot] ?? 3);

    const overdueDates = Object.keys(byDate)
        .filter(d => d && d < today && byDate[d].some(t => t.status !== "done"))
        .sort();
    const overdueHtml = overdueDates.map(dateStr => {
        const pending = byDate[dateStr].filter(t => t.status !== "done").sort(slotSort);
        return `<div class="day-heading overdue-heading">Overdue · ${planDayLabel(dateStr)}</div>`
            + pending.map(renderTaskCard).join("");
    }).join("");

    const weekHtml = days.map(dateStr => {
        const dayTasks = (byDate[dateStr] || []).slice().sort(slotSort);
        const heading = `<div class="day-heading">${planDayLabel(dateStr)}</div>`;
        if (!dayTasks.length) return heading + `<div class="empty-day">Nothing planned</div>`;
        return heading + dayTasks.map(renderTaskCard).join("");
    }).join("");

    const laterDates = Object.keys(byDate).filter(d => d > lastDay).sort();
    const laterHtml = laterDates.map(dateStr => {
        const dayTasks = byDate[dateStr].slice().sort(slotSort);
        return `<div class="day-heading">${planDayLabel(dateStr)}</div>`
            + dayTasks.map(renderTaskCard).join("");
    }).join("");

    container.innerHTML = overdueHtml + weekHtml + laterHtml;
}

export function populateTaskFormulaList() {
    const container = document.getElementById("taskFormulaList");
    if (!container) return;
    if (!state.formulasData.length) {
        container.innerHTML = '<p style="color:#888;font-size:13px;padding:6px 0;">No formulas yet.</p>';
        return;
    }
    container.innerHTML = state.formulasData.map(f => `
        <div class="formula-pick-item${state.selectedTaskFormulaId === f.id ? " selected" : ""}" onclick="selectTaskFormula('${escapeHtml(String(f.id))}')">
            <span class="formula-pick-name">${escapeHtml(f.name)}</span>
            ${f.category ? `<span class="formula-pick-cat">${escapeHtml(f.category)}</span>` : ""}
        </div>`
    ).join("");
}

// --- 7. Activity Log & Financials ---
export function renderBedFilterChips() {
    const container = document.getElementById("bedFilterChips");
    if (!container) return;
    const chips = [
        { label: "All beds", value: "all" },
        ...state.plotsData.map(p => ({ label: "🗂️ " + p.name, value: String(p.id) })),
        ...state.bedsData.map(b => ({ label: "Bed " + b.bedNumber, value: String(b.bedNumber) }))
    ];
    container.innerHTML = chips.map(c =>
        `<button class="bed-filter-chip${state.activeLogFilter === c.value ? " active" : ""}" onclick="filterLogs('${escapeHtml(c.value)}')">${escapeHtml(c.label)}</button>`
    ).join("");
}

export function renderTypeFilterChips() {
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
        `<button class="bed-filter-chip${state.activeTypeFilter === t.value ? " active" : ""}" onclick="filterByType('${t.value}')">${t.label}</button>`
    ).join("");
}

export function filterLogs(bedNum) {
    state.activeLogFilter = bedNum;
    renderBedFilterChips();
    renderCombinedActivity();
}

export function filterByType(type) {
    state.activeTypeFilter = type;
    renderTypeFilterChips();
    renderCombinedActivity();
}

export function clearActivityFilters() {
    state.activeLogFilter = "all";
    state.activeTypeFilter = "all";
    renderBedFilterChips();
    renderTypeFilterChips();
    renderCombinedActivity();
}

export function updateClearFiltersBtn() {
    const btn = document.getElementById("clearFiltersBtn");
    if (!btn) return;
    btn.hidden = state.activeLogFilter === "all" && state.activeTypeFilter === "all";
}

export function renderCombinedActivity() {
    updateClearFiltersBtn();
    const logs  = JSON.parse(localStorage.getItem(LOGS_CACHE_KEY)  || "[]");
    const sales = JSON.parse(localStorage.getItem(SALES_CACHE_KEY) || "[]");
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

export function renderLogs(logs) {
    const container = document.getElementById("logList");
    if (!container) return;

    let filtered = logs.filter(l => l.status !== "deleted");

    if (state.activeLogFilter !== "all") {
        if (state.activeLogFilter.startsWith("plot_")) {
            const memberBeds = bedsInPlot(state.activeLogFilter).map(b => String(b.bedNumber));
            filtered = filtered.filter(l =>
                String(l.bedNumber) === String(state.activeLogFilter) ||
                memberBeds.includes(String(l.bedNumber))
            );
        } else {
            filtered = filtered.filter(l => String(l.bedNumber) === String(state.activeLogFilter));
        }
    }

    if (state.activeTypeFilter !== "all") {
        filtered = filtered.filter(l => l.activityCategory === state.activeTypeFilter);
    }

    if (!filtered.length) {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">No activity logged yet.</p>';
        return;
    }

    const groups = {};
    filtered.forEach(log => {
        const key = log.date ? ymd(log.date) : "Unknown";
        if (!groups[key]) groups[key] = [];
        groups[key].push(log);
    });

    const html = Object.keys(groups)
        .sort((a, b) => b.localeCompare(a))
        .map(dateKey => {
            const cards = [...groups[dateKey]].reverse().map(log => {
                const icon       = CATEGORY_ICON[log.activityCategory]  || "📝";
                const label      = CATEGORY_LABEL[log.activityCategory] || escapeHtml(log.activityCategory);
                const scopeLabel = escapeHtml(resolveLogScopeLabel(log));
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
                    const cropLine   = log.cropName   ? `<p class="log-inputs">🌱 ${escapeHtml(log.cropName)}</p>`  : "";
                    const weightLine = (log.activityCategory === "harvest" && log.weight) ? `<p class="log-inputs">⚖️ ${escapeHtml(String(log.weight))} kg</p>` : "";
                    const inputLine  = log.inputsUsed ? `<p class="log-inputs">${escapeHtml(log.inputsUsed)}</p>`   : "";
                    const financials = (log.costRM || log.revenueRM) ? `
                    <div class="log-financials">
                        ${log.costRM    ? `<span>Cost: RM ${parseFloat(log.costRM).toFixed(2)}</span>`    : ""}
                        ${log.revenueRM ? `<span>Revenue: RM ${parseFloat(log.revenueRM).toFixed(2)}</span>` : ""}
                    </div>` : "";
                    body = cropLine + weightLine + inputLine + financials;
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

export function renderFinancialSummary() {
    const logs  = JSON.parse(localStorage.getItem(LOGS_CACHE_KEY)  || "[]");
    const sales = JSON.parse(localStorage.getItem(SALES_CACHE_KEY) || "[]");

    const now = new Date();
    let cutoffStr = "";
    if (state.finPeriod === "week") {
        const d = new Date(now);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        cutoffStr = ymd(d.toISOString());
    } else {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        cutoffStr = ymd(d.toISOString());
    }

    let revenue = 0;
    let cost    = 0;

    sales.forEach(s => {
        if (s.status !== "deleted" && ymd(s.date) >= cutoffStr) {
            revenue += parseFloat(s.totalRevenue) || 0;
        }
    });

    logs.forEach(l => {
        if (l.status !== "deleted" && ymd(l.date) >= cutoffStr) {
            cost    += parseFloat(l.costRM)    || 0;
            revenue += parseFloat(l.revenueRM) || 0;
        }
    });

    const net = revenue - cost;

    const revEl  = document.getElementById("finRevenue");
    const costEl = document.getElementById("finCost");
    const netEl  = document.getElementById("finNet");

    if (revEl)  revEl.textContent  = "RM " + revenue.toFixed(2);
    if (costEl) costEl.textContent = "RM " + cost.toFixed(2);
    if (netEl) {
        netEl.textContent = (net >= 0 ? "+RM " : "-RM ") + Math.abs(net).toFixed(2);
        netEl.className = "fin-value " + (net >= 0 ? "green" : "red");
    }
}

export function renderCropPL() {
    const container = document.getElementById("cropPLList");
    if (!container) return;

    const data = computeCropPL();
    if (!data.length) {
        container.innerHTML = '<p style="color:#888;font-size:14px;padding:8px 4px;">No crop data yet — log a sale or harvest to see profit by crop.</p>';
        return;
    }

    container.innerHTML = data.map(c => {
        const netClass = c.net >= 0 ? "green" : "red";
        const coverage = c.logCount > 0 && c.costLoggedCount < c.logCount
            ? `<p class="crop-pl-coverage">Cost logged in ${c.costLoggedCount}/${c.logCount} activities — actual cost may be higher</p>`
            : "";
        const costPerKgLine = c.costPerKg !== null
            ? `<span>Cost/kg: RM ${c.costPerKg.toFixed(2)} <span style="color:#aaa;">(${c.weightKg.toFixed(1)} kg harvested)</span></span>`
            : "";
        return `
        <div class="crop-pl-row">
            <div class="crop-pl-header">
                <span class="crop-pl-name">${escapeHtml(c.cropName)}</span>
                <span class="crop-pl-net ${netClass}">${c.net >= 0 ? "+" : ""}RM ${c.net.toFixed(2)}</span>
            </div>
            <div class="crop-pl-stats">
                <span>Revenue: RM ${c.revenue.toFixed(2)}</span>
                <span>Cost: RM ${c.cost.toFixed(2)}</span>
                ${costPerKgLine}
            </div>
            ${coverage}
        </div>`;
    }).join("");
}
