/*
 * GRID Inventory System - V4.3 inventory experience layer
 *
 * This file intentionally keeps the existing Firebase Realtime Database paths
 * and record shape used by script.js. It upgrades the scanning workflow,
 * verification UI, import validation, reporting, responsiveness, and feedback.
 */

let v2QuickView = "all";
let v2AuditLimit = 200;
let v2SearchTimer = null;
let v2GaugeAnimationFrame = null;
let v2CameraStarting = false;
let v2CameraPaused = false;
let v2ResumeCameraAfterModal = false;
let v2TorchOn = false;
let v2LastDecodeText = "";
let v2LastDecodeTime = 0;
let v2ProcessingCode = false;
let v2CurrentScanSource = "hardware";
let v2DueSuggestion = null;
let v2RemarkSuggestion = "";
let v2PendingMasterImport = null;
let v2SyncInProgress = false;
let v2IsSubmitting = false;
let v2MissingMode = false;
let v37MissingSelectionSnapshot = null;
let v37MissingEmailSending = false;
let v2ScannerInputInitialized = false;
let v2AudioContext = null;

function v2El(id) {
    return document.getElementById(id);
}

function v2SetText(id, value) {
    const element = v2El(id);
    if (element) element.textContent = String(value ?? "");
}

function v2SafeActionValue(value) {
    return encodeActionValue(value).replace(/'/g, "%27");
}

function v2FormatClock(date = new Date()) {
    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function v2TimestampForFilename(date = new Date()) {
    const pad = value => String(value).padStart(2, "0");
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join("") + "_" + [pad(date.getHours()), pad(date.getMinutes())].join("");
}

function v2Slug(value) {
    return String(value || "all")
        .trim()
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "all";
}

const V2_MASTER_FIELD_ALIASES = {
    code: ["EQUIPMENTCODE", "EQUIPCODE", "CODE", "BARCODE", "ASSETCODE"],
    issuedOn: ["ISSUEDON", "ISSUEDDATE", "REGISTEREDON", "REGISTRATIONDATE", "DATEISSUED"],
    issuerName: ["ISSUERNAME", "ISSUEDBY", "REGISTEREDBY", "REGISTRAR", "OWNERNAME"],
    issuerNo: ["ISSUERNO", "ISSUERID", "EMPLOYEENO", "EMPLOYEENUMBER", "STAFFNO", "STAFFID"],
    name: ["EQUIPMENTNAME", "EQUIPNAME", "NAME", "ASSETNAME"],
    serialNo: ["SERIALNO", "SERIALNUMBER", "SERIALNUM", "SERIAL", "SN", "SEERIALNO"],
    location: ["LOCATIONNAME", "LOCATION", "LOC", "EQUIPMENTLOCATION"],
    building: ["BUILDING", "BLDG"],
    production: ["PRODTYPE", "PRODUCTIONTYPE", "PRODUCTION", "PROD"],
    due: ["DUEDATE", "CALIBRATIONDUEDATE", "CALDUEDATE", "DUE", "EXPIREDDATE", "EXPIRYDATE"],
    status: ["STATUS", "STATU", "EQUIPMENTSTATUS", "EQUIPSTATUS"],
    msa: ["MSA", "MSAREQUIREMENT", "MSAREQUIRED"],
    className: ["CLASS", "EQUIPMENTCLASS", "ACCURACYCLASS"],
    maker: ["MAKER", "MANUFACTURER", "BRAND"],
    modelNo: ["MODELNO", "MODELNUMBER", "MODEL"],
    functionName: ["FUNCTION", "EQUIPMENTFUNCTION", "FUNCTIONSTATUS"],
    areaUsed: ["AREAUSED", "USEDAREA", "AREAUSE"],
    processName: ["PROCESSNAME", "PROCESS", "PROCESSAREA"],
    stationLocation: ["STATIONLOCATION", "STATION", "STATIONNO", "STATIONNUMBER"],
    section: ["SECTION", "SECTIONUSE", "SECTIONCODE", "DEPARTMENT"],
    calibratedBy: ["CALIBRATEDBY", "CALIBRATIONBY", "CALBY", "CALIBRATOR", "CALIBRATIONSUPPLIER"],
    calibrationCost: ["CALIBRATIONCOST", "CALCOST", "COST"],
    frequencyMonths: ["FREQUENCY", "FREQUENCYMONTHS", "CALIBRATIONFREQUENCY"],
    calibrationDate: ["CALIBRATIONDATE", "CALDATE", "VERIFICATIONDATE"],
    intervalMonths: ["DURATION", "DURATIONMONTHS", "INTERVALMONTHS", "CALIBRATIONINTERVAL", "VERIFICATIONPERIOD", "INTERVAL"],
    nextVerificationDate: ["EXPIREDDATE", "EXPIRYDATE", "NEXTVERIFICATIONDATE", "NEXTCALIBRATIONDATE", "NEXTDUE", "NEXTDATE"],
    calibrationMonth: ["CALIBRATIONMONTH", "CALMONTH", "MONTH"],
    calibrationYear: ["CALIBRATIONYEAR", "CALYEAR", "YEAR"],
    calibrationTemplateType: ["CALIBRATIONTEMPLATE", "TEMPLATETYPE", "EQUIPMENTTYPE"]
};

const V2_IMPORT_COLUMN_SYNC = [
    { key: "code", systemLabel: "Equipment Code", expectedHeader: "EQUIPMENT CODE", required: true },
    { key: "issuedOn", systemLabel: "Issued On", expectedHeader: "ISSUED ON", required: false },
    { key: "issuerName", systemLabel: "Issuer Name", expectedHeader: "ISSUER NAME", required: false },
    { key: "issuerNo", systemLabel: "Issuer No.", expectedHeader: "ISSUER NO", required: false },
    { key: "serialNo", systemLabel: "Serial No.", expectedHeader: "SERIAL NO", required: true },
    { key: "name", systemLabel: "Equipment Name", expectedHeader: "EQUIPMENT NAME", required: true },
    { key: "location", systemLabel: "Location", expectedHeader: "LOCATION", required: true },
    { key: "building", systemLabel: "Building", expectedHeader: "BUILDING", required: true },
    { key: "production", systemLabel: "Prod Type", expectedHeader: "PRODTYPE", required: true },
    { key: "due", systemLabel: "Due Date", expectedHeader: "DUE DATE", required: true },
    { key: "status", systemLabel: "Equipment Status", expectedHeader: "STATUS", required: true },
    { key: "msa", systemLabel: "MSA", expectedHeader: "MSA", required: true },
    { key: "calibratedBy", systemLabel: "Calibrated By", expectedHeader: "CALBY / CALIBRATED BY", required: false }
];

let v2RawMasterLookupSource = null;
let v2RawMasterLookupCache = null;

function v2NormalizeFieldKey(value) {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

function v2FirstNonBlank(...values) {
    for (const value of values) {
        if (value === null || value === undefined) continue;
        const text = String(value).trim();
        if (text !== "") return text;
    }

    return "";
}

function v2ObjectValueByAliases(object, aliases) {
    if (!object || typeof object !== "object") return "";

    const keysByNormalizedName = new Map(
        Object.keys(object).map(key => [v2NormalizeFieldKey(key), key])
    );

    for (const alias of aliases) {
        const originalKey = keysByNormalizedName.get(v2NormalizeFieldKey(alias));
        if (!originalKey) continue;

        const value = object[originalKey];
        if (value !== null && value !== undefined && String(value).trim() !== "") {
            return value;
        }
    }

    return "";
}

function v2GetRawMasterLookup() {
    if (v2RawMasterLookupSource === rawMasterRows && v2RawMasterLookupCache) {
        return v2RawMasterLookupCache;
    }

    const rows = Array.isArray(rawMasterRows) ? rawMasterRows : [];
    const header = Array.isArray(rows[0]) ? rows[0] : [];
    const headerIndexes = new Map();

    header.forEach((value, index) => {
        const normalized = v2NormalizeFieldKey(value);
        if (normalized && !headerIndexes.has(normalized)) {
            headerIndexes.set(normalized, index);
        }
    });

    let codeIndex = -1;
    for (const alias of V2_MASTER_FIELD_ALIASES.code) {
        const index = headerIndexes.get(v2NormalizeFieldKey(alias));
        if (index !== undefined) {
            codeIndex = index;
            break;
        }
    }
    if (codeIndex < 0) codeIndex = 0;

    const rowsByCode = new Map();
    const orderedCodes = [];

    rows.slice(1).forEach(row => {
        if (!Array.isArray(row)) return;

        const code = String(row[codeIndex] ?? "").trim().toUpperCase();
        if (!code || rowsByCode.has(code)) return;

        rowsByCode.set(code, row);
        orderedCodes.push(code);
    });

    v2RawMasterLookupSource = rawMasterRows;
    v2RawMasterLookupCache = { headerIndexes, rowsByCode, orderedCodes };
    return v2RawMasterLookupCache;
}

function v2RawMasterValue(code, aliases) {
    const lookup = v2GetRawMasterLookup();
    const row = lookup.rowsByCode.get(String(code || "").trim().toUpperCase());
    if (!row) return "";

    for (const alias of aliases) {
        const index = lookup.headerIndexes.get(v2NormalizeFieldKey(alias));
        if (index === undefined) continue;

        const value = row[index];
        if (value !== null && value !== undefined && String(value).trim() !== "") {
            return value;
        }
    }

    return "";
}

function v2GetExportEquipmentFields(code, item) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const name = v2FirstNonBlank(
        v2ObjectValueByAliases(item, V2_MASTER_FIELD_ALIASES.name),
        v2RawMasterValue(normalizedCode, V2_MASTER_FIELD_ALIASES.name),
        "UNKNOWN"
    );
    const serialNo = v2FirstNonBlank(
        v2ObjectValueByAliases(item, V2_MASTER_FIELD_ALIASES.serialNo),
        v2RawMasterValue(normalizedCode, V2_MASTER_FIELD_ALIASES.serialNo)
    );
    const location = v2FirstNonBlank(
        v2ObjectValueByAliases(item, V2_MASTER_FIELD_ALIASES.location),
        v2RawMasterValue(normalizedCode, V2_MASTER_FIELD_ALIASES.location),
        "N/A"
    );
    const locationParts = parseLocationParts(location);
    const building = v2FirstNonBlank(
        v2ObjectValueByAliases(item, V2_MASTER_FIELD_ALIASES.building),
        v2RawMasterValue(normalizedCode, V2_MASTER_FIELD_ALIASES.building),
        locationParts.bldg,
        "N/A"
    );
    const production = v2FirstNonBlank(
        v2ObjectValueByAliases(item, V2_MASTER_FIELD_ALIASES.production),
        v2RawMasterValue(normalizedCode, V2_MASTER_FIELD_ALIASES.production),
        locationParts.prod,
        "N/A"
    );
    const calibratedBy = v2FirstNonBlank(
        v2ObjectValueByAliases(item, V2_MASTER_FIELD_ALIASES.calibratedBy),
        v2RawMasterValue(normalizedCode, V2_MASTER_FIELD_ALIASES.calibratedBy),
        "N/A"
    );

    return {
        name,
        serialNo,
        code: normalizedCode,
        location,
        building,
        production,
        calibratedBy
    };
}

function showToast(message, type = "info", duration = 3600) {
    const region = v2El("toastRegion");
    if (!region) return;

    const iconMap = {
        success: "OK",
        error: "!",
        warning: "!",
        info: "i"
    };

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon" aria-hidden="true">${iconMap[type] || "i"}</span>
        <span>${escapeHtml(message)}</span>
    `;

    region.appendChild(toast);

    window.setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(8px)";
        window.setTimeout(() => toast.remove(), 220);
    }, duration);
}

function v2GetAudioContext() {
    if (v2AudioContext) return v2AudioContext;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    try {
        v2AudioContext = new AudioContextClass();
        return v2AudioContext;
    } catch (error) {
        return null;
    }
}

function v2Tone(frequency, duration = 0.09, startDelay = 0, volume = 0.045) {
    const context = v2GetAudioContext();
    if (!context) return;

    try {
        if (context.state === "suspended") {
            context.resume().catch(() => {});
        }

        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const startAt = context.currentTime + startDelay;

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, startAt);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + duration + 0.02);
    } catch (error) {
        // Audio feedback is optional and must not interrupt scanning.
    }
}

function v2Feedback(kind) {
    if (kind === "pass") {
        v2Tone(720, 0.08, 0);
        v2Tone(980, 0.1, 0.09);
        navigator.vibrate?.(60);
        return;
    }

    if (kind === "fail") {
        v2Tone(260, 0.14, 0);
        v2Tone(190, 0.18, 0.13);
        navigator.vibrate?.([90, 60, 120]);
        return;
    }

    if (kind === "duplicate") {
        v2Tone(430, 0.08, 0);
        v2Tone(430, 0.08, 0.11);
        navigator.vibrate?.([50, 45, 50]);
        return;
    }

    v2Tone(520, 0.08, 0);
    navigator.vibrate?.(35);
}

function v2SetScannerStatus(text, state = "ready") {
    v2SetText("scannerStatusText", text);

    const dot = v2El("scannerStateDot");
    if (dot) {
        dot.className = `scanner-state-dot ${state}`;
    }
}

function v2SetLastScan(code, result) {
    v2SetText("lastScanCode", code || "None");
    v2SetText("lastScanResult", result || "Waiting");
}

function v2UpdatePendingBadge() {
    v2SetText("pendingSyncBadge", `${pendingUploads.length} pending`);
}

function v2UpdateConnectionUI() {
    const dot = v2El("syncStatus");
    const label = v2El("syncStatusText");

    if (dot) {
        dot.style.background = "";
        dot.style.boxShadow = "";
        dot.className = `connection-dot ${isOnline ? "online" : "offline"}`;
    }

    if (label) {
        label.textContent = isOnline ? "Cloud connected" : "Offline mode";
    }

    v2UpdatePendingBadge();
}

function v2FilterHasStructuredSelection(filters) {
    return Boolean(
        (filters.buildings || []).length ||
        (filters.productions || []).length ||
        (filters.months || []).length ||
        (filters.years || []).length ||
        (filters.statuses || []).length
    );
}

function v2IsModalOpen() {
    return Boolean(
        v2El("qcModal")?.classList.contains("is-open") ||
        v2El("missingEmailModal")?.classList.contains("is-open")
    );
}

function v37IsMissingEmailModalOpen() {
    return Boolean(v2El("missingEmailModal")?.classList.contains("is-open"));
}

function v2IsImportModalOpen() {
    return Boolean(v2El("importModal")?.classList.contains("is-open"));
}

function v2FocusScannerCollector() {
    if (v2IsModalOpen() || v2IsImportModalOpen()) return;
    window.setTimeout(() => v2El("barcodeCollector")?.focus(), 60);
}

/* -------------------------------------------------------------------------- */
/* Connection and offline queue                                                */
/* -------------------------------------------------------------------------- */

async function processOfflineQueue() {
    if (v2SyncInProgress || !isOnline || pendingUploads.length === 0) {
        v2UpdatePendingBadge();
        return;
    }

    v2SyncInProgress = true;

    const progressContainer = v2El("syncProgressContainer");
    const progressBar = v2El("syncProgressBar");
    const queue = [...pendingUploads];
    const remaining = [];
    let syncedCount = 0;
    let duplicateCount = 0;

    if (progressContainer) {
        progressContainer.hidden = false;
        progressContainer.style.display = "block";
    }

    try {
        const historyRef = db.ref("audit_history");

        for (let index = 0; index < queue.length; index += 1) {
            const data = queue[index];

            try {
                const snapshot = await historyRef
                    .orderByChild("barcode")
                    .equalTo(data.barcode)
                    .once("value");

                if (snapshot.exists()) {
                    duplicateCount += 1;
                } else {
                    const newRef = historyRef.push();
                    data.cloudId = newRef.key;
                    await newRef.set(data);
                    syncedCount += 1;
                }
            } catch (error) {
                remaining.push(data);
            }

            if (progressBar) {
                progressBar.style.width = `${Math.round(((index + 1) / queue.length) * 100)}%`;
            }
        }

        pendingUploads = remaining;

        if (remaining.length > 0) {
            localStorage.setItem("pending_queue", JSON.stringify(remaining));
        } else {
            localStorage.removeItem("pending_queue");
        }

        v2SetText("lastSyncTime", v2FormatClock());
        v2UpdatePendingBadge();
        updateDisplay();

        if (syncedCount > 0) {
            showToast(`${syncedCount} offline record${syncedCount === 1 ? "" : "s"} synchronized.`, "success");
        }

        if (duplicateCount > 0) {
            showToast(`${duplicateCount} queued duplicate${duplicateCount === 1 ? " was" : "s were"} skipped.`, "warning");
        }

        if (remaining.length > 0) {
            showToast(`${remaining.length} record${remaining.length === 1 ? "" : "s"} could not be synchronized yet.`, "warning");
        }
    } finally {
        window.setTimeout(() => {
            if (progressContainer) {
                progressContainer.hidden = true;
                progressContainer.style.display = "none";
            }
            if (progressBar) progressBar.style.width = "0%";
        }, 700);

        v2SyncInProgress = false;
    }
}

/* -------------------------------------------------------------------------- */
/* Login and scanner input                                                     */
/* -------------------------------------------------------------------------- */

function checkLogin() {
    const usernameElement = v2El("username");
    const passwordElement = v2El("password");
    const username = usernameElement?.value.trim() || "";
    const password = passwordElement?.value || "";
    const accessMode = getAccessModeForPassword(password);

    if (!username || !accessMode) {
        showToast("Invalid name or password.", "error");
        v2Feedback("fail");
        passwordElement?.focus();
        return;
    }

    loggedInUser = username;
    localStorage.setItem("grid_last_user", username);
    applyAccessMode(accessMode);

    v2SetText("userDisp", username);

    const overlay = v2El("loginOverlay");
    const main = v2El("mainApp");

    if (overlay) overlay.style.display = "none";
    if (main) {
        main.hidden = false;
        main.style.display = "block";
    }

    initScannerInput();
    v2SetScannerStatus("Scanner ready", "ready");
    updateDisplay();
    v2FocusScannerCollector();
    v2Feedback("pass");

    const modeLabel = isDeveloperMode() ? "Developer Mode" : "User Mode";
    const accessNote = isDeveloperMode()
        ? "Full controls are enabled."
        : "Scanning and individual audit-record deletion are enabled; Clear Cloud remains disabled.";
    showToast(`Welcome, ${username}. ${modeLabel}: ${accessNote}`, "success", 4600);
}

function initScannerInput() {
    if (v2ScannerInputInitialized) {
        v2FocusScannerCollector();
        return;
    }

    const collector = v2El("barcodeCollector");
    if (!collector) return;

    v2ScannerInputInitialized = true;

    document.addEventListener("pointerdown", event => {
        const target = event.target;
        const interactive = target?.closest?.("input, select, button, a, textarea, [contenteditable='true']");

        if (!v2IsModalOpen() && !v2IsImportModalOpen() && !interactive) {
            v2FocusScannerCollector();
        }
    });

    collector.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;

        event.preventDefault();
        const code = collector.value.trim();
        collector.value = "";

        if (code) {
            v2CurrentScanSource = "hardware";
            handleScannedCode(code);
        }
    });

    collector.focus();
}

function submitManualEntry() {
    const input = v2El("manualBarcode");
    const barcode = input?.value.trim() || "";

    if (!barcode) {
        showToast("Enter a barcode before processing.", "warning");
        input?.focus();
        return;
    }

    v2CurrentScanSource = "manual";
    input.value = "";
    handleScannedCode(barcode);
}

/* -------------------------------------------------------------------------- */
/* Checkbox multi-select filters and quick views                               */
/* -------------------------------------------------------------------------- */

const V2_MULTI_FILTER_IDS = [
    "filterBuilding",
    "filterProduction",
    "filterMonth",
    "filterYear",
    "filterStatus"
];

const V2_MULTI_FILTER_DEFAULTS = {
    filterBuilding: "All Buildings",
    filterProduction: "All Production",
    filterMonth: "All Months",
    filterYear: "All Years",
    filterStatus: "All Statuses"
};

function v2GetFilterValues(elementId) {
    const select = v2El(elementId);
    if (!select) return [];

    return Array.from(select.options)
        .filter(option => option.selected && option.value !== "")
        .map(option => option.value);
}

function getSelectedFilterState() {
    const buildings = v2GetFilterValues("filterBuilding");
    const productions = v2GetFilterValues("filterProduction");
    const months = v2GetFilterValues("filterMonth");
    const years = v2GetFilterValues("filterYear");
    const statuses = v2GetFilterValues("filterStatus");

    return {
        buildings,
        productions,
        months,
        years,
        statuses,
        // Scalar aliases retain compatibility with older helper functions.
        building: buildings.length === 1 ? buildings[0] : "",
        month: months.length === 1 ? months[0] : "",
        year: years.length === 1 ? years[0] : ""
    };
}

function v2GetMultiFilterParts(elementId) {
    return {
        select: v2El(elementId),
        widget: v2El(`${elementId}Widget`),
        trigger: v2El(`${elementId}Trigger`),
        summary: v2El(`${elementId}Summary`),
        count: v2El(`${elementId}Count`),
        menu: v2El(`${elementId}Menu`),
        search: v2El(`${elementId}OptionSearch`),
        options: v2El(`${elementId}Options`),
        empty: v2El(`${elementId}Empty`)
    };
}

function v2UpdateMultiFilterSummary(elementId) {
    const parts = v2GetMultiFilterParts(elementId);
    if (!parts.select || !parts.summary || !parts.trigger) return;

    const selectedValues = v2GetFilterValues(elementId);
    const totalOptions = parts.select.options.length;
    const defaultText = parts.widget?.dataset.defaultLabel ||
        V2_MULTI_FILTER_DEFAULTS[elementId] || "All";

    let summaryText = defaultText;

    if (selectedValues.length === 1) {
        summaryText = selectedValues[0];
    } else if (selectedValues.length > 1) {
        summaryText = selectedValues.length === totalOptions && totalOptions > 0
            ? `All selected`
            : `${selectedValues[0]} +${selectedValues.length - 1}`;
    }

    parts.summary.textContent = summaryText;
    parts.trigger.title = selectedValues.length
        ? selectedValues.join(", ")
        : defaultText;
    parts.trigger.classList.toggle("has-selection", selectedValues.length > 0);

    if (parts.count) {
        parts.count.hidden = selectedValues.length === 0;
        parts.count.textContent = String(selectedValues.length);
    }
}

function filterMultiFilterOptions(elementId, query = "") {
    const parts = v2GetMultiFilterParts(elementId);
    if (!parts.options) return;

    const normalizedQuery = String(query || "").trim().toUpperCase();
    let visibleCount = 0;

    parts.options.querySelectorAll(".multi-select-option").forEach(optionRow => {
        const matches = !normalizedQuery ||
            String(optionRow.dataset.searchText || "").includes(normalizedQuery);
        optionRow.hidden = !matches;
        if (matches) visibleCount += 1;
    });

    if (parts.empty) {
        parts.empty.hidden = visibleCount !== 0;
    }
}

function v2HandleMultiFilterChange(elementId) {
    v2AuditLimit = 200;
    v2UpdateMultiFilterSummary(elementId);

    if (elementId === "filterBuilding") {
        const selectedProductions = v2GetFilterValues("filterProduction");
        rebuildProductionFilter(selectedProductions);
    }

    updateDisplay();
}

function v2RenderMultiFilterOptions(elementId) {
    const parts = v2GetMultiFilterParts(elementId);
    if (!parts.select || !parts.options) return;

    parts.options.innerHTML = "";

    Array.from(parts.select.options).forEach((option, index) => {
        const optionRow = document.createElement("label");
        optionRow.className = "multi-select-option";
        optionRow.dataset.value = option.value;
        optionRow.dataset.searchText = String(option.textContent || option.value).toUpperCase();

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = option.selected;
        checkbox.value = option.value;
        checkbox.id = `${elementId}Checkbox${index}`;

        const checkmark = document.createElement("span");
        checkmark.className = "multi-select-checkmark";
        checkmark.setAttribute("aria-hidden", "true");

        const text = document.createElement("span");
        text.className = "multi-select-option-text";
        text.textContent = option.textContent || option.value;

        checkbox.addEventListener("change", () => {
            option.selected = checkbox.checked;
            v2HandleMultiFilterChange(elementId);
        });

        optionRow.append(checkbox, checkmark, text);
        parts.options.appendChild(optionRow);
    });

    if (parts.trigger) {
        parts.trigger.disabled = parts.select.options.length === 0;
    }

    v2UpdateMultiFilterSummary(elementId);
    filterMultiFilterOptions(elementId, parts.search?.value || "");
}

function setMultiSelectOptions(selectElement, values, selectedValues = []) {
    if (!selectElement) return;

    const normalizedValues = Array.from(new Set(
        values
            .map(value => String(value ?? "").trim())
            .filter(Boolean)
    ));
    const selectedSet = new Set(
        selectedValues
            .map(value => String(value ?? "").trim())
            .filter(value => normalizedValues.includes(value))
    );

    selectElement.multiple = true;
    selectElement.innerHTML = "";

    normalizedValues.forEach(value => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        option.selected = selectedSet.has(value);
        selectElement.appendChild(option);
    });

    v2RenderMultiFilterOptions(selectElement.id);
}

function v2CloseMultiFilter(elementId) {
    const parts = v2GetMultiFilterParts(elementId);
    if (!parts.menu || !parts.trigger || !parts.widget) return;

    parts.menu.hidden = true;
    parts.trigger.setAttribute("aria-expanded", "false");
    parts.widget.classList.remove("open");
}

function closeAllMultiFilters(exceptId = "") {
    V2_MULTI_FILTER_IDS.forEach(elementId => {
        if (elementId !== exceptId) v2CloseMultiFilter(elementId);
    });
}

function v2PositionMultiFilterMenu(elementId) {
    if (window.innerWidth <= 720) return;

    const parts = v2GetMultiFilterParts(elementId);
    if (!parts.menu) return;

    parts.menu.style.left = "";
    parts.menu.style.right = "";

    const rect = parts.menu.getBoundingClientRect();

    if (rect.right > window.innerWidth - 12) {
        parts.menu.style.left = "auto";
        parts.menu.style.right = "0";
    } else if (rect.left < 12) {
        parts.menu.style.left = "0";
        parts.menu.style.right = "auto";
    }
}

function toggleMultiFilter(elementId, forceOpen = null) {
    const parts = v2GetMultiFilterParts(elementId);
    if (!parts.menu || !parts.trigger || !parts.widget || parts.trigger.disabled) return;

    const shouldOpen = forceOpen === null ? parts.menu.hidden : Boolean(forceOpen);

    if (!shouldOpen) {
        v2CloseMultiFilter(elementId);
        return;
    }

    closeAllMultiFilters(elementId);
    parts.menu.hidden = false;
    parts.trigger.setAttribute("aria-expanded", "true");
    parts.widget.classList.add("open");

    window.requestAnimationFrame(() => {
        v2PositionMultiFilterMenu(elementId);
        parts.search?.focus();
        parts.search?.select();
    });
}

function selectAllMultiFilter(elementId) {
    const parts = v2GetMultiFilterParts(elementId);
    if (!parts.select || !parts.options) return;

    const visibleValues = new Set(
        Array.from(parts.options.querySelectorAll(".multi-select-option:not([hidden])"))
            .map(row => row.dataset.value)
    );

    Array.from(parts.select.options).forEach(option => {
        if (visibleValues.has(option.value)) option.selected = true;
    });

    v2RenderMultiFilterOptions(elementId);
    v2HandleMultiFilterChange(elementId);
}

function clearMultiFilter(elementId) {
    const parts = v2GetMultiFilterParts(elementId);
    if (!parts.select) return;

    Array.from(parts.select.options).forEach(option => {
        option.selected = false;
    });

    v2RenderMultiFilterOptions(elementId);
    v2HandleMultiFilterChange(elementId);
}

function getAvailableProductionsForBuilding(buildingSelection = null) {
    const selectedBuildings = Array.isArray(buildingSelection)
        ? buildingSelection
        : buildingSelection
            ? [buildingSelection]
            : v2GetFilterValues("filterBuilding");
    const buildingSet = new Set(selectedBuildings);
    const productionSet = new Set();

    Object.values(masterDB).forEach(item => {
        if (!item || !item.prod || item.prod === "N/A") return;

        if (buildingSet.size === 0 || buildingSet.has(item.bldg)) {
            productionSet.add(item.prod);
        }
    });

    return Array.from(productionSet).sort((a, b) => a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: "base"
    }));
}

function rebuildProductionFilter(selectedProductions = []) {
    const availableProductions = getAvailableProductionsForBuilding();
    const validSelections = selectedProductions.filter(value => availableProductions.includes(value));

    setMultiSelectOptions(
        v2El("filterProduction"),
        availableProductions,
        validSelections
    );
}

function onBuildingFilterChange() {
    const selectedProductions = v2GetFilterValues("filterProduction");
    rebuildProductionFilter(selectedProductions);
    v2AuditLimit = 200;
    updateDisplay();
}

function rebuildFilters() {
    const current = getSelectedFilterState();
    const buildingSet = new Set();
    const monthSet = new Set();
    const yearSet = new Set();
    const statusSet = new Set();

    Object.values(masterDB).forEach(item => {
        if (!item) return;
        if (item.bldg && item.bldg !== "N/A") buildingSet.add(item.bldg);
        if (item.month && item.month !== "N/A") monthSet.add(item.month);
        if (item.year && item.year !== "N/A") yearSet.add(item.year);
        if (item.status && item.status !== "N/A") statusSet.add(item.status);
    });

    const buildings = Array.from(buildingSet).sort((a, b) => a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: "base"
    }));
    const months = Array.from(monthSet).sort((a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b));
    const years = Array.from(yearSet).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    const statuses = Array.from(statusSet).sort((a, b) => a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: "base"
    }));

    setMultiSelectOptions(
        v2El("filterBuilding"),
        buildings,
        current.buildings.filter(value => buildings.includes(value))
    );
    setMultiSelectOptions(
        v2El("filterMonth"),
        months,
        current.months.filter(value => months.includes(value))
    );
    setMultiSelectOptions(
        v2El("filterYear"),
        years,
        current.years.filter(value => years.includes(value))
    );
    setMultiSelectOptions(
        v2El("filterStatus"),
        statuses,
        current.statuses.filter(value => statuses.includes(value))
    );
    rebuildProductionFilter(current.productions);
}

function itemMatchesFilters(item, filters) {
    if (!item) return false;

    const buildings = filters.buildings || (filters.building ? [filters.building] : []);
    const productions = filters.productions || [];
    const months = filters.months || (filters.month ? [filters.month] : []);
    const years = filters.years || (filters.year ? [filters.year] : []);
    const statuses = filters.statuses || [];

    return (buildings.length === 0 || buildings.includes(item.bldg)) &&
        (productions.length === 0 || productions.includes(item.prod)) &&
        (months.length === 0 || months.includes(item.month)) &&
        (years.length === 0 || years.includes(item.year)) &&
        (statuses.length === 0 || statuses.includes(item.status));
}

function setQuickView(view) {
    const allowed = new Set(["all", "abnormal", "missing", "passed", "mine", "unregistered", "pending"]);
    v2QuickView = allowed.has(view) ? view : "all";
    v2AuditLimit = 200;

    document.querySelectorAll(".quick-filter").forEach(button => {
        button.classList.toggle("active", button.dataset.view === v2QuickView);
    });

    updateDisplay();

    const targetId = v2QuickView === "pending" ? "pendingSection" : "auditLogsSection";
    v2El(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function loadMoreAuditRows() {
    v2AuditLimit += 200;
    updateDisplay();
}

function resetFilters() {
    const search = v2El("globalSearch");
    if (search) search.value = "";

    V2_MULTI_FILTER_IDS.forEach(elementId => {
        const parts = v2GetMultiFilterParts(elementId);

        if (parts.select) {
            Array.from(parts.select.options).forEach(option => {
                option.selected = false;
            });
        }

        if (parts.search) parts.search.value = "";
        v2CloseMultiFilter(elementId);
    });

    // Clearing buildings restores the full production option list.
    rebuildProductionFilter([]);

    V2_MULTI_FILTER_IDS.forEach(elementId => {
        v2RenderMultiFilterOptions(elementId);
    });

    v2QuickView = "all";
    v2AuditLimit = 200;

    document.querySelectorAll(".quick-filter").forEach(button => {
        button.classList.toggle("active", button.dataset.view === "all");
    });

    updateDisplay();
    showToast("All filters cleared.", "info", 2200);
}

function v2MatchesSearch(auditRecord, masterItem, search) {
    if (!search) return true;

    const code = String(auditRecord?.barcode || "").trim().toUpperCase();
    const exportFields = masterItem ? v2GetExportEquipmentFields(code, masterItem) : {};
    const values = [
        auditRecord?.barcode,
        auditRecord?.name,
        auditRecord?.pic,
        auditRecord?.remark,
        auditRecord?.locRes,
        auditRecord?.stickerLocRes,
        auditRecord?.dueRes,
        auditRecord?.msaRes,
        auditRecord?.updatedLocation,
        auditRecord?.updatedDue,
        auditRecord?.updatedStatus,
        auditRecord?.auditStatus,
        v2IsMissingAudit(auditRecord) ? "MISSING EQUIPMENT" : "",
        exportFields.name,
        exportFields.serialNo,
        exportFields.location,
        exportFields.building,
        exportFields.production,
        masterItem?.due,
        masterItem?.status,
        masterItem?.msa
    ];

    return values.some(value => String(value || "").toUpperCase().includes(search));
}

function v2MatchesMasterSearch(code, item, search) {
    if (!search) return true;

    const exportFields = v2GetExportEquipmentFields(code, item);

    return [
        exportFields.code,
        exportFields.name,
        exportFields.serialNo,
        exportFields.location,
        exportFields.building,
        exportFields.production,
        item?.due,
        item?.status,
        item?.msa
    ].some(value => String(value || "").toUpperCase().includes(search));
}

function v2GetFilteredAuditRecords(
    filters = getSelectedFilterState(),
    search = (v2El("globalSearch")?.value || "").trim().toUpperCase()
) {
    const includeUnregistered = !v2FilterHasStructuredSelection(filters);

    return scanHistory.filter(record => {
        const code = String(record.barcode || "").toUpperCase();
        const masterItem = masterDB[code];

        if (masterItem) {
            return itemMatchesFilters(masterItem, filters) &&
                v2MatchesSearch(record, masterItem, search);
        }

        return includeUnregistered && v2MatchesSearch(record, null, search);
    });
}

function v2IsMissingAudit(record) {
    return Boolean(
        record?.isMissing ||
        String(record?.locRes || "").trim().toUpperCase() === "MISSING" ||
        String(record?.auditStatus || "").trim().toUpperCase() === "MISSING"
    );
}

function v2AuditCategory(record) {
    if (v2IsMissingAudit(record)) return "MISSING";

    const storedStatus = String(record?.auditStatus || "").trim().toUpperCase();
    if (record?.isFail || ["ABNORMAL", "FAIL", "FAILED"].includes(storedStatus)) {
        return "ABNORMAL";
    }

    return "PASS";
}

function v2IsAbnormalAudit(record) {
    return v2AuditCategory(record) === "ABNORMAL";
}

function v2IsPassedAudit(record) {
    return v2AuditCategory(record) === "PASS";
}

function v2MsaRequired(value) {
    const normalized = String(value || "").trim().toUpperCase();
    return ["YES", "Y", "REQUIRED", "TRUE", "1"].includes(normalized);
}

function v2AuditPassesMsa(record, masterItem) {
    if (!v2MsaRequired(masterItem?.msa)) return true;
    return record?.msaRes === "YES";
}

function v2Pill(value, passValues = [], neutralValues = []) {
    const normalized = String(value || "N/A");
    const normalizedUpper = normalized.trim().toUpperCase();
    const cssClass = normalizedUpper === "MISSING"
        ? "pill-missing"
        : passValues.includes(normalized)
            ? "pill-pass"
            : neutralValues.includes(normalized)
                ? "pill-neutral"
                : "pill-fail";

    return `<span class="status-pill ${cssClass}">${escapeHtml(normalized)}</span>`;
}

function updateDisplay() {
    const search = (v2El("globalSearch")?.value || "").trim().toUpperCase();
    const filters = getSelectedFilterState();
    const allCodes = Object.keys(masterDB);

    const filteredTargetList = allCodes.filter(code => {
        const item = masterDB[code];
        return itemMatchesFilters(item, filters) && v2MatchesMasterSearch(code, item, search);
    });

    const filteredAuditResults = v2GetFilteredAuditRecords(filters, search);

    const targetCodeSet = new Set(filteredTargetList);
    const scannedCodesInTarget = new Set();

    filteredAuditResults.forEach(record => {
        const code = String(record.barcode || "").toUpperCase();
        if (targetCodeSet.has(code)) scannedCodesInTarget.add(code);
    });

    const scannedInTarget = scannedCodesInTarget.size;
    const completion = filteredTargetList.length > 0
        ? Math.min(100, Math.round((scannedInTarget / filteredTargetList.length) * 100))
        : 0;

    v2SetText("progressSubLabel", `Scanned: ${scannedInTarget} / ${filteredTargetList.length}`);
    drawGauge(completion);

    const missingItems = filteredAuditResults.filter(v2IsMissingAudit);
    const failedItems = filteredAuditResults.filter(v2IsAbnormalAudit);
    const passedItems = filteredAuditResults.filter(v2IsPassedAudit);
    const unregisteredItems = filteredAuditResults.filter(record => {
        return !masterDB[String(record.barcode || "").toUpperCase()];
    });

    updateFailureChart(failedItems);

    v2SetText("totalScans", filteredAuditResults.length);
    v2SetText("totalPassed", passedItems.length);
    v2SetText("totalFails", failedItems.length);
    v2SetText("totalMissing", missingItems.length);
    v2SetText("totalNotScanned", Math.max(filteredTargetList.length - scannedInTarget, 0));
    v2SetText("totalUnregistered", unregisteredItems.length);
    v2UpdatePendingBadge();

    let visibleAuditResults = filteredAuditResults;

    if (v2QuickView === "abnormal") {
        visibleAuditResults = visibleAuditResults.filter(v2IsAbnormalAudit);
    } else if (v2QuickView === "missing") {
        visibleAuditResults = visibleAuditResults.filter(v2IsMissingAudit);
    } else if (v2QuickView === "passed") {
        visibleAuditResults = visibleAuditResults.filter(v2IsPassedAudit);
    } else if (v2QuickView === "mine") {
        visibleAuditResults = visibleAuditResults.filter(record => record.pic === loggedInUser);
    } else if (v2QuickView === "unregistered") {
        visibleAuditResults = visibleAuditResults.filter(record => {
            return !masterDB[String(record.barcode || "").toUpperCase()];
        });
    } else if (v2QuickView === "pending") {
        visibleAuditResults = [];
    }

    const auditBody = v2El("inventoryBody");
    const auditEmptyState = v2El("auditEmptyState");
    const loadMoreButton = v2El("loadMoreAudits");
    const limitedAudits = visibleAuditResults.slice(0, v2AuditLimit);

    v2SetText(
        "auditResultCount",
        visibleAuditResults.length > v2AuditLimit
            ? `Showing ${v2AuditLimit} of ${visibleAuditResults.length}`
            : `${visibleAuditResults.length} record${visibleAuditResults.length === 1 ? "" : "s"}`
    );

    if (auditBody) {
        auditBody.innerHTML = limitedAudits.map(record => {
            const code = String(record.barcode || "").toUpperCase();
            const masterItem = masterDB[code];
            const originalStatus = masterItem?.status || "N/A";
            const auditCategory = v2AuditCategory(record);
            const rowClass = auditCategory === "MISSING"
                ? "row-missing"
                : !masterItem
                    ? "row-unregistered"
                    : auditCategory === "ABNORMAL"
                        ? "row-fail"
                        : "";
            const key = v2SafeActionValue(record.cloudId || record.id || record.barcode || "");
            const msaPassValues = v2AuditPassesMsa(record, masterItem) ? [record.msaRes] : [];
            const msaNeutralValues = record.msaRes === "N/A" ? ["N/A"] : [];
            const statusDisplay = auditCategory === "MISSING"
                ? `${v2Pill("MISSING")}<small class="master-status-note">Master: ${escapeHtml(originalStatus)}</small>`
                : escapeHtml(originalStatus);

            return `<tr class="${rowClass}">
                <td data-label="Time">${escapeHtml(record.time || "-")}</td>
                <td data-label="Code"><strong>${escapeHtml(record.barcode || "-")}</strong></td>
                <td data-label="Name">${escapeHtml(record.name || masterItem?.name || "-")}</td>
                <td data-label="PIC"><span style="color:var(--primary);font-weight:800">${escapeHtml(record.pic || "-")}</span></td>
                <td data-label="Physical Location">${v2Pill(record.locRes, ["CORRECT"])}</td>
                <td data-label="Sticker Location">${v2Pill(record.stickerLocRes || "N/A", ["CORRECT"], ["N/A"])}</td>
                <td data-label="Due">${v2Pill(record.dueRes, ["VALID"], ["N/A"])}</td>
                <td data-label="Status">${statusDisplay}</td>
                <td data-label="MSA">${v2Pill(record.msaRes, msaPassValues, msaNeutralValues)}</td>
                <td data-label="Remark">${escapeHtml(record.remark || "-")}</td>
                <td data-label="Action">
                    <div class="row-action-group">
                        <button class="btn-detail-row" onclick="openAuditDetail('${key}')">Detail</button>
                        ${canDeleteAuditRecords() ? `<button class="btn-delete-row" onclick="deleteRow('${key}')">Delete</button>` : ""}
                    </div>
                </td>
            </tr>`;
        }).join("");
    }

    if (auditEmptyState) auditEmptyState.hidden = limitedAudits.length > 0;
    if (loadMoreButton) loadMoreButton.hidden = visibleAuditResults.length <= v2AuditLimit;

    const scannedIds = new Set(scanHistory.map(record => String(record.barcode || "").toUpperCase()));
    const pendingCodes = filteredTargetList.filter(code => !scannedIds.has(code));
    const pendingBody = v2El("pendingBody");
    const pendingEmptyState = v2El("pendingEmptyState");
    const renderedPendingCodes = pendingCodes.slice(0, 500);

    v2SetText(
        "pendingResultCount",
        pendingCodes.length > 500
            ? `Showing 500 of ${pendingCodes.length}`
            : `${pendingCodes.length} item${pendingCodes.length === 1 ? "" : "s"}`
    );

    if (pendingBody) {
        pendingBody.innerHTML = renderedPendingCodes.map(code => {
            const item = masterDB[code];
            let lock = null;

            try {
                lock = activeLocks[btoa(code).replace(/=/g, "")];
            } catch (error) {
                lock = null;
            }

            const lockedByAnother = lock && lock.user !== loggedInUser;
            const lockTag = lock
                ? `<span class="lock-tag">Locked by ${escapeHtml(lock.user || "another auditor")}</span>`
                : "";
            const encodedCode = v2SafeActionValue(code);

            return `<tr${lock ? ' style="border-left-color:#795548"' : ""}>
                <td data-label="Code"><strong>${escapeHtml(code)}</strong>${lockTag}</td>
                <td data-label="Name">${escapeHtml(item.name || "-")}</td>
                <td data-label="Location">${escapeHtml(item.loc || "-")}</td>
                <td data-label="Due">${escapeHtml(item.due || "-")}</td>
                <td data-label="Status">${escapeHtml(item.status || "-")}</td>
                <td data-label="MSA">${escapeHtml(item.msa || "-")}</td>
                <td data-label="Action">
                    <button class="btn-pending-row" onclick="startPendingAudit('${encodedCode}')" ${lockedByAnother ? "disabled" : ""}>
                        Verify
                    </button>
                </td>
            </tr>`;
        }).join("");
    }

    if (pendingEmptyState) pendingEmptyState.hidden = renderedPendingCodes.length > 0;
}

/* -------------------------------------------------------------------------- */
/* Gauge and abnormal chart                                                    */
/* -------------------------------------------------------------------------- */

function drawGauge(percent) {
    targetGaugeValue = Math.max(0, Math.min(100, Number(percent) || 0));

    if (!v2GaugeAnimationFrame) {
        v2GaugeAnimationFrame = requestAnimationFrame(animateGauge);
    }
}

function animateGauge() {
    const difference = targetGaugeValue - currentGaugeValue;

    if (Math.abs(difference) < 0.15) {
        currentGaugeValue = targetGaugeValue;
    } else {
        currentGaugeValue += difference * 0.13;
    }

    const canvas = v2El("gaugeCanvas");
    if (canvas) {
        const context = canvas.getContext("2d");
        const size = canvas.width;
        const center = size / 2;
        const radius = center - 11;
        const startAngle = -0.5 * Math.PI;
        const endAngle = (currentGaugeValue / 100) * (2 * Math.PI) + startAngle;
        const gaugeColor = currentGaugeValue >= 90
            ? "#2e7d32"
            : currentGaugeValue >= 50
                ? "#8d6e63"
                : "#f9a825";

        context.clearRect(0, 0, size, size);
        context.beginPath();
        context.arc(center, center, radius, 0, 2 * Math.PI);
        context.strokeStyle = "#efebe9";
        context.lineWidth = 10;
        context.stroke();

        context.beginPath();
        context.arc(center, center, radius, startAngle, endAngle);
        context.strokeStyle = gaugeColor;
        context.lineWidth = 10;
        context.lineCap = "round";
        context.stroke();

        const text = v2El("progressPercent");
        if (text) {
            text.textContent = `${Math.round(currentGaugeValue)}%`;
            text.style.color = gaugeColor;
        }
    }

    if (Math.abs(targetGaugeValue - currentGaugeValue) >= 0.15) {
        v2GaugeAnimationFrame = requestAnimationFrame(animateGauge);
    } else {
        v2GaugeAnimationFrame = null;
    }
}

function updateFailureChart(failedItems) {
    const counts = {
        "Wrong location": 0,
        "Wrong sticker location": 0,
        "Expired due": 0,
        "Unreadable due": 0,
        "Missing MSA": 0,
        "Status updated": 0,
        "Unregistered": 0,
        "Other": 0
    };

    failedItems.forEach(record => {
        if (v2IsMissingAudit(record)) return;

        const masterItem = masterDB[String(record.barcode || "").toUpperCase()];
        let categorized = false;

        if (record.locRes === "WRONG") {
            counts["Wrong location"] += 1;
            categorized = true;
        }

        if (record.stickerLocRes === "WRONG") {
            counts["Wrong sticker location"] += 1;
            categorized = true;
        }

        if (record.dueRes === "EXPIRED") {
            counts["Expired due"] += 1;
            categorized = true;
        }

        if (record.dueRes === "UNREADABLE") {
            counts["Unreadable due"] += 1;
            categorized = true;
        }

        if (v2MsaRequired(masterItem?.msa) && record.msaRes !== "YES") {
            counts["Missing MSA"] += 1;
            categorized = true;
        }

        if (record.masterStatusUpdated) {
            counts["Status updated"] += 1;
            categorized = true;
        }

        if (!masterItem || record.isUnregistered) {
            counts["Unregistered"] += 1;
            categorized = true;
        }

        if (!categorized) counts.Other += 1;
    });

    const labels = Object.keys(counts).filter(label => counts[label] > 0);
    const data = labels.map(label => counts[label]);
    const colors = ["#d32f2f", "#c62828", "#f57c00", "#f9a825", "#7b1fa2", "#5d4037", "#1565c0", "#795548"];
    const canvas = v2El("failureChart");
    const legend = v2El("failureLegend");

    if (!canvas) return;

    if (labels.length === 0) {
        if (failureChartInstance) {
            failureChartInstance.destroy();
            failureChartInstance = null;
        }
        canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        if (legend) legend.textContent = "No abnormal conditions detected.";
        return;
    }

    const chartData = {
        labels,
        datasets: [{
            label: "Issues",
            data,
            backgroundColor: colors.slice(0, labels.length),
            borderWidth: 0,
            borderRadius: 6,
            barThickness: 15
        }]
    };

    if (failureChartInstance) {
        failureChartInstance.data = chartData;
        failureChartInstance.update("none");
    } else {
        failureChartInstance = new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: "y",
                animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { displayColors: false }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { precision: 0 },
                        grid: { color: "rgba(121,85,72,0.08)" }
                    },
                    y: {
                        ticks: { font: { size: 10 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    if (legend) {
        legend.innerHTML = labels.map((label, index) => `
            <div class="failure-legend-row">
                <span class="failure-legend-label">
                    <span class="legend-dot" style="background:${colors[index]}"></span>
                    ${escapeHtml(label)}
                </span>
                <strong>${data[index]}</strong>
            </div>
        `).join("");
    }
}

/* -------------------------------------------------------------------------- */
/* Verification workflow                                                       */
/* -------------------------------------------------------------------------- */

function v2DueStatusSuggestion(dueValue) {
    const normalized = String(dueValue || "").trim().toUpperCase();
    const match = normalized.match(/^([A-Z]{3})-(\d{2}|\d{4})$/);

    if (!match || !MONTH_ORDER.includes(match[1])) return null;

    const monthIndex = MONTH_ORDER.indexOf(match[1]);
    const year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
    const endOfDueMonth = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

    if (Number.isNaN(endOfDueMonth.getTime())) return null;

    return new Date() <= endOfDueMonth ? "VALID" : "EXPIRED";
}

function v2ClearToggleClasses() {
    [
        "btnLocCorrect", "btnLocWrong",
        "btnStickerLocCorrect", "btnStickerLocWrong",
        "btnDueValid", "btnDueExpired", "btnDueUnreadable",
        "btnMsaYes", "btnMsaNo", "btnMsaNa"
    ].forEach(id => {
        const button = v2El(id);
        if (button) button.className = "option-btn";
    });
}

function v2ApplyToggleClasses() {
    v2ClearToggleClasses();

    if (selectedLoc === "CORRECT") v2El("btnLocCorrect")?.classList.add("active-pass");
    if (selectedLoc === "WRONG") v2El("btnLocWrong")?.classList.add("active-fail");

    if (selectedStickerLoc === "CORRECT") v2El("btnStickerLocCorrect")?.classList.add("active-pass");
    if (selectedStickerLoc === "WRONG") v2El("btnStickerLocWrong")?.classList.add("active-fail");

    if (selectedDue === "VALID") v2El("btnDueValid")?.classList.add("active-pass");
    if (selectedDue === "EXPIRED") v2El("btnDueExpired")?.classList.add("active-fail");
    if (selectedDue === "UNREADABLE") v2El("btnDueUnreadable")?.classList.add("active-fail");

    if (selectedMsa === "YES") v2El("btnMsaYes")?.classList.add("active-pass");
    if (selectedMsa === "NO") v2El("btnMsaNo")?.classList.add("active-fail");
    if (selectedMsa === "N/A") v2El("btnMsaNa")?.classList.add("active-neutral");

    v2El("btnMissingEquipment")?.classList.toggle("active", v2MissingMode);
}

function v2ResetNormalVerification() {
    selectedLoc = null;
    selectedStickerLoc = null;
    selectedDue = null;
    selectedMsa = v2MsaRequired(currentItem?.msa) ? null : "N/A";
}

function setToggle(type, value) {
    if (v2MissingMode) {
        v2MissingMode = false;
        v2ResetNormalVerification();

        const remarkInput = v2El("qcRemark");
        if (remarkInput?.value.trim().toUpperCase() === "EQUIPMENT MISSING") {
            remarkInput.value = "";
        }
    }

    if (type === "Loc") selectedLoc = value;
    if (type === "StickerLoc") selectedStickerLoc = value;
    if (type === "Due") selectedDue = value;
    if (type === "Msa") selectedMsa = value;

    v2ApplyToggleClasses();
    updateVerificationState();
}

function v2BuildRemarkSuggestion() {
    if (!currentItem) return "";

    const suggestions = [];

    if (v2MissingMode) return "Equipment missing";
    if (currentItem.isUnregistered) suggestions.push("Equipment not registered");
    if (selectedLoc === "WRONG") suggestions.push("Location not match");
    if (selectedStickerLoc === "WRONG") suggestions.push("Location on sticker not match");
    if (selectedDue === "EXPIRED") suggestions.push("Wrong due date");
    if (selectedDue === "UNREADABLE") suggestions.push("Missing due date sticker");
    if (v2MsaRequired(currentItem.msa) && selectedMsa !== "YES") suggestions.push("MSA sticker missing");

    return suggestions.join("; ");
}

function v2NormalVerificationState() {
    const checks = [
        [selectedLoc, ["CORRECT", "WRONG"]],
        [selectedStickerLoc, ["CORRECT", "WRONG"]],
        [selectedDue, ["VALID", "EXPIRED", "UNREADABLE"]],
        [selectedMsa, ["YES", "NO", "N/A"]]
    ];

    const completed = checks.filter(([value, allowed]) => allowed.includes(value)).length;
    return { completed, isComplete: completed === checks.length };
}

function updateVerificationState() {
    const { completed, isComplete } = v2NormalVerificationState();
    const progress = v2El("verificationProgress");
    const saveButton = v2El("btnSubmitQC");
    const missingButton = v2El("btnMissingEquipment");
    const editMode = Boolean(currentAuditEditRecord);

    if (progress) {
        progress.classList.toggle("complete", isComplete && !v2MissingMode);
        progress.classList.toggle("missing", v2MissingMode);
        progress.textContent = v2MissingMode
            ? "Equipment is marked missing. The other verification checks are not required."
            : isComplete
                ? "All verification checks are complete."
                : `${completed} of 4 verification checks completed, or use Mark Missing & Notify.`;
    }

    if (saveButton) {
        saveButton.disabled = !isComplete || v2IsSubmitting || v2MissingMode;
        saveButton.textContent = v2IsSubmitting && !v2MissingMode
            ? "Saving..."
            : isComplete
                ? (editMode ? "Update audit record" : "Save audit record")
                : "Complete verification";
    }

    if (missingButton) {
        const unavailable = Boolean(currentItem?.isUnregistered);
        missingButton.disabled = v2IsSubmitting || unavailable;
        missingButton.classList.toggle("active", v2MissingMode);
        missingButton.textContent = v2IsSubmitting && v2MissingMode
            ? "Saving missing..."
            : v2MissingMode && editMode
                ? "Keep Missing & Notify"
                : "Mark Missing & Notify";
        missingButton.title = unavailable
            ? "Only registered equipment can be marked missing."
            : "Save this item as missing and prepare an email for a selected production-group recipient.";
    }

    v2RemarkSuggestion = v2BuildRemarkSuggestion();

    const suggestionBox = v2El("remarkSuggestion");
    const suggestionText = v2El("remarkSuggestionText");
    const currentRemark = v2El("qcRemark")?.value.trim() || "";

    if (suggestionBox && suggestionText) {
        const shouldShow = Boolean(v2RemarkSuggestion) && currentRemark !== v2RemarkSuggestion;
        suggestionBox.hidden = !shouldShow;
        suggestionText.textContent = v2RemarkSuggestion
            ? `Suggested remark: ${v2RemarkSuggestion}`
            : "";
    }
}

function clearRemark() {
    const input = v2El("qcRemark");
    if (input) input.value = "";
    updateVerificationState();
}

function applyRemarkSuggestion() {
    const input = v2El("qcRemark");
    if (input && v2RemarkSuggestion) {
        input.value = v2RemarkSuggestion;
        updateVerificationState();
    }
}

function applyDueSuggestion() {
    if (!v2DueSuggestion) return;
    setToggle("Due", v2DueSuggestion);
}

function setModalMode(isEditMode) {
    v2SetText("qcModalTitle", isEditMode ? "SCANNED ITEM DETAIL" : "VERIFICATION");
}

function renderQCModal(auditRecord = null) {
    const modalDataBox = v2El("modalDataBox");
    const remarkInput = v2El("qcRemark");
    const isEditMode = Boolean(auditRecord);

    if (!currentItem) return;

    setModalMode(isEditMode);

    const safeCode = escapeHtml(currentItem.barcode || "-");
    const safeName = escapeHtml(currentItem.name || "-");
    const equipmentFields = v2GetExportEquipmentFields(currentItem.barcode, currentItem);
    const safeSerialNo = escapeHtml(equipmentFields.serialNo || "N/A");
    const safeProdType = escapeHtml(equipmentFields.production || "N/A");
    const safeBuilding = escapeHtml(equipmentFields.building || "N/A");
    const safeCalibratedBy = escapeHtml(equipmentFields.calibratedBy || "N/A");
    const safeLocation = escapeHtml(currentItem.loc || "N/A");
    const safeDue = escapeHtml(currentItem.due || "N/A");
    const safeStatus = escapeHtml(currentItem.status || "N/A");
    const safeMsa = escapeHtml(currentItem.msa || "N/A");
    const editDisabled = currentItem.isUnregistered ? "disabled" : "";

    const auditCategory = auditRecord ? v2AuditCategory(auditRecord) : "";
    const recordIsMissing = auditCategory === "MISSING";
    const missingNotificationMeta = recordIsMissing && auditRecord?.missingEmailRecipient ? `
        <div><span>Notification group</span><strong>${escapeHtml(auditRecord.missingEmailGroup || "-")}</strong></div>
        <div><span>Notification recipient</span><strong>${escapeHtml(auditRecord.missingEmailRecipient)}</strong></div>
        <div><span>Email status</span><strong>${escapeHtml(auditRecord.missingEmailStatus || "DRAFT PREPARED")}</strong></div>
    ` : "";
    const detailMeta = isEditMode ? `
        <div class="scan-detail-meta">
            <div><span>Scanned time</span><strong>${escapeHtml(auditRecord.time || "-")}</strong></div>
            <div><span>Scanned by</span><strong>${escapeHtml(auditRecord.pic || "-")}</strong></div>
            <div><span>Audit result</span><strong>${auditCategory}</strong></div>
            <div><span>Recorded equipment status</span><strong>${escapeHtml(auditRecord.updatedStatus || currentItem.status || "N/A")}</strong></div>
            ${missingNotificationMeta}
        </div>
    ` : "";

    if (modalDataBox) {
        modalDataBox.innerHTML = `
            <span class="eyebrow">Scanned content</span>
            <strong class="scan-code">${safeCode}</strong>
            <div class="equipment-name">
                <span>Equipment name</span>
                <strong>${safeName}</strong>
            </div>
            <div class="equipment-profile-grid" aria-label="Additional registered equipment details">
                <div><span>Serial no.</span><strong>${safeSerialNo}</strong></div>
                <div><span>Prod type</span><strong>${safeProdType}</strong></div>
                <div><span>Building</span><strong>${safeBuilding}</strong></div>
                <div><span>Calibrated by</span><strong>${safeCalibratedBy}</strong></div>
            </div>
            ${detailMeta}
            <div class="registered-data-grid">
                <div>
                    <span>Registered location</span>
                    <div class="master-edit-control">
                        <strong id="qcLocationDisplay" class="master-edit-value">${safeLocation}</strong>
                        <input type="text" id="qcLocationInput" class="master-edit-input" value="${safeLocation}" data-original-value="${safeLocation}"
                            onkeydown="if(event.key === 'Enter'){ toggleMasterFieldEdit('loc'); }" ${editDisabled}>
                        <button type="button" id="btnEditLocation" class="btn-inline-edit" onclick="toggleMasterFieldEdit('loc')" ${editDisabled}>EDIT</button>
                    </div>
                </div>
                <div>
                    <span>Registered due</span>
                    <div class="master-edit-control">
                        <strong id="qcDueDisplay" class="master-edit-value">${safeDue}</strong>
                        <input type="text" id="qcDueInput" class="master-edit-input" value="${safeDue}" data-original-value="${safeDue}"
                            placeholder="APR-27" onkeydown="if(event.key === 'Enter'){ toggleMasterFieldEdit('due'); }" ${editDisabled}>
                        <button type="button" id="btnEditDue" class="btn-inline-edit" onclick="toggleMasterFieldEdit('due')" ${editDisabled}>EDIT</button>
                    </div>
                </div>
                <div>
                    <span>Equipment status</span>
                    <div class="master-edit-control">
                        <strong id="qcStatusDisplay" class="master-edit-value">${safeStatus}</strong>
                        <input type="text" id="qcStatusInput" class="master-edit-input" value="${safeStatus}" data-original-value="${safeStatus}"
                            list="qcStatusSuggestions" maxlength="60" autocapitalize="characters"
                            onkeydown="if(event.key === 'Enter'){ toggleMasterFieldEdit('status'); }" ${editDisabled}>
                        <button type="button" id="btnEditStatus" class="btn-inline-edit" onclick="toggleMasterFieldEdit('status')" ${editDisabled}>EDIT</button>
                        <datalist id="qcStatusSuggestions">
                            <option value="ACTIVE"></option>
                            <option value="INACTIVE"></option>
                            <option value="UNDER REPAIR"></option>
                            <option value="OUT OF SERVICE"></option>
                            <option value="MISSING"></option>
                            <option value="DISPOSED"></option>
                        </datalist>
                    </div>
                </div>
                <div><span>Registered MSA</span><strong>${safeMsa}</strong></div>
            </div>
        `;
    }

    if (remarkInput) {
        const existingRemark = isEditMode ? String(auditRecord.remark || "") : "";
        remarkInput.value = existingRemark === "-" ? "" : existingRemark;
    }

    v2DueSuggestion = v2DueStatusSuggestion(currentItem.due);

    v2MissingMode = recordIsMissing;

    if (recordIsMissing) {
        selectedLoc = "MISSING";
        selectedStickerLoc = "N/A";
        selectedDue = "N/A";
        selectedMsa = "N/A";
    } else if (isEditMode) {
        selectedLoc = auditRecord.locRes || null;
        selectedStickerLoc = auditRecord.stickerLocRes || null;
        selectedDue = auditRecord.dueRes || null;
        selectedMsa = auditRecord.msaRes || null;
    } else if (currentItem.isUnregistered) {
        selectedLoc = "WRONG";
        selectedStickerLoc = "WRONG";
        selectedDue = "UNREADABLE";
        selectedMsa = "N/A";
    } else {
        v2ResetNormalVerification();
    }

    const dueText = v2El("dueSuggestionText");
    const dueButton = v2El("applyDueSuggestionButton");

    if (dueText) {
        dueText.textContent = v2DueSuggestion
            ? `System suggests ${v2DueSuggestion} from ${currentItem.due}.`
            : "No reliable date suggestion is available; inspect the sticker.";
    }

    if (dueButton) {
        dueButton.hidden = !v2DueSuggestion || isEditMode;
        dueButton.textContent = v2DueSuggestion
            ? `Apply ${v2DueSuggestion.toLowerCase()} suggestion`
            : "Apply system suggestion";
    }

    const msaText = v2El("msaRequirementText");
    if (msaText) {
        msaText.textContent = v2MsaRequired(currentItem.msa)
            ? `Registered MSA is ${currentItem.msa}; sticker confirmation is required.`
            : `Registered MSA is ${currentItem.msa || "N/A"}; N/A is preselected.`;
    }

    v2ApplyToggleClasses();
    updateVerificationState();

    const modal = v2El("qcModal");
    if (modal) {
        modal.hidden = false;
        modal.style.display = "";
        modal.classList.add("is-open");
        modal.focus();
    }

    v2SetScannerStatus(`Verify ${currentItem.barcode}`, "busy");
}

function v2FormatMissingRemark(remarkValue) {
    const cleaned = String(remarkValue || "").trim();
    if (!cleaned) return "Equipment missing";
    if (cleaned.toUpperCase().includes("EQUIPMENT MISSING")) return cleaned;
    return `Equipment missing; ${cleaned}`;
}

/* -------------------------------------------------------------------------- */
/* Missing-equipment production email workflow                                 */
/* -------------------------------------------------------------------------- */

function v37EmailDirectory() {
    const source = window.GRID_MISSING_EMAIL_DIRECTORY;
    return source && typeof source === "object" ? source : {};
}

function v37EmailGroupOrder() {
    const configured = window.GRID_MISSING_EMAIL_GROUP_ORDER;
    const groups = Array.isArray(configured) ? configured : Object.keys(v37EmailDirectory());
    return groups.filter(group => Array.isArray(v37EmailDirectory()[group]) && v37EmailDirectory()[group].length);
}

function v37NormalizeProductionToken(value) {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/&/g, "AND")
        .replace(/[^A-Z0-9]+/g, "");
}

function v37ResolveProductionEmailGroup(prodType, location) {
    const tokens = [prodType, location]
        .flatMap(value => {
            const original = String(value || "").trim();
            const pieces = original.split(/[-_/\\\s]+/g).filter(Boolean);
            return [original, ...pieces];
        })
        .map(v37NormalizeProductionToken)
        .filter(Boolean);

    const rules = [
        ["SPAREPART", token => /^(SPAREPART|SPARE|SPART)/.test(token)],
        ["WORKSHOP", token => /^(WORKSHOP|WSHOP)/.test(token)],
        ["UTILITY", token => /^(UTILITY|ULTILITY)/.test(token)],
        ["RND", token => /^(RND|RANDD|RD)$/.test(token)],
        ["IQC", token => /^(IQC|IPC)/.test(token)],
        ["OQC", token => /^(OQC|QC)$/.test(token)],
        ["LQH", token => /^(LQH|LQW|LTM)/.test(token)],
        ["PLT", token => /^(PLT|PLATING)/.test(token)],
        ["DCC", token => /^(DCC|DLW|DM|HAC)/.test(token)],
        ["CM", token => /^(CM|MCW|MC|2MC|MIDCORE|MIDDLECORE|COREPOWDER)/.test(token)],
        ["FP", token => /^(FP|F1518)/.test(token)],
        ["RF", token => /^RF/.test(token)],
        ["AG", token => /^AG/.test(token)],
        ["CAL", token => /^CAL/.test(token)],
        ["WH", token => /^(WH|MWH|FWH)/.test(token)],
        ["ENG", token => /^(ENG|TECH)/.test(token)],
        ["LAB", token => /^LAB/.test(token)]
    ];

    for (const [group, matches] of rules) {
        if (tokens.some(matches) && v37EmailDirectory()[group]?.length) return group;
    }

    return "";
}

function v37EmailPreferenceKey(group) {
    return `grid_missing_email_recipients_${v37NormalizeProductionToken(group)}`;
}

function v37LegacyEmailPreferenceKey(group) {
    return `grid_missing_email_recipient_${v37NormalizeProductionToken(group)}`;
}

function v40NormalizeRecipientList(value) {
    const values = Array.isArray(value)
        ? value
        : String(value || "").split(/[;,]+/g);
    return Array.from(new Set(values
        .map(item => String(item || "").trim().toLowerCase())
        .filter(Boolean)));
}

function v37ReadPreferredRecipient(group) {
    try {
        const raw = window.localStorage.getItem(v37EmailPreferenceKey(group));
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return v40NormalizeRecipientList(parsed);
            } catch (error) {
                return v40NormalizeRecipientList(raw);
            }
        }
        const legacy = window.localStorage.getItem(v37LegacyEmailPreferenceKey(group)) || "";
        return v40NormalizeRecipientList(legacy);
    } catch (error) {
        return [];
    }
}

function v37RememberPreferredRecipient(group, recipients) {
    try {
        const normalized = v40NormalizeRecipientList(recipients);
        window.localStorage.setItem(v37EmailPreferenceKey(group), JSON.stringify(normalized));
        window.localStorage.removeItem(v37LegacyEmailPreferenceKey(group));
    } catch (error) {
        // Saved preferences are convenient but are not required for the workflow.
    }
}

function v37PopulateMissingEmailGroups(preferredGroup = "") {
    const select = v2El("missingEmailGroupSelect");
    if (!select) return "";

    const groups = v37EmailGroupOrder();
    select.innerHTML = '<option value="">Select production email group</option>' + groups.map(group => {
        const label = group === "RND" ? "RND / R&D" : group === "SPAREPART" ? "SPARE PART" : group;
        return `<option value="${escapeHtml(group)}">${escapeHtml(label)}</option>`;
    }).join("");

    const equipmentFields = currentItem
        ? v2GetExportEquipmentFields(currentItem.barcode, currentItem)
        : { production: "", location: "" };
    const detected = v37ResolveProductionEmailGroup(equipmentFields.production, equipmentFields.location);
    const validPreferred = groups.includes(preferredGroup) ? preferredGroup : "";
    select.value = validPreferred || detected || "";
    return select.value;
}

function v40GetSelectedMissingEmailRecipients() {
    const list = v2El("missingEmailRecipientList");
    if (!list) return [];
    return Array.from(list.querySelectorAll('input[type="checkbox"][data-missing-email-recipient]:checked'))
        .map(input => String(input.value || "").trim().toLowerCase())
        .filter(Boolean);
}

function v37PopulateMissingEmailRecipients(preferredRecipients = []) {
    const groupSelect = v2El("missingEmailGroupSelect");
    const recipientList = v2El("missingEmailRecipientList");
    const countText = v2El("missingEmailRecipientCount");
    if (!groupSelect || !recipientList) return [];

    const group = groupSelect.value;
    const recipients = Array.isArray(v37EmailDirectory()[group])
        ? v37EmailDirectory()[group].map(email => String(email || "").trim().toLowerCase()).filter(Boolean)
        : [];

    const requested = v40NormalizeRecipientList(preferredRecipients);
    const savedPreference = v37ReadPreferredRecipient(group);
    const initialSelected = requested.length
        ? requested.filter(email => recipients.includes(email))
        : savedPreference.filter(email => recipients.includes(email));
    const selected = initialSelected.length
        ? initialSelected
        : (recipients.length === 1 ? [recipients[0]] : []);

    recipientList.innerHTML = recipients.length
        ? recipients.map((email, index) => {
            const checked = selected.includes(email) ? " checked" : "";
            return `<label class="missing-email-recipient-option" for="missingEmailRecipient_${index}">`
                + `<input id="missingEmailRecipient_${index}" type="checkbox" data-missing-email-recipient value="${escapeHtml(email)}" onchange="v37HandleMissingEmailRecipientChange()"${checked}>`
                + `<span>${escapeHtml(email)}</span></label>`;
        }).join("")
        : `<div class="missing-email-recipient-empty">${group ? "No unhighlighted recipient is configured for this group." : "Select a production email group first."}</div>`;

    if (countText) {
        const selectedCount = selected.length;
        countText.textContent = recipients.length
            ? `${recipients.length} unhighlighted recipient${recipients.length === 1 ? "" : "s"} available for ${group}. ${selectedCount} selected.`
            : group
                ? `No unhighlighted recipient is configured for ${group}.`
                : "Select a production email group first.";
    }

    v37UpdateMissingEmailPreview();
    return selected;
}

function v40SelectAllMissingEmailRecipients() {
    const list = v2El("missingEmailRecipientList");
    if (!list) return;
    list.querySelectorAll('input[type="checkbox"][data-missing-email-recipient]').forEach(input => {
        input.checked = true;
    });
    v37HandleMissingEmailRecipientChange();
}

function v40ClearMissingEmailRecipients() {
    const list = v2El("missingEmailRecipientList");
    if (!list) return;
    list.querySelectorAll('input[type="checkbox"][data-missing-email-recipient]').forEach(input => {
        input.checked = false;
    });
    v37HandleMissingEmailRecipientChange();
}

function v37BuildMissingEmailDraft(group, recipients) {
    if (!currentItem) return null;

    const selectedRecipients = v40NormalizeRecipientList(recipients);
    if (!selectedRecipients.length) return null;

    const fields = v2GetExportEquipmentFields(currentItem.barcode, currentItem);
    const reportedAt = new Date();
    const equipmentCode = fields.code || currentItem.barcode || "N/A";
    const equipmentName = fields.name || currentItem.name || "N/A";
    const registeredLocation = fields.location || currentItem.loc || "N/A";
    const config = window.GRID_MISSING_EMAIL_CONFIG || {};
    const ccRecipients = Array.isArray(config.ccRecipients)
        ? config.ccRecipients.map(value => String(value || "").trim().toLowerCase()).filter(Boolean)
        : [];
    const subject = `Missing Equipment Notification - ${equipmentCode}`;
    const body = [
        "Dear Production Team,",
        "",
        "Good day.",
        "",
        "During the inventory check, the following equipment could not be located at its registered location:",
        "",
        `Equipment Name: ${equipmentName}`,
        `Equipment Code: ${equipmentCode}`,
        `Registered Location: ${registeredLocation}`,
        "",
        "Kindly assist in checking the equipment's current location and inform the Calibration once confirmed.",
        "",
        "Thank you for your kind cooperation."
    ].join("\n");

    return {
        group,
        recipients: selectedRecipients,
        recipient: selectedRecipients.join("; "),
        ccRecipients,
        subject,
        body,
        preparedAt: reportedAt.toISOString(),
        method: "OUTLOOK_WEB_DRAFT"
    };
}

function v37UpdateMissingEmailPreview() {
    const group = v2El("missingEmailGroupSelect")?.value || "";
    const recipients = v40GetSelectedMissingEmailRecipients();
    const draft = group && recipients.length ? v37BuildMissingEmailDraft(group, recipients) : null;
    const to = v2El("missingEmailToPreview");
    const cc = v2El("missingEmailCcPreview");
    const subject = v2El("missingEmailSubjectPreview");
    const body = v2El("missingEmailBodyPreview");
    const confirm = v2El("confirmMissingEmailButton");
    const countText = v2El("missingEmailRecipientCount");
    const available = Array.isArray(v37EmailDirectory()[group]) ? v37EmailDirectory()[group].length : 0;

    if (to) to.value = draft?.recipients?.join("; ") || "";
    if (cc) cc.value = draft?.ccRecipients?.join("; ") || "";
    if (subject) subject.value = draft?.subject || "";
    if (body) body.value = draft?.body || "";
    if (countText && available) {
        countText.textContent = `${available} unhighlighted recipient${available === 1 ? "" : "s"} available for ${group}. ${recipients.length} selected.`;
    }
    if (confirm) {
        confirm.disabled = !draft || v37MissingEmailSending;
        confirm.textContent = v37MissingEmailSending
            ? "Saving missing record..."
            : `Save Missing & Open Email${recipients.length > 1 ? ` (${recipients.length})` : ""}`;
    }
}

function v37HandleMissingEmailGroupChange() {
    v37PopulateMissingEmailRecipients([]);
}

function v37HandleMissingEmailRecipientChange() {
    v37UpdateMissingEmailPreview();
}

function v37SetMissingEmailSummary() {
    if (!currentItem) return;
    const fields = v2GetExportEquipmentFields(currentItem.barcode, currentItem);
    v2SetText("missingEmailEquipmentCode", fields.code || currentItem.barcode || "-");
    v2SetText("missingEmailEquipmentName", fields.name || currentItem.name || "-");
    v2SetText("missingEmailProduction", fields.production || "N/A");
    v2SetText("missingEmailLocation", fields.location || currentItem.loc || "N/A");
}

function v37OpenMissingEmailModal() {
    const modal = v2El("missingEmailModal");
    if (!modal || !currentItem) return false;

    const groups = v37EmailGroupOrder();
    if (!groups.length) {
        showToast("No unhighlighted production email recipients are configured.", "error", 5200);
        return false;
    }

    v37SetMissingEmailSummary();
    const preferredGroup = String(currentAuditEditRecord?.missingEmailGroup || "").trim().toUpperCase();
    const preferredRecipients = v40NormalizeRecipientList(
        currentAuditEditRecord?.missingEmailRecipients || currentAuditEditRecord?.missingEmailRecipient || ""
    );
    v37PopulateMissingEmailGroups(preferredGroup);
    v37PopulateMissingEmailRecipients(preferredRecipients);

    modal.hidden = false;
    modal.style.display = "";
    modal.classList.add("is-open");
    window.setTimeout(() => {
        const groupSelect = v2El("missingEmailGroupSelect");
        const firstRecipient = v2El("missingEmailRecipientList")?.querySelector('input[type="checkbox"][data-missing-email-recipient]');
        (groupSelect?.value ? firstRecipient : groupSelect)?.focus();
    }, 50);
    return true;
}

function v37HideMissingEmailModal() {
    const modal = v2El("missingEmailModal");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.style.display = "";
    modal.hidden = true;
}

function closeMissingEmailModal() {
    if (v37MissingEmailSending) return;
    v37HideMissingEmailModal();

    if (v37MissingSelectionSnapshot) {
        selectedLoc = v37MissingSelectionSnapshot.selectedLoc;
        selectedStickerLoc = v37MissingSelectionSnapshot.selectedStickerLoc;
        selectedDue = v37MissingSelectionSnapshot.selectedDue;
        selectedMsa = v37MissingSelectionSnapshot.selectedMsa;
        v2MissingMode = v37MissingSelectionSnapshot.v2MissingMode;
    } else {
        v2MissingMode = false;
        v2ResetNormalVerification();
    }

    v37MissingSelectionSnapshot = null;
    v2ApplyToggleClasses();
    updateVerificationState();
    v2El("btnMissingEquipment")?.focus();
}

function v37OpenComposePlaceholder() {
    let popup = null;
    try {
        popup = window.open("about:blank", "gridMissingEquipmentEmail");
        if (popup) {
            popup.document.title = "GRID missing-equipment email";
            popup.document.body.innerHTML = '<div style="font-family:Arial,sans-serif;padding:28px;color:#4e342e"><h2>GRID</h2><p>Saving the missing-equipment record and preparing the email...</p></div>';
        }
    } catch (error) {
        popup = null;
    }
    return popup;
}

function v37OutlookComposeUrl(draft) {
    const config = window.GRID_MISSING_EMAIL_CONFIG || {};
    const base = config.outlookComposeUrl || "https://outlook.office.com/mail/deeplink/compose";
    const to = Array.isArray(draft.recipients) ? draft.recipients.join(";") : String(draft.recipient || "");
    const cc = Array.isArray(draft.ccRecipients) ? draft.ccRecipients.join(";") : "";
    const params = [
        `to=${encodeURIComponent(to)}`,
        `cc=${encodeURIComponent(cc)}`,
        `subject=${encodeURIComponent(draft.subject || "")}`,
        `body=${encodeURIComponent(draft.body || "")}`
    ].join("&");
    return `${base}?${params}`;
}

function v37MailtoUrl(draft) {
    const recipients = Array.isArray(draft.recipients) ? draft.recipients : v40NormalizeRecipientList(draft.recipient);
    const to = recipients.map(email => encodeURIComponent(email)).join(",");
    const cc = Array.isArray(draft.ccRecipients) ? draft.ccRecipients.join(",") : "";
    return `mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
}

function v37OpenPreparedEmail(draft, popup) {
    const config = window.GRID_MISSING_EMAIL_CONFIG || {};
    const useOutlookWeb = String(config.composeMode || "outlook-web").toLowerCase() !== "mailto";

    try {
        if (useOutlookWeb && popup && !popup.closed) {
            popup.location.replace(v37OutlookComposeUrl(draft));
            return true;
        }

        if (popup && !popup.closed) popup.close();
        const link = document.createElement("a");
        link.href = v37MailtoUrl(draft);
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        return true;
    } catch (error) {
        console.warn("Unable to open the prepared email", error);
        try {
            if (popup && !popup.closed) popup.close();
        } catch (closeError) {
            // Ignore popup close failures.
        }
        return false;
    }
}

async function v37UpdateMissingEmailStatus(auditData, status, extra = {}) {
    if (!auditData) return;
    const patch = {
        missingEmailStatus: status,
        ...extra
    };
    Object.assign(auditData, patch);

    try {
        if (isOnline && auditData.cloudId) {
            await db.ref(`audit_history/${auditData.cloudId}`).update(patch);
        } else if (typeof updateLocalAuditRecord === "function") {
            updateLocalAuditRecord(auditData);
        }
    } catch (error) {
        console.warn("Unable to update missing email status", error);
    }
}

async function v37SendMissingEmailWebhook(draft, auditData) {
    const webhookUrl = String(window.GRID_MISSING_EMAIL_CONFIG?.webhookUrl || "").trim();
    if (!webhookUrl) return false;

    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            event: "MISSING_EQUIPMENT",
            recipient: draft.recipient,
            recipients: draft.recipients || v40NormalizeRecipientList(draft.recipient),
            ccRecipients: draft.ccRecipients || [],
            group: draft.group,
            subject: draft.subject,
            body: draft.body,
            audit: auditData
        })
    });

    if (!response.ok) throw new Error(`Email service returned HTTP ${response.status}.`);
    return true;
}

async function confirmMissingEmailAndSave() {
    if (!currentItem || v2IsSubmitting || v37MissingEmailSending) return;

    const group = v2El("missingEmailGroupSelect")?.value || "";
    const recipients = v40GetSelectedMissingEmailRecipients();
    const allowedRecipients = Array.isArray(v37EmailDirectory()[group])
        ? v37EmailDirectory()[group].map(email => String(email || "").trim().toLowerCase())
        : [];
    const invalidRecipients = recipients.filter(recipient => !allowedRecipients.includes(recipient));

    if (!group || !recipients.length || invalidRecipients.length) {
        showToast("Select one or more unhighlighted recipients from the correct production email group.", "warning", 4800);
        v2Feedback("fail");
        return;
    }

    const draft = v37BuildMissingEmailDraft(group, recipients);
    if (!draft) return;

    const webhookUrl = String(window.GRID_MISSING_EMAIL_CONFIG?.webhookUrl || "").trim();
    const popup = webhookUrl ? null : v37OpenComposePlaceholder();
    v37RememberPreferredRecipient(group, recipients);
    v37MissingEmailSending = true;
    v37UpdateMissingEmailPreview();

    const emailMetadata = {
        group: draft.group,
        recipient: draft.recipient,
        recipients: draft.recipients || [],
        ccRecipients: draft.ccRecipients || [],
        subject: draft.subject,
        method: webhookUrl ? "WEBHOOK" : draft.method,
        status: webhookUrl ? "SEND REQUESTED" : "DRAFT PREPARED",
        preparedAt: draft.preparedAt
    };

    try {
        const auditData = await v2SaveAuditRecord({ isMissing: true, missingEmail: emailMetadata });
        if (!auditData) {
            if (popup && !popup.closed) popup.close();
            return;
        }

        v37MissingSelectionSnapshot = null;
        const recipientLabel = `${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`;

        if (webhookUrl && isOnline) {
            try {
                await v37SendMissingEmailWebhook(draft, auditData);
                await v37UpdateMissingEmailStatus(auditData, "SENT", {
                    missingEmailSentAt: new Date().toISOString()
                });
                showToast(`Missing-equipment email sent to ${recipientLabel}.`, "success", 5200);
            } catch (error) {
                await v37UpdateMissingEmailStatus(auditData, "SEND FAILED", {
                    missingEmailError: String(error.message || error).slice(0, 300)
                });
                showToast(`Missing record saved, but the email service failed: ${error.message || "Unknown error"}`, "error", 6500);
            }
        } else {
            const opened = v37OpenPreparedEmail(draft, popup);
            await v37UpdateMissingEmailStatus(auditData, opened ? "DRAFT OPENED" : "DRAFT OPEN FAILED", {
                missingEmailOpenedAt: opened ? new Date().toISOString() : ""
            });
            showToast(
                opened
                    ? `Missing record saved. Email draft opened for ${recipientLabel}; review it and press Send.`
                    : `Missing record saved, but the email draft could not be opened for ${recipientLabel}.`,
                opened ? "success" : "warning",
                6500
            );
        }
    } finally {
        v37MissingEmailSending = false;
        v37UpdateMissingEmailPreview();
    }
}

async function v2SaveAuditRecord({ isMissing = false, missingEmail = null } = {}) {
    if (!currentItem || v2IsSubmitting) return;

    v2IsSubmitting = true;
    v2MissingMode = isMissing;
    updateVerificationState();

    const remarkInput = v2El("qcRemark");
    const locationInput = v2El("qcLocationInput");
    const dueInput = v2El("qcDueInput");
    const statusInput = v2El("qcStatusInput");
    const remarkValue = remarkInput?.value.trim() || "";
    const editedLocation = isMissing ? currentItem.loc : (locationInput?.value.trim() || currentItem.loc);
    const editedDue = isMissing ? currentItem.due : (dueInput?.value.trim() || currentItem.due);
    const editedStatus = isMissing ? currentItem.status : (statusInput?.value.trim() || currentItem.status);
    const isEditMode = Boolean(currentAuditEditRecord);
    const existingRecord = currentAuditEditRecord || {};

    try {
        const masterUpdateResult = await overwriteMasterFieldsIfChanged(editedLocation, editedDue, editedStatus);

        if (masterUpdateResult === null) {
            v2IsSubmitting = false;
            updateVerificationState();
            return;
        }

        const masterLocationUpdated = Boolean(masterUpdateResult.locationUpdated);
        const masterDueUpdated = Boolean(masterUpdateResult.dueUpdated);
        const masterStatusUpdated = Boolean(masterUpdateResult.statusUpdated);
        const savedMasterLocationUpdated = Boolean(existingRecord.masterLocationUpdated || masterLocationUpdated);
        const savedMasterDueUpdated = Boolean(existingRecord.masterDueUpdated || masterDueUpdated);
        const savedMasterStatusUpdated = Boolean(existingRecord.masterStatusUpdated || masterStatusUpdated);

        if (!isMissing && masterLocationUpdated) selectedLoc = "WRONG";

        const automaticRemarks = [];
        if (savedMasterLocationUpdated) automaticRemarks.push("Location overwritten in master database");
        if (savedMasterDueUpdated) automaticRemarks.push("Due date overwritten in master database");
        if (savedMasterStatusUpdated) automaticRemarks.push("Equipment status overwritten in master database");

        const abnormalSuggestion = isMissing ? "" : v2BuildRemarkSuggestion();
        const generatedRemarks = [abnormalSuggestion, ...automaticRemarks].filter(Boolean);
        const finalRemark = isMissing
            ? v2FormatMissingRemark(remarkValue)
            : remarkValue || generatedRemarks.join("; ") || "-";
        const msaFailed = !isMissing && v2MsaRequired(currentItem.msa) && selectedMsa !== "YES";

        const abnormal = !isMissing && (
            selectedLoc === "WRONG" ||
            selectedStickerLoc === "WRONG" ||
            selectedDue !== "VALID" ||
            msaFailed ||
            currentItem.isUnregistered ||
            savedMasterLocationUpdated ||
            savedMasterDueUpdated ||
            savedMasterStatusUpdated
        );

        const now = new Date();
        const dateTimeString = now.toLocaleDateString("en-GB") + " " + now.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });

        const auditData = {
            id: isEditMode ? (existingRecord.id || Date.now()) : Date.now(),
            time: isEditMode ? (existingRecord.time || dateTimeString) : dateTimeString,
            barcode: isEditMode ? (existingRecord.barcode || currentItem.barcode) : currentItem.barcode,
            name: currentItem.name,
            pic: isEditMode ? (existingRecord.pic || loggedInUser) : loggedInUser,
            locRes: isMissing ? "MISSING" : selectedLoc,
            stickerLocRes: isMissing ? "N/A" : selectedStickerLoc,
            dueRes: isMissing ? "N/A" : selectedDue,
            msaRes: isMissing ? "N/A" : selectedMsa,
            updatedLocation: currentItem.loc,
            updatedDue: currentItem.due,
            updatedStatus: currentItem.status,
            masterLocationUpdated: savedMasterLocationUpdated,
            masterDueUpdated: savedMasterDueUpdated,
            masterStatusUpdated: savedMasterStatusUpdated,
            remark: finalRemark,
            isFail: abnormal,
            isMissing,
            auditStatus: isMissing ? "MISSING" : abnormal ? "ABNORMAL" : "PASS",
            isUnregistered: currentItem.isUnregistered,
            ...(isMissing && missingEmail ? {
                missingEmailGroup: missingEmail.group || "",
                missingEmailRecipient: missingEmail.recipient || "",
                missingEmailRecipients: Array.isArray(missingEmail.recipients)
                    ? missingEmail.recipients.join("; ")
                    : (missingEmail.recipient || ""),
                missingEmailRecipientCount: Array.isArray(missingEmail.recipients)
                    ? missingEmail.recipients.length
                    : v40NormalizeRecipientList(missingEmail.recipient).length,
                missingEmailCc: Array.isArray(missingEmail.ccRecipients) ? missingEmail.ccRecipients.join("; ") : "",
                missingEmailSubject: missingEmail.subject || "",
                missingEmailMethod: missingEmail.method || "OUTLOOK_WEB_DRAFT",
                missingEmailStatus: missingEmail.status || "DRAFT PREPARED",
                missingEmailPreparedAt: missingEmail.preparedAt || new Date().toISOString()
            } : {})
        };

        const resultText = isMissing ? "missing" : abnormal ? "abnormal" : "pass";
        const resultToastType = isMissing || abnormal ? "warning" : "success";
        const feedbackType = isMissing ? "info" : abnormal ? "fail" : "pass";

        if (isEditMode) {
            if (existingRecord.cloudId) auditData.cloudId = existingRecord.cloudId;
            auditData.editedBy = loggedInUser;
            auditData.editedAt = dateTimeString;
            await saveEditedAuditRecord(auditData);
            v2SetLastScan(auditData.barcode, `Updated - ${resultText}`);
            showToast(isMissing ? "Equipment remains marked as missing." : "Audit record updated.", resultToastType);
        } else if (isOnline) {
            const newRef = db.ref("audit_history").push();
            auditData.cloudId = newRef.key;
            await newRef.set(auditData);
            v2SetLastScan(auditData.barcode, `Saved - ${resultText}`);
            showToast(isMissing ? "Equipment marked as missing." : abnormal ? "Abnormal audit record saved." : "Audit record saved.", resultToastType);
        } else {
            pendingUploads.push(auditData);
            localStorage.setItem("pending_queue", JSON.stringify(pendingUploads));
            scanHistory.unshift(auditData);
            v2UpdatePendingBadge();
            updateDisplay();
            v2SetLastScan(auditData.barcode, `Queued - ${resultText}`);
            showToast(isMissing ? "Offline: missing record queued for synchronization." : "Offline: audit record queued for synchronization.", "warning");
        }

        v2Feedback(feedbackType);
        closeModal();
        return auditData;
    } catch (error) {
        console.error("Unable to save audit record", error);
        showToast(`Unable to save the record: ${error.message || "Unknown error"}`, "error", 5200);
        v2Feedback("fail");
        v2IsSubmitting = false;
        updateVerificationState();
    }
}

async function submitQC() {
    if (!currentItem || v2IsSubmitting) return;

    const { isComplete } = v2NormalVerificationState();
    if (!isComplete) {
        showToast("Complete all four verification checks, or use Mark Missing & Notify.", "warning");
        v2Feedback("fail");
        return;
    }

    v2MissingMode = false;
    await v2SaveAuditRecord({ isMissing: false });
}

async function submitMissingEquipment() {
    if (!currentItem || v2IsSubmitting || v37MissingEmailSending) return;

    if (currentItem.isUnregistered) {
        showToast("Only registered equipment can be marked missing.", "warning");
        v2Feedback("fail");
        return;
    }

    v37MissingSelectionSnapshot = {
        selectedLoc,
        selectedStickerLoc,
        selectedDue,
        selectedMsa,
        v2MissingMode
    };
    v2MissingMode = true;
    selectedLoc = "MISSING";
    selectedStickerLoc = "N/A";
    selectedDue = "N/A";
    selectedMsa = "N/A";
    v2ApplyToggleClasses();
    updateVerificationState();

    if (!v37OpenMissingEmailModal()) {
        closeMissingEmailModal();
    }
}

function closeModal() {
    const barcode = currentItem?.barcode || "";
    v37HideMissingEmailModal();
    v37MissingSelectionSnapshot = null;
    v37MissingEmailSending = false;

    if (currentItem && currentLockOwned) {
        releaseLock(currentItem.barcode);
    }

    const modal = v2El("qcModal");
    if (modal) {
        modal.classList.remove("is-open");
        modal.style.display = "";
        modal.hidden = true;
    }

    const remarkInput = v2El("qcRemark");
    if (remarkInput) remarkInput.value = "";

    currentItem = null;
    currentAuditEditId = null;
    currentAuditEditRecord = null;
    currentLockOwned = false;
    selectedLoc = null;
    selectedStickerLoc = null;
    selectedDue = null;
    selectedMsa = null;
    v2DueSuggestion = null;
    v2RemarkSuggestion = "";
    v2IsSubmitting = false;
    v2MissingMode = false;
    setModalMode(false);
    updateDisplay();

    if (v2ResumeCameraAfterModal && html5QrCode && v2CameraPaused) {
        window.setTimeout(() => {
            try {
                html5QrCode.resume();
                v2CameraPaused = false;
                v2ResumeCameraAfterModal = false;
                v2SetScannerStatus("Camera scanning", "active");
            } catch (error) {
                v2CameraPaused = false;
                v2ResumeCameraAfterModal = false;
                v2SetScannerStatus("Scanner ready", "ready");
                v2FocusScannerCollector();
            }
        }, 160);
    } else {
        v2ResumeCameraAfterModal = false;
        if (html5QrCode) {
            v2SetScannerStatus("Camera scanning", "active");
        } else {
            v2SetScannerStatus(barcode ? "Scanner ready for next item" : "Scanner ready", "ready");
            v2FocusScannerCollector();
        }
    }
}

async function handleScannedCode(barcode) {
    if (!barcode || v2ProcessingCode) return;

    const cleanCode = String(barcode).trim().replace(/[\r\n]/g, "");
    if (!cleanCode) return;

    const lookupCode = cleanCode.toUpperCase();
    v2ProcessingCode = true;
    v2SetLastScan(cleanCode, "Processing...");
    v2SetScannerStatus(`Processing ${cleanCode}`, "busy");

    try {
        currentAuditEditId = null;
        currentAuditEditRecord = null;
        currentLockOwned = false;

        const existing = scanHistory.find(record => {
            return String(record.barcode || "").toUpperCase() === lookupCode;
        });

        if (existing) {
            v2SetText("prevPIC", existing.pic || "-");
            v2SetText("prevTime", existing.time || "-");

            const banner = v2El("alertBanner");
            if (banner) {
                banner.classList.add("show");
                window.setTimeout(() => banner.classList.remove("show"), 3600);
            }

            v2SetLastScan(cleanCode, "Duplicate - existing record opened");
            v2Feedback("duplicate");
            showToast("Duplicate detected. Existing record opened for review.", "warning");
            await openAuditDetail(v2SafeActionValue(existing.cloudId || existing.id || existing.barcode || ""));
            return;
        }

        if (isOnline) {
            let lockKey = "";
            try {
                lockKey = btoa(cleanCode).replace(/=/g, "");
            } catch (error) {
                lockKey = "";
            }

            const lock = lockKey ? activeLocks[lockKey] : null;

            if (lock && lock.user !== loggedInUser) {
                v2SetLastScan(cleanCode, `Locked by ${lock.user}`);
                showToast(`${lock.user} is currently auditing this equipment.`, "warning");
                v2Feedback("duplicate");
                return;
            }

            try {
                const lockResult = await attemptLock(cleanCode);
                if (lockResult && lockResult.committed === false) {
                    v2SetLastScan(cleanCode, "Locked by another auditor");
                    showToast("This item is currently being audited by another user.", "warning");
                    v2Feedback("duplicate");
                    return;
                }
                currentLockOwned = true;
            } catch (error) {
                console.warn("Unable to create temporary lock", error);
            }
        }

        const isUrl = cleanCode.toLowerCase().startsWith("http");
        const masterInfo = masterDB[lookupCode];
        const data = masterInfo || {
            name: isUrl ? "EXTERNAL URL" : "UNREGISTERED",
            loc: "N/A",
            due: "N/A",
            status: "N/A",
            msa: "N/A"
        };

        currentItem = {
            barcode: cleanCode,
            ...data,
            isUnregistered: !masterInfo
        };

        v2SetLastScan(cleanCode, masterInfo ? "Registered - verify" : "Unregistered - verify");
        v2Feedback(masterInfo ? "info" : "fail");
        renderQCModal(null);
    } finally {
        v2ProcessingCode = false;

        if (v2ResumeCameraAfterModal && v2CameraPaused && html5QrCode && !v2IsModalOpen()) {
            window.setTimeout(() => {
                try {
                    html5QrCode.resume();
                    v2CameraPaused = false;
                    v2ResumeCameraAfterModal = false;
                    v2SetScannerStatus("Camera scanning", "active");
                } catch (error) {
                    v2CameraPaused = false;
                    v2ResumeCameraAfterModal = false;
                    v2SetScannerStatus("Scanner ready", "ready");
                }
            }, 120);
        }
    }
}

function startPendingAudit(encodedCode) {
    const code = decodeActionValue(encodedCode);
    v2CurrentScanSource = "pending-list";
    handleScannedCode(code);
}

/* -------------------------------------------------------------------------- */
/* Camera workflow                                                             */
/* -------------------------------------------------------------------------- */

async function v2PopulateCameraOptions() {
    const select = v2El("cameraSelect");
    if (!select || !window.Html5Qrcode?.getCameras) return [];

    const existingValue = select.value;
    const cameras = await Html5Qrcode.getCameras();
    select.innerHTML = '<option value="">Rear camera (auto)</option>';

    cameras.forEach((camera, index) => {
        const option = document.createElement("option");
        option.value = camera.id;
        option.textContent = camera.label || `Camera ${index + 1}`;
        option.selected = camera.id === existingValue;
        select.appendChild(option);
    });

    return cameras;
}

function v2PreferredCameraId(cameras) {
    const selected = v2El("cameraSelect")?.value || "";
    if (selected) return selected;

    const preferred = cameras.find(camera => /back|rear|environment/i.test(camera.label || ""));
    return preferred?.id || "";
}

async function v2StopCamera(showReadyStatus = true) {
    const scanner = html5QrCode;
    html5QrCode = null;

    if (scanner) {
        try {
            await scanner.stop();
        } catch (error) {
            // Scanner may already be stopped or paused.
        }

        try {
            scanner.clear();
        } catch (error) {
            // Clearing is optional.
        }
    }

    v2CameraPaused = false;
    v2ResumeCameraAfterModal = false;
    v2TorchOn = false;

    const reader = v2El("reader");
    const cameraButton = v2El("cameraToggleButton");
    const torchButton = v2El("torchButton");

    if (reader) reader.style.display = "none";
    if (cameraButton) cameraButton.textContent = "Start Camera";
    if (torchButton) {
        torchButton.disabled = true;
        torchButton.textContent = "Flashlight";
    }

    if (showReadyStatus) v2SetScannerStatus("Scanner ready", "ready");
    v2FocusScannerCollector();
}

async function v2OnCameraDecoded(decodedText) {
    const now = Date.now();
    const cleanText = String(decodedText || "").trim();

    if (!cleanText || v2IsModalOpen() || v2ProcessingCode) return;

    if (cleanText === v2LastDecodeText && now - v2LastDecodeTime < 2500) return;

    v2LastDecodeText = cleanText;
    v2LastDecodeTime = now;
    v2CurrentScanSource = "camera";

    const continuousMode = Boolean(v2El("continuousMode")?.checked);

    if (continuousMode && html5QrCode) {
        try {
            html5QrCode.pause(true);
            v2CameraPaused = true;
            v2ResumeCameraAfterModal = true;
        } catch (error) {
            v2CameraPaused = false;
            v2ResumeCameraAfterModal = false;
        }
    } else {
        await v2StopCamera(false);
    }

    handleScannedCode(cleanText);
}

async function toggleCamera() {
    if (v2CameraStarting) return;

    if (html5QrCode) {
        await v2StopCamera();
        showToast("Camera scanner stopped.", "info", 2200);
        return;
    }

    const reader = v2El("reader");
    const cameraButton = v2El("cameraToggleButton");
    const torchButton = v2El("torchButton");

    if (!reader || typeof Html5Qrcode === "undefined") {
        showToast("Camera scanner library is not available.", "error");
        return;
    }

    v2CameraStarting = true;
    reader.style.display = "block";
    if (cameraButton) {
        cameraButton.disabled = true;
        cameraButton.textContent = "Starting...";
    }
    v2SetScannerStatus("Starting camera", "busy");

    try {
        const cameras = await v2PopulateCameraOptions();
        const preferredId = v2PreferredCameraId(cameras);
        const cameraSource = preferredId ? { deviceId: { exact: preferredId } } : { facingMode: "environment" };
        const scanWidth = Math.min(320, Math.max(220, window.innerWidth - 70));

        html5QrCode = new Html5Qrcode("reader");

        await html5QrCode.start(
            cameraSource,
            {
                fps: 15,
                qrbox: { width: scanWidth, height: Math.round(scanWidth * 0.62) },
                aspectRatio: 1.333,
                disableFlip: false
            },
            decodedText => {
                v2OnCameraDecoded(decodedText).catch(error => {
                    console.error("Camera decode handling failed", error);
                });
            },
            () => {
                // Frame-level decode failures are expected and intentionally ignored.
            }
        );

        if (cameraButton) {
            cameraButton.disabled = false;
            cameraButton.textContent = "Stop Camera";
        }

        if (torchButton) torchButton.disabled = false;
        v2SetScannerStatus("Camera scanning", "active");
        showToast("Camera scanner started.", "success", 2200);
    } catch (error) {
        console.error("Camera start failed", error);
        html5QrCode = null;
        reader.style.display = "none";
        if (cameraButton) {
            cameraButton.disabled = false;
            cameraButton.textContent = "Start Camera";
        }
        if (torchButton) torchButton.disabled = true;
        v2SetScannerStatus("Camera unavailable", "error");
        showToast("Unable to start the camera. Check browser permission and camera availability.", "error", 5200);
        v2Feedback("fail");
    } finally {
        v2CameraStarting = false;
    }
}

async function toggleTorch() {
    if (!html5QrCode) {
        showToast("Start the camera before using the flashlight.", "warning");
        return;
    }

    const nextState = !v2TorchOn;

    try {
        await html5QrCode.applyVideoConstraints({
            advanced: [{ torch: nextState }]
        });
        v2TorchOn = nextState;
        v2SetText("torchButton", nextState ? "Flashlight On" : "Flashlight");
    } catch (error) {
        showToast("Flashlight control is not supported by this camera or browser.", "warning");
    }
}

/* -------------------------------------------------------------------------- */
/* Master import preview                                                       */
/* -------------------------------------------------------------------------- */

function v2MonthFromToken(token) {
    const normalized = String(token || "").trim().toUpperCase();
    const numeric = Number(normalized);

    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) {
        return MONTH_ORDER[numeric - 1];
    }

    const shortName = normalized.slice(0, 3);
    return MONTH_ORDER.includes(shortName) ? shortName : null;
}

function v2NormalizeImportDue(rawValue) {
    if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
        const month = MONTH_ORDER[rawValue.getMonth()];
        const year = String(rawValue.getFullYear());
        return { valid: true, due: `${month}-${year.slice(-2)}`, month, year };
    }

    if (typeof rawValue === "number" && Number.isFinite(rawValue) && window.XLSX?.SSF?.parse_date_code) {
        const parsed = XLSX.SSF.parse_date_code(rawValue);
        if (parsed) {
            const month = MONTH_ORDER[parsed.m - 1];
            const year = String(parsed.y);
            return { valid: true, due: `${month}-${year.slice(-2)}`, month, year };
        }
    }

    const originalValue = String(rawValue ?? "").trim();
    const value = originalValue
        .normalize("NFKC")
        .replace(/[\u2010-\u2015\u2212]/g, "-")
        .replace(/[\u00A0\u202F]/g, " ")
        .trim()
        .toUpperCase();

    if (!value || value === "N/A" || value === "NA") {
        return { valid: false, due: "N/A", month: "N/A", year: "N/A", reason: "Missing due date" };
    }

    const normalized = value
        .replace(/[.'’`]/g, "-")
        .replace(/[,\s/_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    const tokens = normalized.split("-").filter(Boolean);

    const yearFromToken = token => {
        const text = String(token || "").trim();
        if (/^\d{2}$/.test(text)) return `20${text}`;
        if (/^\d{4}$/.test(text)) {
            const yearNumber = Number(text);
            return yearNumber >= 1900 && yearNumber <= 2200 ? text : null;
        }
        return null;
    };
    const result = (month, year) => ({
        valid: true,
        due: `${month}-${year.slice(-2)}`,
        month,
        year
    });

    if (tokens.length === 2) {
        const [first, second] = tokens;
        const firstMonth = v2MonthFromToken(first);
        const secondMonth = v2MonthFromToken(second);
        const firstYear = yearFromToken(first);
        const secondYear = yearFromToken(second);

        // The current master list uses YY-MMM (for example 22-Dec).
        if (firstYear && secondMonth) return result(secondMonth, firstYear);
        // Existing Firebase exports and older files may use MMM-YY (for example DEC-22).
        if (firstMonth && secondYear) return result(firstMonth, secondYear);
    }

    if (tokens.length >= 3) {
        const firstYear = yearFromToken(tokens[0]);
        const lastYear = yearFromToken(tokens[tokens.length - 1]);
        const firstMonth = v2MonthFromToken(tokens[0]);
        const middleMonth = v2MonthFromToken(tokens[1]);

        const startsWithFourDigitYear = /^\d{4}$/.test(tokens[0]);
        // YYYY-MM-DD, YYYY-MMM-DD, or YYYY/MM/DD.
        if (startsWithFourDigitYear && firstYear && middleMonth) return result(middleMonth, firstYear);
        // DD-MMM-YYYY or DD-MMM-YY. This must be checked before a two-digit
        // first token is treated as a year.
        if (lastYear && middleMonth) return result(middleMonth, lastYear);
        // MMM-DD-YYYY or MM-DD-YYYY.
        if (lastYear && firstMonth) return result(firstMonth, lastYear);
        // Less common YY-MMM-DD form.
        if (firstYear && middleMonth) return result(middleMonth, firstYear);
    }

    return {
        valid: false,
        due: "N/A",
        month: "N/A",
        year: "N/A",
        reason: `Unrecognized due date: ${originalValue || value}`
    };
}

function v2NormalizeCell(value) {
    if (value instanceof Date) return value;
    return String(value ?? "").trim();
}

function v2CreateISODate(yearValue, monthValue, dayValue) {
    const year = Number(yearValue);
    const month = Number(monthValue);
    const day = Number(dayValue);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return "";
    if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return "";

    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function v2NormalizeImportISODate(rawValue, referenceDate = "") {
    if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
        const local = new Date(rawValue.getTime() - rawValue.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
    }

    if (typeof rawValue === "number" && Number.isFinite(rawValue) && window.XLSX?.SSF?.parse_date_code) {
        const parsed = XLSX.SSF.parse_date_code(rawValue);
        if (parsed) return v2CreateISODate(parsed.y, parsed.m, parsed.d);
    }

    const value = String(rawValue ?? "").trim();
    if (!value) return "";

    let match = value.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
    if (match) return v2CreateISODate(match[1], match[2], match[3]);

    match = value.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
    if (match) return v2CreateISODate(match[3], match[2], match[1]);

    let year = 0;
    let month = 0;
    match = value.match(/^(\d{4})[-\/.\s]([A-Za-z]{3,9}|\d{1,2})$/);
    if (match) {
        year = Number(match[1]);
        month = v2MonthFromToken(match[2]) ? MONTH_ORDER.indexOf(v2MonthFromToken(match[2])) + 1 : 0;
    } else {
        match = value.match(/^([A-Za-z]{3,9}|\d{1,2})[-\/.\s](\d{2}|\d{4})$/);
        if (match) {
            const monthName = v2MonthFromToken(match[1]);
            month = monthName ? MONTH_ORDER.indexOf(monthName) + 1 : 0;
            year = Number(match[2].length === 2 ? `20${match[2]}` : match[2]);
        }
    }

    if (!year || !month) return "";
    const reference = v2NormalizeImportISODate(referenceDate);
    const preferredDay = reference ? Number(reference.slice(8, 10)) : 1;
    const lastDay = new Date(year, month, 0).getDate();
    return v2CreateISODate(year, month, Math.min(preferredDay, lastDay));
}

function v2AddMonthsISO(dateString, monthsValue) {
    const date = v2NormalizeImportISODate(dateString);
    const months = Number(monthsValue);
    if (!date || !Number.isInteger(months) || months < 1) return "";

    const [year, month, day] = date.split("-").map(Number);
    const targetStart = new Date(year, month - 1 + months, 1);
    const lastDay = new Date(targetStart.getFullYear(), targetStart.getMonth() + 1, 0).getDate();
    return v2CreateISODate(targetStart.getFullYear(), targetStart.getMonth() + 1, Math.min(day, lastDay));
}

function v2PositiveInteger(value, fallback = "") {
    const number = Number(String(value ?? "").trim());
    return Number.isInteger(number) && number > 0 ? number : fallback;
}

function v2NormalizeCalibrationDate(value) {
    if (typeof calNormalizeDateISO === "function") {
        const normalized = calNormalizeDateISO(value);
        if (normalized) return normalized;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
    }

    const text = String(value ?? "").trim();
    if (!text) return "";
    let match = text.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
    if (match) return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
    match = text.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
    if (match) return `${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
    return "";
}

function v2NormalizeExpiryDate(value, calibrationDate = "") {
    if (typeof calNormalizeMonthYearISO === "function") {
        const normalized = calNormalizeMonthYearISO(value, calibrationDate);
        if (normalized) return normalized;
    }
    return v2NormalizeImportISODate(value, calibrationDate);
}

function v2FindHeaderColumn(normalizedHeader, aliases) {
    for (const alias of aliases) {
        const index = normalizedHeader.indexOf(v2NormalizeFieldKey(alias));
        if (index >= 0) return index;
    }

    return -1;
}


function v2DelimiterScore(line, delimiter) {
    let score = 0;
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"') {
            if (inQuotes && line[index + 1] === '"') {
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (!inQuotes && character === delimiter) {
            score += 1;
        }
    }

    return score;
}

function v2DetectDelimitedSeparator(text) {
    const source = String(text ?? '').replace(/^\uFEFF/, '');
    const firstLines = source.split(/\r\n|\n|\r/)
        .filter(line => line.trim() !== '')
        .slice(0, 5);
    const candidates = [',', ';', '\t', '|'];
    let selected = ',';
    let highestScore = -1;

    candidates.forEach(candidate => {
        const score = firstLines.reduce((total, line) => total + v2DelimiterScore(line, candidate), 0);
        if (score > highestScore) {
            selected = candidate;
            highestScore = score;
        }
    });

    return highestScore > 0 ? selected : ',';
}

function v2ParseDelimitedText(text) {
    const source = String(text ?? '').replace(/^\uFEFF/, '');
    const delimiter = v2DetectDelimitedSeparator(source);
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    const commitRow = () => {
        row.push(field);
        if (row.some(value => String(value ?? '').trim() !== '')) rows.push(row);
        row = [];
        field = '';
    };

    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];

        if (character === '"') {
            if (inQuotes && source[index + 1] === '"') {
                field += '"';
                index += 1;
            } else if (inQuotes) {
                inQuotes = false;
            } else if (field === '') {
                inQuotes = true;
            } else {
                field += character;
            }
            continue;
        }

        if (!inQuotes && character === delimiter) {
            row.push(field);
            field = '';
            continue;
        }

        if (!inQuotes && (character === '\n' || character === '\r')) {
            if (character === '\r' && source[index + 1] === '\n') index += 1;
            commitRow();
            continue;
        }

        field += character;
    }

    if (field !== '' || row.length > 0) commitRow();
    return rows;
}

async function v2ReadMasterFileRows(file) {
    const extension = String(file?.name || '').split('.').pop().toLowerCase();

    if (extension === 'csv' || extension === 'txt') {
        const rows = v2ParseDelimitedText(await file.text());
        if (!rows.length) throw new Error('The selected file is empty.');
        return rows;
    }

    if (typeof XLSX === 'undefined') {
        throw new Error('The spreadsheet parser is unavailable. Use CSV or restore the SheetJS library.');
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, {
        type: 'array',
        cellDates: true,
        raw: true
    });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        raw: true,
        blankrows: false
    });

    if (!rows.length) throw new Error('The selected file is empty.');
    return rows;
}

async function loadMasterDataV36(input) {
    const file = input?.files?.[0];
    if (!file) return;

    v2SetScannerStatus("Validating master file", "busy");

    try {
        const rows = await v2ReadMasterFileRows(file);
        const sourceHeader = (Array.isArray(rows[0]) ? rows[0] : [])
            .map(value => String(value ?? "").trim());
        const normalizedHeader = sourceHeader.map(v2NormalizeFieldKey);
        const detectedIndexes = {
            code: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.code),
            issuedOn: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.issuedOn),
            issuerName: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.issuerName),
            issuerNo: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.issuerNo),
            name: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.name),
            serialNo: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.serialNo),
            className: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.className),
            maker: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.maker),
            modelNo: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.modelNo),
            status: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.status),
            functionName: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.functionName),
            areaUsed: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.areaUsed),
            location: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.location),
            building: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.building),
            production: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.production),
            processName: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.processName),
            stationLocation: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.stationLocation),
            section: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.section),
            msa: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.msa),
            calibratedBy: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.calibratedBy),
            calibrationCost: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.calibrationCost),
            frequencyMonths: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.frequencyMonths),
            calibrationDate: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.calibrationDate),
            intervalMonths: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.intervalMonths),
            nextVerificationDate: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.nextVerificationDate),
            calibrationMonth: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.calibrationMonth),
            calibrationYear: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.calibrationYear),
            due: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.due),
            calibrationTemplateType: v2FindHeaderColumn(normalizedHeader, V2_MASTER_FIELD_ALIASES.calibrationTemplateType)
        };
        const recognizedHeaderCount = Object.values(detectedIndexes)
            .filter(index => index >= 0).length;
        if (recognizedHeaderCount > 0 && detectedIndexes.code < 0) {
            throw new Error("EQUIPMENT CODE column was not found. Check the header row before importing.");
        }

        const usesMappedHeader = detectedIndexes.code >= 0;
        const indexes = usesMappedHeader
            ? detectedIndexes
            : {
                code: 0,
                issuedOn: -1,
                issuerName: -1,
                issuerNo: -1,
                name: 1,
                serialNo: -1,
                className: -1,
                maker: -1,
                modelNo: -1,
                status: 4,
                functionName: -1,
                areaUsed: -1,
                location: 2,
                building: -1,
                production: -1,
                processName: -1,
                stationLocation: -1,
                section: -1,
                msa: 5,
                calibratedBy: -1,
                calibrationCost: -1,
                frequencyMonths: -1,
                calibrationDate: -1,
                intervalMonths: -1,
                nextVerificationDate: -1,
                calibrationMonth: -1,
                calibrationYear: -1,
                due: 3,
                calibrationTemplateType: -1
            };
        const columnSync = V2_IMPORT_COLUMN_SYNC.map(definition => {
            const index = Number.isInteger(indexes[definition.key]) ? indexes[definition.key] : -1;
            return {
                ...definition,
                found: index >= 0,
                sourceHeader: index >= 0 ? sourceHeader[index] : "",
                sourceIndex: index
            };
        });
        const sourceHasDueColumn = indexes.due >= 0;
        const sourceHasExpiryColumn = indexes.nextVerificationDate >= 0;
        const valueAt = (row, index) => index >= 0 ? v2NormalizeCell(row[index]) : "";

        const issues = [];
        const newMasterDB = {};
        const newRawRows = [[
            "EQUIPMENT CODE",
            "ISSUED ON",
            "ISSUER NAME",
            "ISSUER NO",
            "EQUIPMENT NAME",
            "LOCATION",
            "DUE DATE",
            "STATUS",
            "MSA",
            "SERIAL NO",
            "EQUIPMENT CLASS",
            "MAKER",
            "MODEL",
            "FUNCTION",
            "AREA USED",
            "BUILDING",
            "PROD TYPE",
            "PROCESS NAME",
            "STATION LOCATION",
            "SECTION USE",
            "CALIBRATED BY",
            "CALIBRATION COST",
            "FREQUENCY",
            "CALIBRATION DATE",
            "DURATION",
            "EXPIRED DATE",
            "CALIBRATION MONTH",
            "CALIBRATION YEAR",
            "CALIBRATION TEMPLATE"
        ]];
        const previewRows = [];
        const seenCodes = new Set();
        let duplicateCount = 0;

        rows.slice(1).forEach((sourceRow, rowIndex) => {
            if (!Array.isArray(sourceRow)) return;

            const sourceLine = rowIndex + 2;
            const rowIsEmpty = sourceRow.every(value => String(value ?? "").trim() === "");
            if (rowIsEmpty) return;

            const code = String(valueAt(sourceRow, indexes.code) || "").trim().toUpperCase();
            const rawIssuedOn = valueAt(sourceRow, indexes.issuedOn);
            const issuerName = String(valueAt(sourceRow, indexes.issuerName) || "").trim();
            const issuerNo = String(valueAt(sourceRow, indexes.issuerNo) || "").trim();
            let name = String(valueAt(sourceRow, indexes.name) || "").trim();
            let location = String(valueAt(sourceRow, indexes.location) || "").trim();
            const serialNo = String(valueAt(sourceRow, indexes.serialNo) || "").trim();
            const className = String(valueAt(sourceRow, indexes.className) || "").trim();
            const maker = String(valueAt(sourceRow, indexes.maker) || "").trim();
            const modelNo = String(valueAt(sourceRow, indexes.modelNo) || "").trim();
            let status = String(valueAt(sourceRow, indexes.status) || "").trim();
            const functionName = String(valueAt(sourceRow, indexes.functionName) || "").trim();
            const areaUsed = String(valueAt(sourceRow, indexes.areaUsed) || "").trim();
            const sourceBuilding = String(valueAt(sourceRow, indexes.building) || "").trim();
            const sourceProduction = String(valueAt(sourceRow, indexes.production) || "").trim();
            const processName = String(valueAt(sourceRow, indexes.processName) || "").trim();
            const stationLocation = String(valueAt(sourceRow, indexes.stationLocation) || "").trim();
            const section = String(valueAt(sourceRow, indexes.section) || "").trim();
            let msa = String(valueAt(sourceRow, indexes.msa) || "").trim();
            const calibratedBy = String(valueAt(sourceRow, indexes.calibratedBy) || "").trim();
            const rawCalibrationCost = valueAt(sourceRow, indexes.calibrationCost);
            const rawFrequency = valueAt(sourceRow, indexes.frequencyMonths);
            const rawCalibrationDate = valueAt(sourceRow, indexes.calibrationDate);
            const rawInterval = valueAt(sourceRow, indexes.intervalMonths);
            const rawExpiry = valueAt(sourceRow, indexes.nextVerificationDate);
            const rawCalibrationMonth = String(valueAt(sourceRow, indexes.calibrationMonth) || "").trim();
            const rawCalibrationYear = String(valueAt(sourceRow, indexes.calibrationYear) || "").trim();
            const rawDue = valueAt(sourceRow, indexes.due);
            const calibrationTemplateType = String(valueAt(sourceRow, indexes.calibrationTemplateType) || "").trim();

            if (!code) {
                issues.push({ row: sourceLine, type: "Error", message: "Missing equipment code; row rejected." });
                return;
            }

            if (seenCodes.has(code)) {
                duplicateCount += 1;
                issues.push({ row: sourceLine, type: "Error", message: `Duplicate equipment code ${code}; row rejected.` });
                return;
            }
            seenCodes.add(code);

            if (!name) {
                name = "UNKNOWN";
                issues.push({ row: sourceLine, type: "Warning", message: `${code}: missing equipment name; set to UNKNOWN.` });
            }

            if (!location) {
                location = "N/A";
                issues.push({ row: sourceLine, type: "Warning", message: `${code}: missing location; set to N/A.` });
            }

            if (!status) status = "N/A";
            if (!msa) msa = "N/A";

            const issuedOn = v2NormalizeCalibrationDate(rawIssuedOn);
            if (String(rawIssuedOn ?? "").trim() && !issuedOn) {
                issues.push({ row: sourceLine, type: "Warning", message: `${code}: invalid Issued On date; value was not imported.` });
            }

            const calibrationDate = v2NormalizeCalibrationDate(rawCalibrationDate);
            if (String(rawCalibrationDate ?? "").trim() && !calibrationDate) {
                issues.push({ row: sourceLine, type: "Warning", message: `${code}: invalid Calibration Date; value was not imported.` });
            }

            const intervalNumber = Number(rawInterval);
            const intervalMonths = String(rawInterval ?? "").trim() === ""
                ? ""
                : (Number.isInteger(intervalNumber) && intervalNumber >= 1 && intervalNumber <= 120 ? intervalNumber : "");
            if (String(rawInterval ?? "").trim() && intervalMonths === "") {
                issues.push({ row: sourceLine, type: "Warning", message: `${code}: Duration must be 1-120 whole months; value was not imported.` });
            }

            const frequencyNumber = Number(rawFrequency);
            const frequencyMonths = String(rawFrequency ?? "").trim() === ""
                ? (intervalMonths || "")
                : (Number.isInteger(frequencyNumber) && frequencyNumber >= 1 && frequencyNumber <= 120 ? frequencyNumber : "");
            if (String(rawFrequency ?? "").trim() && frequencyMonths === "") {
                issues.push({ row: sourceLine, type: "Warning", message: `${code}: Frequency must be 1-120 whole months; value was not imported.` });
            }

            const costText = String(rawCalibrationCost ?? "").trim();
            const costNumber = Number(rawCalibrationCost);
            const calibrationCost = costText === ""
                ? ""
                : (Number.isFinite(costNumber) && costNumber >= 0 ? costNumber : "");
            if (costText && calibrationCost === "") {
                issues.push({ row: sourceLine, type: "Warning", message: `${code}: Calibration Cost must be zero or a positive number; value was not imported.` });
            }

            let nextVerificationDate = v2NormalizeExpiryDate(rawExpiry, calibrationDate);
            if (!nextVerificationDate && calibrationDate && intervalMonths) {
                nextVerificationDate = typeof calAddMonthsISO === "function"
                    ? calAddMonthsISO(calibrationDate, intervalMonths)
                    : v2AddMonthsISO(calibrationDate, intervalMonths);
            }
            if (String(rawExpiry ?? "").trim() && !nextVerificationDate) {
                issues.push({ row: sourceLine, type: "Warning", message: `${code}: invalid Expired Date; value was not imported.` });
            }

            let due;
            if (sourceHasDueColumn) {
                due = v2NormalizeImportDue(rawDue);
            } else if (sourceHasExpiryColumn && (nextVerificationDate || String(rawExpiry ?? "").trim())) {
                due = v2NormalizeImportDue(nextVerificationDate || rawExpiry);
            } else {
                due = { valid: true, due: "N/A", month: "N/A", year: "N/A" };
            }
            if ((sourceHasDueColumn || sourceHasExpiryColumn) && !due.valid) {
                issues.push({ row: sourceLine, type: "Warning", message: `${code}: ${due.reason}; set to N/A.` });
            }

            const locationParts = parseLocationParts(location);
            const tokens = String(locationParts.loc || location).split("-").map(value => value.trim()).filter(Boolean);
            const building = sourceBuilding || locationParts.bldg || tokens[0] || "N/A";
            const production = sourceProduction || locationParts.prod || tokens[1] || "N/A";
            const normalizedProcessName = processName || tokens[2] || "";
            const normalizedStationLocation = stationLocation || (tokens.length > 3 ? tokens.slice(3).join("-") : "");

            let calibrationMonth = rawCalibrationMonth;
            let calibrationYear = rawCalibrationYear;
            if (calibrationDate) {
                const date = new Date(`${calibrationDate}T00:00:00`);
                calibrationMonth = String(date.getMonth() + 1);
                calibrationYear = String(date.getFullYear());
            }

            const normalizedRow = [
                code,
                issuedOn,
                issuerName,
                issuerNo,
                name,
                locationParts.loc,
                due.due,
                status,
                msa,
                serialNo,
                className,
                maker,
                modelNo,
                functionName,
                areaUsed,
                building,
                production,
                normalizedProcessName,
                normalizedStationLocation,
                section,
                calibratedBy,
                calibrationCost,
                frequencyMonths,
                calibrationDate,
                intervalMonths,
                nextVerificationDate,
                calibrationMonth,
                calibrationYear,
                calibrationTemplateType
            ];

            newRawRows.push(normalizedRow);
            previewRows.push([
                code,
                serialNo || "N/A",
                name,
                locationParts.loc,
                building,
                production,
                due.due,
                status,
                msa,
                calibratedBy || "N/A"
            ]);
            newMasterDB[code] = {
                issuedOn,
                issuerName,
                issuerNo,
                name,
                serialNo,
                className,
                maker,
                modelNo,
                status,
                functionName,
                areaUsed,
                loc: locationParts.loc,
                bldg: building || "N/A",
                prod: production || "N/A",
                prodType: production || "N/A",
                processName: normalizedProcessName,
                stationLocation: normalizedStationLocation,
                section,
                sectionUse: section,
                msa,
                calibratedBy,
                calibrationCost,
                frequencyMonths,
                frequency: frequencyMonths,
                calibrationDate,
                intervalMonths,
                durationMonths: intervalMonths,
                duration: intervalMonths,
                nextVerificationDate,
                expiredDate: nextVerificationDate,
                calibrationMonth,
                calibrationYear,
                due: due.due,
                month: due.month,
                year: due.year,
                calibrationTemplateType
            };
        });

        v2PendingMasterImport = {
            filename: file.name,
            masterDB: newMasterDB,
            rawMasterRows: newRawRows,
            previewRows,
            issues,
            duplicateCount,
            columnSync,
            sourceHeader,
            usesMappedHeader
        };

        v2RenderImportPreview();
        v2SetScannerStatus("Scanner ready", "ready");
    } catch (error) {
        console.error("Master import failed", error);
        showToast(`Unable to read the master file: ${error.message || "Unknown error"}`, "error", 5200);
        v2SetScannerStatus("Scanner ready", "ready");
        input.value = "";
    }
}

function v2RenderImportPreview() {
    if (!v2PendingMasterImport) return;

    const { previewRows, issues, duplicateCount, columnSync = [] } = v2PendingMasterImport;
    const errors = issues.filter(issue => issue.type === "Error");
    const warnings = issues.filter(issue => issue.type === "Warning");

    v2SetText("importValidCount", previewRows.length);
    v2SetText("importWarningCount", warnings.length);
    v2SetText("importErrorCount", errors.length);
    v2SetText("importDuplicateCount", duplicateCount);

    const requiredSync = columnSync.filter(entry => entry.required);
    const syncedRequired = requiredSync.filter(entry => entry.found).length;
    const optionalMissing = columnSync.filter(entry => !entry.required && !entry.found);
    v2SetText(
        "importColumnSyncSummary",
        `${syncedRequired}/${requiredSync.length} required columns mapped`
    );

    const syncList = v2El("importColumnSyncList");
    if (syncList) {
        syncList.innerHTML = columnSync.map(entry => {
            const stateClass = entry.found ? "sync-found" : entry.required ? "sync-missing" : "sync-optional";
            const sourceLabel = entry.found ? entry.sourceHeader : "Not found";
            const stateLabel = entry.found ? "Mapped" : entry.required ? "Required" : "Optional";
            return `
                <div class="import-column-map ${stateClass}">
                    <span>${escapeHtml(sourceLabel)}</span>
                    <b aria-hidden="true">&rarr;</b>
                    <strong>${escapeHtml(entry.systemLabel)}</strong>
                    <small>${stateLabel}</small>
                </div>
            `;
        }).join("");
    }

    const syncNote = v2El("importColumnSyncNote");
    if (syncNote) {
        const optionalText = optionalMissing.length
            ? ` Optional columns not found: ${optionalMissing.map(entry => entry.systemLabel).join(", ")}. These values remain blank until entered manually or supplied in a future file.`
            : " All optional registration and calibrated-by columns were also detected.";
        syncNote.textContent = "Serial numbers are imported as text, including leading zeroes. Due dates in YY-MMM or MMM-YY format, such as 22-Dec, DEC-22, and Feb-29, are synchronized as MMM-YY." + optionalText;
    }

    const issuePanel = v2El("importIssuePanel");
    const issueList = v2El("importIssueList");

    if (issuePanel) issuePanel.hidden = issues.length === 0;
    if (issueList) {
        issueList.innerHTML = issues.slice(0, 30).map(issue => `
            <div class="import-issue-row ${issue.type === "Error" ? "issue-error" : "issue-warning"}">
                <strong>Row ${issue.row}</strong>
                <span>${escapeHtml(issue.type)}</span>
                <span>${escapeHtml(issue.message)}</span>
            </div>
        `).join("") + (issues.length > 30
            ? `<div class="import-issue-row"><strong>More</strong><span></span><span>${issues.length - 30} additional issues are available in the issue report.</span></div>`
            : "");
    }

    const previewBody = v2El("importPreviewBody");
    if (previewBody) {
        previewBody.innerHTML = previewRows.slice(0, 10).map(row => `
            <tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join("")}</tr>
        `).join("");
    }

    const confirmButton = v2El("confirmImportButton");
    if (confirmButton) {
        confirmButton.disabled = previewRows.length === 0;
        confirmButton.textContent = previewRows.length > 0
            ? `Import ${previewRows.length} valid row${previewRows.length === 1 ? "" : "s"}`
            : "No valid rows to import";
    }

    const modal = v2El("importModal");
    if (modal) {
        modal.hidden = false;
        modal.classList.add("is-open");
    }
}

function closeImportModal() {
    const modal = v2El("importModal");
    if (modal) {
        modal.classList.remove("is-open");
        modal.hidden = true;
    }

    const fileInput = v2El("masterFile");
    if (fileInput) fileInput.value = "";

    v2PendingMasterImport = null;
    v2FocusScannerCollector();
}

async function confirmMasterImport() {
    if (!v2PendingMasterImport || v2PendingMasterImport.previewRows.length === 0) {
        showToast("There are no valid master rows to import.", "warning");
        return;
    }

    const button = v2El("confirmImportButton");
    if (button) {
        button.disabled = true;
        button.textContent = "Importing...";
    }

    try {
        await db.ref("master_list").set({
            masterDB: v2PendingMasterImport.masterDB,
            rawMasterRows: v2PendingMasterImport.rawMasterRows
        });

        const count = v2PendingMasterImport.previewRows.length;
        const requiredSync = (v2PendingMasterImport.columnSync || []).filter(entry => entry.required);
        const syncedRequired = requiredSync.filter(entry => entry.found).length;
        closeImportModal();
        showToast(
            `${count} master row${count === 1 ? "" : "s"} imported successfully. ` +
            `${syncedRequired}/${requiredSync.length} required columns synchronized.`,
            "success"
        );
        v2Feedback("pass");
    } catch (error) {
        console.error("Master upload failed", error);
        showToast(`Master upload failed: ${error.message || "Unknown error"}`, "error", 5200);
        if (button) {
            button.disabled = false;
            button.textContent = "Retry import";
        }
    }
}

function downloadImportIssues() {
    if (!v2PendingMasterImport?.issues.length) {
        showToast("No validation issues to download.", "info");
        return;
    }

    const rows = [["Row", "Type", "Message"]].concat(
        v2PendingMasterImport.issues.map(issue => [issue.row, issue.type, issue.message])
    );
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet["!cols"] = [{ wch: 10 }, { wch: 12 }, { wch: 80 }];
    worksheet["!autofilter"] = { ref: `A1:C${rows.length}` };
    XLSX.utils.book_append_sheet(workbook, worksheet, "Import Issues");
    XLSX.writeFile(workbook, `Master_Import_Issues_${v2TimestampForFilename()}.xlsx`);
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                   */
/* -------------------------------------------------------------------------- */

function v2ExcelSafe(value) {
    if (typeof value !== "string") return value;
    return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function v2Worksheet(rows, widths, withFilter = true) {
    const safeRows = rows.map(row => row.map(v2ExcelSafe));
    const worksheet = XLSX.utils.aoa_to_sheet(safeRows);
    worksheet["!cols"] = widths.map(width => ({ wch: width }));

    if (withFilter && rows.length > 1 && rows[0].length > 0) {
        const lastColumn = XLSX.utils.encode_col(rows[0].length - 1);
        worksheet["!autofilter"] = { ref: `A1:${lastColumn}${rows.length}` };
    }

    return worksheet;
}

function v2ReportFiltersDescription(filters, search) {
    const parts = [];
    if ((filters.buildings || []).length) parts.push(`Building=${filters.buildings.join("|")}`);
    if ((filters.productions || []).length) parts.push(`Production=${filters.productions.join("|")}`);
    if ((filters.months || []).length) parts.push(`Month=${filters.months.join("|")}`);
    if ((filters.years || []).length) parts.push(`Year=${filters.years.join("|")}`);
    if ((filters.statuses || []).length) parts.push(`Status=${filters.statuses.join("|")}`);
    if (search) parts.push(`Search=${search}`);
    return parts.length ? parts.join(", ") : "All data";
}

function v2CsvSafeText(value) {
    const text = String(value ?? "").replace(/\r\n?/g, "\n");
    return /^[\t\n\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function v2CsvCell(value) {
    return `"${v2CsvSafeText(value).replace(/"/g, '""')}"`;
}

function v2AuditRecency(record, fallbackOrder) {
    const numericId = record?.id === null || record?.id === undefined || record?.id === ""
        ? Number.NaN
        : Number(record.id);
    if (Number.isFinite(numericId)) return numericId;

    const parsedDate = Date.parse(record?.editedAt || record?.time || "");
    return Number.isFinite(parsedDate) ? parsedDate : fallbackOrder;
}

function v2BuildLatestAuditByCode() {
    const latestAuditByCode = new Map();
    const candidates = [
        ...(Array.isArray(scanHistory) ? scanHistory : []),
        ...(Array.isArray(pendingUploads) ? pendingUploads : [])
    ];

    candidates.forEach((record, index) => {
        const code = String(record?.barcode || "").trim().toUpperCase();
        if (!code) return;

        const recency = v2AuditRecency(record, candidates.length - index);
        const current = latestAuditByCode.get(code);

        if (!current || recency > current.recency) {
            latestAuditByCode.set(code, { record, recency });
        }
    });

    return new Map(
        Array.from(latestAuditByCode, ([code, value]) => [code, value.record])
    );
}

function v2EquipmentExportStatus(latestAudit) {
    if (!latestAudit) return "PENDING";
    return v2IsMissingAudit(latestAudit) ? "MISSING" : "OK";
}

function v2GetOrderedMasterEquipment() {
    const itemsByCode = new Map();

    Object.entries(masterDB || {}).forEach(([key, item]) => {
        const code = String(key || "").trim().toUpperCase();
        if (code && !itemsByCode.has(code)) itemsByCode.set(code, item);
    });

    const orderedCodes = [];
    const seenCodes = new Set();
    const rawLookup = v2GetRawMasterLookup();

    rawLookup.orderedCodes.forEach(code => {
        if (!itemsByCode.has(code) || seenCodes.has(code)) return;
        seenCodes.add(code);
        orderedCodes.push(code);
    });

    Array.from(itemsByCode.keys())
        .filter(code => !seenCodes.has(code))
        .sort((a, b) => a.localeCompare(b, undefined, {
            numeric: true,
            sensitivity: "base"
        }))
        .forEach(code => orderedCodes.push(code));

    return { itemsByCode, orderedCodes };
}

function v2BuildFilteredCsvData() {
    const filters = getSelectedFilterState();
    const search = (v2El("globalSearch")?.value || "").trim().toUpperCase();
    const latestAuditByCode = v2BuildLatestAuditByCode();
    const { itemsByCode, orderedCodes } = v2GetOrderedMasterEquipment();
    const header = [
        "EquipName",
        "SerialNo",
        "EquipCode",
        "LocationName",
        "Building",
        "ProdType",
        "Status"
    ];
    const rows = [];
    const statusCounts = { OK: 0, MISSING: 0, PENDING: 0 };

    orderedCodes.forEach(code => {
        const item = itemsByCode.get(code);
        if (!item || !itemMatchesFilters(item, filters)) return;

        const fields = v2GetExportEquipmentFields(code, item);
        const status = v2EquipmentExportStatus(latestAuditByCode.get(code));
        const searchValues = [
            fields.name,
            fields.serialNo,
            fields.code,
            fields.location,
            fields.building,
            fields.production,
            status,
            item?.due,
            item?.status,
            item?.msa
        ];

        if (search && !searchValues.some(value => {
            return String(value || "").toUpperCase().includes(search);
        })) {
            return;
        }

        statusCounts[status] += 1;
        rows.push([
            fields.name,
            fields.serialNo,
            fields.code,
            fields.location,
            fields.building,
            fields.production,
            status
        ]);
    });

    return { header, rows, filters, search, statusCounts };
}

function v2DownloadCsv(rows, filename) {
    const csv = rows.map(row => row.map(v2CsvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });

    if (typeof navigator !== "undefined" && typeof navigator.msSaveBlob === "function") {
        navigator.msSaveBlob(blob, filename);
        return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportFilteredCsv() {
    try {
        if (Object.keys(masterDB || {}).length === 0) {
            showToast("No master equipment records are available to export.", "warning", 4200);
            return;
        }

        const data = v2BuildFilteredCsvData();

        if (data.rows.length === 0) {
            showToast("No equipment matches the current filters.", "warning", 4200);
            return;
        }

        const scope = v2Slug(
            data.filters.buildings?.[0] ||
            data.filters.productions?.[0] ||
            data.filters.statuses?.[0] ||
            data.search ||
            "filtered"
        );
        const filename = `Inventory_Equipment_Status_${scope}_${v2TimestampForFilename()}.csv`;

        v2DownloadCsv([data.header, ...data.rows], filename);
        showToast(
            `CSV created: ${data.rows.length} equipment (` +
            `${data.statusCounts.OK} OK, ` +
            `${data.statusCounts.MISSING} MISSING, ` +
            `${data.statusCounts.PENDING} PENDING).`,
            "success",
            5200
        );
    } catch (error) {
        console.error("CSV generation failed", error);
        showToast(`CSV generation failed: ${error.message || "Unknown error"}`, "error", 5200);
    }
}

function v2BuildReportData(useFilters) {
    const filters = useFilters ? getSelectedFilterState() : {
        buildings: [],
        productions: [],
        months: [],
        years: [],
        statuses: [],
        building: "",
        month: "",
        year: ""
    };
    const search = useFilters ? (v2El("globalSearch")?.value || "").trim().toUpperCase() : "";
    const auditByCode = new Map();

    scanHistory.forEach(record => {
        const code = String(record.barcode || "").toUpperCase();
        if (!auditByCode.has(code)) auditByCode.set(code, record);
    });

    const header = [
        "EQUIPMENT CODE",
        "EQUIPMENT NAME",
        "LOCATION",
        "DUE DATE",
        "STATUS",
        "MSA",
        "AUDIT STATUS",
        "DATE/TIME",
        "AUDITOR",
        "LOCATION AUDIT",
        "STICKER LOCATION AUDIT",
        "DUE AUDIT",
        "MSA AUDIT",
        "REMARK"
    ];

    const allRows = [header];
    const passedRows = [header];
    const abnormalRows = [header];
    const missingRows = [header];
    const pendingRows = [header];

    Object.keys(masterDB).sort().forEach(code => {
        const item = masterDB[code];
        if (useFilters && (!itemMatchesFilters(item, filters) || !v2MatchesMasterSearch(code, item, search))) return;

        const audit = auditByCode.get(code);
        const base = [code, item.name, item.loc, item.due, item.status, item.msa];
        let row;

        if (audit) {
            const auditCategory = v2AuditCategory(audit);
            const reportStatus = auditCategory === "ABNORMAL" ? "FAIL" : auditCategory;

            row = [
                ...base,
                reportStatus,
                audit.time || "",
                audit.pic || "",
                audit.locRes || "",
                audit.stickerLocRes || "",
                audit.dueRes || "",
                audit.msaRes || "",
                audit.remark || ""
            ];

            if (auditCategory === "MISSING") {
                missingRows.push(row);
            } else if (auditCategory === "ABNORMAL") {
                abnormalRows.push(row);
            } else {
                passedRows.push(row);
            }
        } else {
            row = [...base, "PENDING", "", "", "", "", "", "", ""];
            pendingRows.push(row);
        }

        allRows.push(row);
    });

    const unregisteredRows = [header];
    scanHistory.forEach(record => {
        const code = String(record.barcode || "").toUpperCase();
        if (masterDB[code]) return;
        if (useFilters && (v2FilterHasStructuredSelection(filters) || !v2MatchesSearch(record, null, search))) return;

        const auditCategory = v2AuditCategory(record);
        unregisteredRows.push([
            record.barcode || "",
            record.name || "UNREGISTERED",
            "N/A",
            "N/A",
            "UNREGISTERED",
            "N/A",
            auditCategory === "MISSING" ? "MISSING" : "FAIL",
            record.time || "",
            record.pic || "",
            record.locRes || "",
            record.stickerLocRes || "",
            record.dueRes || "",
            record.msaRes || "",
            record.remark || ""
        ]);
    });

    const auditorMap = new Map();
    const ensureAuditor = auditor => {
        if (!auditorMap.has(auditor)) {
            auditorMap.set(auditor, { total: 0, passed: 0, abnormal: 0, missing: 0 });
        }
        return auditorMap.get(auditor);
    };

    allRows.slice(1).forEach(row => {
        const auditor = row[8];
        const auditStatus = row[6];
        if (!auditor || auditStatus === "PENDING") return;

        const stats = ensureAuditor(auditor);
        stats.total += 1;
        if (auditStatus === "PASS") stats.passed += 1;
        if (auditStatus === "FAIL") stats.abnormal += 1;
        if (auditStatus === "MISSING") stats.missing += 1;
    });

    unregisteredRows.slice(1).forEach(row => {
        const auditor = row[8] || "Unknown";
        const stats = ensureAuditor(auditor);
        stats.total += 1;
        if (row[6] === "MISSING") {
            stats.missing += 1;
        } else {
            stats.abnormal += 1;
        }
    });

    const auditorRows = [["AUDITOR", "TOTAL SCANS", "PASSED", "ABNORMAL", "MISSING", "PASS RATE"]];
    Array.from(auditorMap.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .forEach(([auditor, stats]) => {
            const passRate = stats.total ? `${Math.round((stats.passed / stats.total) * 100)}%` : "0%";
            auditorRows.push([auditor, stats.total, stats.passed, stats.abnormal, stats.missing, passRate]);
        });

    const totalMaster = allRows.length - 1;
    const passed = passedRows.length - 1;
    const abnormal = abnormalRows.length - 1;
    const missing = missingRows.length - 1;
    const pending = pendingRows.length - 1;
    const unregistered = unregisteredRows.length - 1;
    const scanned = passed + abnormal + missing;
    const completion = totalMaster ? `${Math.round((scanned / totalMaster) * 100)}%` : "0%";

    const summaryRows = [
        ["GRID V4.3 INVENTORY AUDIT REPORT"],
        ["Generated", new Date().toLocaleString("en-MY")],
        ["Generated by", loggedInUser || "Unknown"],
        ["Scope", v2ReportFiltersDescription(filters, search)],
        [],
        ["METRIC", "VALUE"],
        ["Master equipment", totalMaster],
        ["Scanned", scanned],
        ["Passed", passed],
        ["Abnormal", abnormal],
        ["Missing equipment", missing],
        ["Pending", pending],
        ["Unregistered", unregistered],
        ["Completion", completion]
    ];

    return {
        summaryRows,
        allRows,
        passedRows,
        abnormalRows,
        missingRows,
        pendingRows,
        unregisteredRows,
        auditorRows,
        filters,
        search
    };
}

function v2WriteReport(useFilters) {
    if (!Object.keys(masterDB).length && scanHistory.length === 0) {
        showToast("No data is available to export.", "warning");
        return;
    }

    try {
        const report = v2BuildReportData(useFilters);
        const workbook = XLSX.utils.book_new();
        const dataWidths = [20, 32, 24, 12, 16, 10, 14, 20, 18, 16, 20, 16, 14, 38];

        XLSX.utils.book_append_sheet(workbook, v2Worksheet(report.summaryRows, [25, 60], false), "Summary");
        XLSX.utils.book_append_sheet(workbook, v2Worksheet(report.allRows, dataWidths), "All Equipment");
        XLSX.utils.book_append_sheet(workbook, v2Worksheet(report.passedRows, dataWidths), "Passed");
        XLSX.utils.book_append_sheet(workbook, v2Worksheet(report.abnormalRows, dataWidths), "Abnormal");
        XLSX.utils.book_append_sheet(workbook, v2Worksheet(report.missingRows, dataWidths), "Missing");
        XLSX.utils.book_append_sheet(workbook, v2Worksheet(report.pendingRows, dataWidths), "Pending");
        XLSX.utils.book_append_sheet(workbook, v2Worksheet(report.unregisteredRows, dataWidths), "Unregistered");
        XLSX.utils.book_append_sheet(workbook, v2Worksheet(report.auditorRows, [24, 14, 12, 14, 12, 12]), "Auditor Summary");

        const scope = useFilters
            ? v2Slug(
                report.filters.buildings?.[0] ||
                report.filters.productions?.[0] ||
                report.filters.statuses?.[0] ||
                report.search ||
                "filtered"
            )
            : "full";
        const filename = `Inventory_Audit_${scope}_${v2TimestampForFilename()}.xlsx`;

        XLSX.writeFile(workbook, filename);
        showToast(`Report created: ${filename}`, "success", 4200);
    } catch (error) {
        console.error("Report generation failed", error);
        showToast(`Report generation failed: ${error.message || "Unknown error"}`, "error", 5200);
    }
}

function exportToExcel() {
    v2WriteReport(false);
}

function exportFilteredOnly() {
    v2WriteReport(true);
}

/* -------------------------------------------------------------------------- */
/* Startup wiring                                                              */
/* -------------------------------------------------------------------------- */

// Explicit stable import entry point retained in V4.3. The versioned script URL prevents an older
// service-worker copy from silently handling a newly deployed master file.
window.loadMasterDataV36 = loadMasterDataV36;
window.loadMasterData = loadMasterDataV36;

document.addEventListener("DOMContentLoaded", () => {
    const rememberedUser = localStorage.getItem("grid_last_user");
    if (rememberedUser && v2El("username")) v2El("username").value = rememberedUser;

    ["username", "password"].forEach(id => {
        v2El(id)?.addEventListener("keydown", event => {
            if (event.key === "Enter") checkLogin();
        });
    });

    v2El("manualBarcode")?.addEventListener("keydown", event => {
        if (event.key === "Enter") submitManualEntry();
    });

    v2El("globalSearch")?.addEventListener("input", () => {
        window.clearTimeout(v2SearchTimer);
        v2SearchTimer = window.setTimeout(() => {
            v2AuditLimit = 200;
            updateDisplay();
        }, 240);
    });

    v2El("qcRemark")?.addEventListener("input", updateVerificationState);

    v2El("cameraSelect")?.addEventListener("change", () => {
        if (html5QrCode) {
            showToast("Stop and restart the camera to apply the new camera selection.", "info");
        }
    });

    document.addEventListener("pointerdown", event => {
        const target = event.target;
        if (!(target instanceof Element) || !target.closest(".multi-select")) {
            closeAllMultiFilters();
        }
    });

    window.addEventListener("resize", () => closeAllMultiFilters());

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            if (document.querySelector(".multi-select.open")) {
                closeAllMultiFilters();
                return;
            }

            if (v37IsMissingEmailModalOpen()) {
                closeMissingEmailModal();
            } else if (v2IsImportModalOpen()) {
                closeImportModal();
            } else if (v2IsModalOpen()) {
                closeModal();
            }
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            v2El("globalSearch")?.focus();
        }
    });

    v2El("qcModal")?.addEventListener("click", event => {
        if (event.target === v2El("qcModal")) closeModal();
    });

    v2El("missingEmailModal")?.addEventListener("click", event => {
        if (event.target === v2El("missingEmailModal")) closeMissingEmailModal();
    });

    v2El("importModal")?.addEventListener("click", event => {
        if (event.target === v2El("importModal")) closeImportModal();
    });

    document.querySelector(".progress-container[role='button']")?.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setQuickView("pending");
        }
    });

    db.ref(".info/connected").on("value", snapshot => {
        isOnline = snapshot.val() === true;
        v2UpdateConnectionUI();
    });

    v2UpdateConnectionUI();
    v2UpdatePendingBadge();
    v2SetScannerStatus("Scanner ready", "ready");
    v2SetLastScan("None", "Waiting");
    rebuildFilters();
    updateDisplay();

    if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
        navigator.serviceWorker.register("./sw.js?v=4.2.0", { updateViaCache: "none" })
            .then(registration => registration.update())
            .catch(() => {
            // The app remains fully usable without service worker support.
        });
    }
});
