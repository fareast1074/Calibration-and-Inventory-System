/*
 * GRID Calibration & Inventory System - V3.4 calibration module
 *
 * Adds the post-login system chooser, equipment calibration workspace,
 * editable master-equipment details, two integrated verification templates,
 * automatic next-verification calculation, Firebase record storage, and
 * completed-PDF attachment handling.
 */

let gridActiveModule = "";
let calibrationCurrentCode = "";
let calibrationOriginalCode = "";
let calibrationCurrentItem = null;
let calibrationTemplateType = "";
let calibrationTemplateRestoreData = null;
let calibrationRecords = [];
let calibrationRecordsRef = null;
let calibrationRecordsHandler = null;
let calibrationQrCode = null;
let calibrationCameraStarting = false;
let calibrationEquipmentSaving = false;
let calibrationRecordSaving = false;
let calibrationTemplateResultTimer = null;
let calibrationLastDecode = "";
let calibrationLastDecodeTime = 0;
let calibrationRegistrationMode = false;

const CALIBRATION_DATABASE_FALLBACK_LIMIT = 6 * 1024 * 1024;
const CALIBRATION_TEMPLATE_CONFIG = {
    "digital-weight": {
        label: "Digital Weight Measure",
        file: "Digital_Weight_Measure_Profile_Standalone.html",
        apiType: "digital-weight"
    },
    micrometer: {
        label: "Micrometer",
        file: "Micrometer_Verification_Standalone.html",
        apiType: "micrometer"
    }
};

const CALIBRATION_MASTER_HEADERS = {
    code: "EQUIPMENT CODE",
    issuedOn: "ISSUED ON",
    issuerName: "ISSUER NAME",
    issuerNo: "ISSUER NO",
    name: "EQUIPMENT NAME",
    loc: "LOCATION",
    due: "DUE DATE",
    status: "STATUS",
    msa: "MSA",
    serialNo: "SERIAL NO",
    className: "EQUIPMENT CLASS",
    maker: "MAKER",
    modelNo: "MODEL",
    functionName: "FUNCTION",
    areaUsed: "AREA USED",
    bldg: "BUILDING",
    prod: "PROD TYPE",
    processName: "PROCESS NAME",
    stationLocation: "STATION LOCATION",
    section: "SECTION USE",
    calibratedBy: "CALIBRATED BY",
    calibrationCost: "CALIBRATION COST",
    frequencyMonths: "FREQUENCY",
    calibrationDate: "CALIBRATION DATE",
    intervalMonths: "DURATION",
    nextVerificationDate: "EXPIRED DATE",
    calibrationMonth: "CALIBRATION MONTH",
    calibrationYear: "CALIBRATION YEAR",
    calibrationTemplateType: "CALIBRATION TEMPLATE"
};

const CALIBRATION_MASTER_ALIASES = {
    code: ["EQUIPMENTCODE", "EQUIPCODE", "CODE", "BARCODE", "ASSETCODE"],
    issuedOn: ["ISSUEDON", "ISSUEDDATE", "REGISTEREDON", "REGISTRATIONDATE", "DATEISSUED"],
    issuerName: ["ISSUERNAME", "ISSUEDBY", "REGISTEREDBY", "REGISTRAR", "OWNERNAME"],
    issuerNo: ["ISSUERNO", "ISSUERID", "EMPLOYEENO", "EMPLOYEENUMBER", "STAFFNO", "STAFFID"],
    name: ["EQUIPMENTNAME", "EQUIPNAME", "NAME", "ASSETNAME"],
    serialNo: ["SERIALNO", "SERIALNUMBER", "SERIALNUM", "SERIAL", "SN", "SEERIALNO"],
    className: ["CLASS", "EQUIPMENTCLASS", "ACCURACYCLASS"],
    maker: ["MAKER", "MANUFACTURER", "BRAND"],
    modelNo: ["MODELNO", "MODELNUMBER", "MODEL"],
    status: ["STATUS", "STATU", "EQUIPMENTSTATUS", "EQUIPSTATUS"],
    functionName: ["FUNCTION", "EQUIPMENTFUNCTION", "FUNCTIONSTATUS"],
    areaUsed: ["AREAUSED", "USEDAREA", "AREAUSE"],
    loc: ["LOCATION", "LOCATIONNAME", "LOC", "EQUIPMENTLOCATION"],
    bldg: ["BUILDING", "BLDG"],
    prod: ["PRODTYPE", "PRODUCTIONTYPE", "PRODUCTION", "PROD"],
    processName: ["PROCESSNAME", "PROCESS", "PROCESSAREA"],
    stationLocation: ["STATIONLOCATION", "STATION", "STATIONNO", "STATIONNUMBER"],
    section: ["SECTION", "SECTIONUSE", "SECTIONCODE", "DEPARTMENT"],
    msa: ["MSA", "MSAREQUIREMENT", "MSAREQUIRED"],
    calibratedBy: ["CALIBRATEDBY", "CALIBRATIONBY", "CALBY", "CALIBRATOR", "CALIBRATIONSUPPLIER"],
    calibrationCost: ["CALIBRATIONCOST", "CALCOST", "COST"],
    frequencyMonths: ["FREQUENCY", "FREQUENCYMONTHS", "CALIBRATIONFREQUENCY"],
    calibrationDate: ["CALIBRATIONDATE", "CALDATE", "VERIFICATIONDATE"],
    intervalMonths: ["DURATION", "DURATIONMONTHS", "INTERVALMONTHS", "CALIBRATIONINTERVAL", "VERIFICATIONPERIOD", "INTERVAL"],
    nextVerificationDate: ["EXPIREDDATE", "EXPIRYDATE", "NEXTVERIFICATIONDATE", "NEXTCALIBRATIONDATE", "NEXTDUE", "NEXTDATE"],
    calibrationMonth: ["CALIBRATIONMONTH", "CALMONTH", "MONTH"],
    calibrationYear: ["CALIBRATIONYEAR", "CALYEAR", "YEAR"],
    due: ["DUEDATE", "CALIBRATIONDUEDATE", "CALDUEDATE", "DUE"],
    calibrationTemplateType: ["CALIBRATIONTEMPLATE", "TEMPLATETYPE", "EQUIPMENTTYPE"]
};

function calEl(id) {
    return document.getElementById(id);
}

function calText(id, value) {
    const element = calEl(id);
    if (element) element.textContent = String(value ?? "");
}

function calNormalizeHeader(value) {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

function calNormalizeCode(value) {
    return String(value ?? "").trim().replace(/[\r\n]/g, "").toUpperCase();
}

function calNormalizeText(value, fallback = "") {
    const text = String(value ?? "").trim();
    return text || fallback;
}

function calEscape(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[character]));
}

function calTodayISO() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function calCreateISODate(yearValue, monthValue, dayValue) {
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

function calNormalizeDateISO(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
    }

    if (typeof value === "number" && Number.isFinite(value) && window.XLSX?.SSF?.parse_date_code) {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) return calCreateISODate(parsed.y, parsed.m, parsed.d);
    }

    const text = String(value ?? "").trim();
    if (!text) return "";

    let match = text.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
    if (match) return calCreateISODate(match[1], match[2], match[3]);

    match = text.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
    if (match) return calCreateISODate(match[3], match[2], match[1]);

    return "";
}

function calMonthNumberFromToken(value) {
    const text = String(value ?? "").trim().toUpperCase();
    const numeric = Number(text);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return numeric;

    const names = Array.isArray(MONTH_ORDER) && MONTH_ORDER.length === 12
        ? MONTH_ORDER
        : ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const index = names.findIndex(month => String(month).toUpperCase() === text.slice(0, 3));
    return index >= 0 ? index + 1 : 0;
}

function calNormalizeMonthYearISO(value, referenceDate = "") {
    const exact = calNormalizeDateISO(value);
    if (exact) return exact;

    const text = String(value ?? "").trim();
    if (!text) return "";

    let year = 0;
    let month = 0;
    let match = text.match(/^(\d{4})[-\/.\s]([A-Za-z]{3,9}|\d{1,2})$/);
    if (match) {
        year = Number(match[1]);
        month = calMonthNumberFromToken(match[2]);
    } else {
        match = text.match(/^([A-Za-z]{3,9}|\d{1,2})[-\/.\s](\d{2}|\d{4})$/);
        if (match) {
            month = calMonthNumberFromToken(match[1]);
            year = Number(match[2].length === 2 ? `20${match[2]}` : match[2]);
        }
    }

    if (!year || !month) return "";
    const reference = calNormalizeDateISO(referenceDate);
    const preferredDay = reference ? Number(reference.slice(8, 10)) : 1;
    const lastDay = new Date(year, month, 0).getDate();
    return calCreateISODate(year, month, Math.min(preferredDay, lastDay));
}

function calFormatExpiredDate(dateString) {
    const iso = calNormalizeDateISO(dateString);
    if (!iso) return "";
    const date = new Date(`${iso}T00:00:00`);
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${date.getFullYear()}-${names[date.getMonth()]}`;
}

function calCalibrationDateParts(dateString) {
    const iso = calNormalizeDateISO(dateString);
    if (!iso) return { month: "", year: "" };
    const date = new Date(`${iso}T00:00:00`);
    return {
        month: String(date.getMonth() + 1),
        year: String(date.getFullYear())
    };
}

function calFormatDate(value) {
    if (!value) return "-";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function calAddMonthsISO(dateString, monthsValue) {
    const months = Number(monthsValue);
    if (!dateString || !Number.isInteger(months) || months < 1) return "";

    const parts = String(dateString).split("-").map(Number);
    if (parts.length !== 3 || parts.some(value => !Number.isFinite(value))) return "";

    const [year, month, day] = parts;
    const targetMonthStart = new Date(year, month - 1 + months, 1);
    const targetLastDay = new Date(
        targetMonthStart.getFullYear(),
        targetMonthStart.getMonth() + 1,
        0
    ).getDate();
    const target = new Date(
        targetMonthStart.getFullYear(),
        targetMonthStart.getMonth(),
        Math.min(day, targetLastDay)
    );
    const local = new Date(target.getTime() - target.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function calDueDisplayFromISO(dateString) {
    if (!dateString) return "N/A";
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "N/A";
    const month = MONTH_ORDER[date.getMonth()] || "N/A";
    const year = String(date.getFullYear()).slice(-2);
    return `${month}-${year}`;
}

function calFirebaseKey(value) {
    const text = String(value ?? "");
    try {
        const bytes = new TextEncoder().encode(text);
        let binary = "";
        bytes.forEach(byte => { binary += String.fromCharCode(byte); });
        return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    } catch (error) {
        return btoa(unescape(encodeURIComponent(text)))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/g, "");
    }
}

function calStorageSegment(value) {
    return String(value || "equipment")
        .trim()
        .replace(/[^a-z0-9._-]+/gi, "_")
        .replace(/^_+|_+$/g, "") || "equipment";
}

function calFileName(value) {
    return String(value || "record.pdf")
        .replace(/[\\/:*?"<>|]+/g, "_")
        .replace(/\s+/g, "_")
        .replace(/^_+|_+$/g, "") || "record.pdf";
}

function calFormatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function calSetScannerState(text, state = "ready") {
    calText("calibrationScannerStatus", text);
    const dot = calEl("calibrationScannerDot");
    if (dot) dot.className = `scanner-state-dot ${state}`;
}

function calSetRecordBadge(id, text, tone = "neutral") {
    const badge = calEl(id);
    if (!badge) return;
    badge.textContent = text;
    badge.className = `calibration-record-badge ${tone}`;
}

function calUpdateConnectionUI() {
    const statusIds = ["moduleSyncStatus", "calibrationSyncStatus"];
    statusIds.forEach(id => {
        const dot = calEl(id);
        if (dot) dot.className = `connection-dot ${isOnline ? "online" : "offline"}`;
    });

    calText("moduleSyncStatusText", isOnline ? "Cloud connected" : "Offline mode");
    calText("calibrationSyncStatusText", isOnline ? "Cloud connected" : "Offline mode");
}

function calUpdateModeUI() {
    const developer = isDeveloperMode();
    const label = developer ? "DEVELOPER MODE" : "USER MODE";

    ["moduleAccessModeBadge", "calibrationAccessModeBadge"].forEach(id => {
        const badge = calEl(id);
        if (!badge) return;
        badge.textContent = label;
        badge.classList.toggle("developer", developer);
        badge.classList.toggle("user", !developer);
    });

    ["moduleLogoutButton", "calibrationLogoutButton"].forEach(id => {
        const button = calEl(id);
        if (!button) return;
        button.textContent = developer ? "Logout & Clear" : "Logout";
        button.title = developer
            ? "Logout and clear cloud audit history"
            : "Logout without deleting cloud history";
        button.classList.toggle("logout-clear-mode", developer);
    });

    calText("moduleUserDisp", loggedInUser || "-");
    calText("calibrationUserDisp", loggedInUser || "-");
    renderCalibrationHistory();
}

function calHideAllWorkspaces() {
    const inventory = calEl("mainApp");
    const calibration = calEl("calibrationApp");
    const chooser = calEl("moduleOverlay");

    if (inventory) {
        inventory.hidden = true;
        inventory.style.display = "none";
    }
    if (calibration) {
        calibration.hidden = true;
        calibration.style.display = "none";
    }
    if (chooser) {
        chooser.hidden = true;
        chooser.style.display = "none";
    }
}

async function showModuleChooser() {
    if (!loggedInUser) return;

    if (typeof v2StopCamera === "function") {
        try { await v2StopCamera(false); } catch (error) { /* optional */ }
    }
    await stopCalibrationCamera(false);

    gridActiveModule = "";
    document.body.removeAttribute("data-active-module");
    calHideAllWorkspaces();

    const chooser = calEl("moduleOverlay");
    if (chooser) {
        chooser.hidden = false;
        chooser.style.display = "flex";
    }

    calUpdateModeUI();
    calUpdateConnectionUI();
}

async function openSystemModule(moduleName) {
    if (!loggedInUser) return;
    const module = moduleName === "calibration" ? "calibration" : "inventory";

    if (module === "inventory") {
        await stopCalibrationCamera(false);
    } else if (typeof v2StopCamera === "function") {
        try { await v2StopCamera(false); } catch (error) { /* optional */ }
    }

    calHideAllWorkspaces();
    gridActiveModule = module;
    document.body.dataset.activeModule = module;

    if (module === "inventory") {
        const inventory = calEl("mainApp");
        if (inventory) {
            inventory.hidden = false;
            inventory.style.display = "block";
        }
        initScannerInput();
        v2SetScannerStatus("Scanner ready", "ready");
        updateDisplay();
        if (typeof v2FocusScannerCollector === "function") v2FocusScannerCollector();
        showToast("Inventory workspace opened.", "success", 2200);
        return;
    }

    const calibration = calEl("calibrationApp");
    if (calibration) {
        calibration.hidden = false;
        calibration.style.display = "block";
    }
    calUpdateConnectionUI();
    calUpdateModeUI();
    calSetScannerState("Ready to scan", "ready");
    window.setTimeout(() => calEl("calibrationScanInput")?.focus(), 80);
    showToast("Calibration workspace opened.", "success", 2200);
}

/* Override the V2 login flow so a successful login opens the system chooser. */
window.checkLogin = function checkLoginV3() {
    const usernameElement = calEl("username");
    const passwordElement = calEl("password");
    const username = usernameElement?.value.trim() || "";
    const password = passwordElement?.value || "";
    const accessMode = getAccessModeForPassword(password);

    if (!username || !accessMode) {
        showToast("Invalid name or password.", "error");
        if (typeof v2Feedback === "function") v2Feedback("fail");
        passwordElement?.focus();
        return;
    }

    loggedInUser = username;
    localStorage.setItem("grid_last_user", username);
    applyAccessMode(accessMode);

    calText("userDisp", username);
    calText("moduleUserDisp", username);
    calText("calibrationUserDisp", username);

    const loginOverlay = calEl("loginOverlay");
    if (loginOverlay) loginOverlay.style.display = "none";

    if (passwordElement) passwordElement.value = "";
    calUpdateModeUI();
    calUpdateConnectionUI();
    showModuleChooser();

    if (typeof v2Feedback === "function") v2Feedback("pass");
    showToast(`Welcome, ${username}. Choose Inventory or Calibration.`, "success", 3800);
};

/* Extend the existing access-mode renderer to cover the new UI. */
const calBaseApplyAccessMode = window.applyAccessMode;
window.applyAccessMode = function applyAccessModeV3(mode) {
    calBaseApplyAccessMode(mode);
    calUpdateModeUI();
};

/* Prevent the hidden inventory collector from stealing focus in Calibration. */
const calBaseInventoryFocus = window.v2FocusScannerCollector;
window.v2FocusScannerCollector = function v2FocusScannerCollectorV3() {
    if (gridActiveModule && gridActiveModule !== "inventory") return;
    if (typeof calBaseInventoryFocus === "function") calBaseInventoryFocus();
};

function calRawValue(code, fieldName) {
    const rows = Array.isArray(rawMasterRows) ? rawMasterRows : [];
    if (!Array.isArray(rows[0])) return "";

    const header = rows[0];
    const aliases = CALIBRATION_MASTER_ALIASES[fieldName] || [];
    const index = header.findIndex(value => aliases.includes(calNormalizeHeader(value)));
    if (index < 0) return "";

    const codeIndex = header.findIndex(value => CALIBRATION_MASTER_ALIASES.code.includes(calNormalizeHeader(value)));
    const actualCodeIndex = codeIndex >= 0 ? codeIndex : 0;
    const normalizedCode = calNormalizeCode(code);
    const row = rows.slice(1).find(source => calNormalizeCode(source?.[actualCodeIndex]) === normalizedCode);
    return row ? row[index] ?? "" : "";
}

function calItemValue(code, item, fieldName, fallback = "") {
    const directMap = {
        code,
        issuedOn: item?.issuedOn ?? item?.issuedDate ?? item?.registeredOn,
        issuerName: item?.issuerName ?? item?.issuedBy ?? item?.registrar,
        issuerNo: item?.issuerNo ?? item?.issuerId ?? item?.employeeNo ?? item?.staffNo,
        name: item?.name,
        serialNo: item?.serialNo,
        className: item?.className ?? item?.equipmentClass,
        maker: item?.maker,
        modelNo: item?.modelNo ?? item?.model,
        status: item?.status,
        functionName: item?.functionName ?? item?.functionStatus ?? item?.function,
        areaUsed: item?.areaUsed ?? item?.area,
        loc: item?.loc ?? item?.location,
        bldg: item?.bldg ?? item?.building,
        prod: item?.prod ?? item?.prodType ?? item?.production,
        processName: item?.processName ?? item?.process,
        stationLocation: item?.stationLocation ?? item?.station,
        section: item?.section ?? item?.sectionUse,
        msa: item?.msa,
        calibratedBy: item?.calibratedBy ?? item?.calibrationBy ?? item?.calibrator,
        calibrationCost: item?.calibrationCost ?? item?.cost,
        frequencyMonths: item?.frequencyMonths ?? item?.frequency,
        calibrationDate: item?.calibrationDate,
        intervalMonths: item?.intervalMonths ?? item?.durationMonths ?? item?.duration,
        nextVerificationDate: item?.nextVerificationDate ?? item?.expiredDate,
        calibrationMonth: item?.calibrationMonth,
        calibrationYear: item?.calibrationYear,
        due: item?.due,
        calibrationTemplateType: item?.calibrationTemplateType
    };

    const direct = directMap[fieldName];
    if (direct !== undefined && direct !== null && String(direct).trim() !== "") return direct;
    const raw = calRawValue(code, fieldName);
    if (raw !== undefined && raw !== null && String(raw).trim() !== "") return raw;
    return fallback;
}

function calBuildEquipment(code, item) {
    const normalizedCode = calNormalizeCode(code);
    const location = calNormalizeText(calItemValue(normalizedCode, item, "loc", "N/A"), "N/A");
    const locationParts = typeof parseLocationParts === "function"
        ? parseLocationParts(location)
        : { loc: location, bldg: location.split("-")[0] || "N/A", prod: location.split("-")[1] || "N/A" };
    const locationTokens = String(locationParts.loc || location)
        .split("-")
        .map(value => value.trim())
        .filter(Boolean);

    const intervalRaw = Number(calItemValue(normalizedCode, item, "intervalMonths", 12));
    const intervalMonths = Number.isInteger(intervalRaw) && intervalRaw > 0 ? intervalRaw : 12;
    const frequencyRaw = Number(calItemValue(normalizedCode, item, "frequencyMonths", intervalMonths));
    const frequencyMonths = Number.isInteger(frequencyRaw) && frequencyRaw > 0 ? frequencyRaw : intervalMonths;

    const calibrationDate = calNormalizeDateISO(
        calItemValue(normalizedCode, item, "calibrationDate", "")
    );
    const calculatedNextDate = calibrationDate ? calAddMonthsISO(calibrationDate, intervalMonths) : "";
    const storedNextDate = calNormalizeMonthYearISO(
        calItemValue(normalizedCode, item, "nextVerificationDate", ""),
        calibrationDate
    );
    const nextDate = storedNextDate || calculatedNextDate;
    const calibrationParts = calCalibrationDateParts(calibrationDate);

    return {
        code: normalizedCode,
        issuedOn: calNormalizeDateISO(calItemValue(normalizedCode, item, "issuedOn", "")),
        issuerName: calNormalizeText(calItemValue(normalizedCode, item, "issuerName", "")),
        issuerNo: calNormalizeText(calItemValue(normalizedCode, item, "issuerNo", "")),
        name: calNormalizeText(calItemValue(normalizedCode, item, "name", "UNKNOWN"), "UNKNOWN"),
        serialNo: calNormalizeText(calItemValue(normalizedCode, item, "serialNo", "")),
        className: calNormalizeText(calItemValue(normalizedCode, item, "className", "")),
        maker: calNormalizeText(calItemValue(normalizedCode, item, "maker", "")),
        modelNo: calNormalizeText(calItemValue(normalizedCode, item, "modelNo", "")),
        status: calNormalizeText(calItemValue(normalizedCode, item, "status", "N/A"), "N/A"),
        functionName: calNormalizeText(calItemValue(normalizedCode, item, "functionName", "")),
        areaUsed: calNormalizeText(calItemValue(normalizedCode, item, "areaUsed", "")),
        loc: locationParts.loc || location,
        bldg: calNormalizeText(calItemValue(normalizedCode, item, "bldg", locationParts.bldg || locationTokens[0] || "N/A"), "N/A"),
        prod: calNormalizeText(calItemValue(normalizedCode, item, "prod", locationParts.prod || locationTokens[1] || "N/A"), "N/A"),
        processName: calNormalizeText(calItemValue(normalizedCode, item, "processName", locationTokens[2] || "")),
        stationLocation: calNormalizeText(calItemValue(normalizedCode, item, "stationLocation", locationTokens.slice(3).join("-") || "")),
        section: calNormalizeText(calItemValue(normalizedCode, item, "section", "")),
        msa: calNormalizeText(calItemValue(normalizedCode, item, "msa", "N/A"), "N/A"),
        calibratedBy: calNormalizeText(calItemValue(normalizedCode, item, "calibratedBy", "")),
        calibrationCost: calNormalizeText(calItemValue(normalizedCode, item, "calibrationCost", "")),
        frequencyMonths,
        calibrationDate,
        intervalMonths,
        durationMonths: intervalMonths,
        nextVerificationDate: nextDate,
        expiredDate: nextDate,
        calibrationMonth: calibrationParts.month || calNormalizeText(calItemValue(normalizedCode, item, "calibrationMonth", "")),
        calibrationYear: calibrationParts.year || calNormalizeText(calItemValue(normalizedCode, item, "calibrationYear", "")),
        due: calNormalizeText(calItemValue(normalizedCode, item, "due", nextDate ? calDueDisplayFromISO(nextDate) : "N/A"), "N/A"),
        calibrationTemplateType: calNormalizeText(calItemValue(normalizedCode, item, "calibrationTemplateType", ""))
    };
}

function calSetInput(id, value) {
    const input = calEl(id);
    if (input) input.value = value === undefined || value === null ? "" : String(value);
}

function calSetTemplateCardsEnabled(enabled) {
    ["weightTemplateCard", "micrometerTemplateCard"].forEach(id => {
        const button = calEl(id);
        if (button) button.disabled = !enabled;
    });
}

function calUpdateEquipmentSaveButtonLabel() {
    const saveButton = calEl("saveCalibrationEquipmentButton");
    if (saveButton && !calibrationEquipmentSaving) {
        saveButton.textContent = calibrationRegistrationMode ? "Register Equipment" : "Save Equipment Details";
    }
}

function calSetRegistrationMode(enabled, options = {}) {
    calibrationRegistrationMode = Boolean(enabled);
    const section = calEl("calibrationRegistrationSection");
    if (section) section.classList.toggle("is-registration-mode", calibrationRegistrationMode);

    ["calIssuedOn", "calIssuerName", "calIssuerNo"].forEach(id => {
        const input = calEl(id);
        if (!input) return;
        input.required = calibrationRegistrationMode;
        input.setAttribute("aria-required", calibrationRegistrationMode ? "true" : "false");
    });

    const badgeText = options.badgeText || (calibrationRegistrationMode ? "New registration" : "Existing record");
    const badgeTone = options.badgeTone || (calibrationRegistrationMode ? "warning" : "neutral");
    calSetRecordBadge("calibrationRegistrationModeBadge", badgeText, badgeTone);
    calText(
        "calibrationRegistrationHint",
        calibrationRegistrationMode
            ? "Issued On, Issuer Name, and Issuer No. are required before the new equipment can be registered."
            : "Registration fields are optional for existing imported equipment and remain editable."
    );

    const registerButton = calEl("registerNewEquipmentButton");
    if (registerButton) registerButton.classList.toggle("active", calibrationRegistrationMode);
    calUpdateEquipmentSaveButtonLabel();
}

function fillCalibrationEquipmentForm(equipment, registered) {
    calibrationCurrentItem = equipment;
    calibrationCurrentCode = equipment.code;
    calibrationOriginalCode = registered ? equipment.code : "";

    calSetInput("calibrationOriginalCode", calibrationOriginalCode);
    calSetInput("calIssuedOn", equipment.issuedOn || (!registered ? calTodayISO() : ""));
    calSetInput("calIssuerName", equipment.issuerName || (!registered ? (loggedInUser || "") : ""));
    calSetInput("calIssuerNo", equipment.issuerNo);
    calSetInput("calEquipmentCode", equipment.code);
    calSetInput("calEquipmentName", equipment.name === "UNKNOWN" && !registered ? "" : equipment.name);
    calSetInput("calSerialNo", equipment.serialNo);
    calSetInput("calEquipmentClass", equipment.className);
    calSetInput("calMaker", equipment.maker);
    calSetInput("calModelNo", equipment.modelNo);
    calSetInput("calEquipmentStatus", equipment.status === "N/A" && !registered ? "IN USE" : equipment.status);
    calSetInput("calFunction", equipment.functionName || (registered ? "" : "ACTIVE"));
    calSetInput("calAreaUsed", equipment.areaUsed);
    calSetInput("calLocation", equipment.loc === "N/A" && !registered ? "" : equipment.loc);
    calSetInput("calBuilding", equipment.bldg === "N/A" && !registered ? "" : equipment.bldg);
    calSetInput("calProduction", equipment.prod === "N/A" && !registered ? "" : equipment.prod);
    calSetInput("calProcessName", equipment.processName);
    calSetInput("calStationLocation", equipment.stationLocation);
    calSetInput("calSection", equipment.section);
    calSetInput("calMsa", equipment.msa === "N/A" && !registered ? "N/A" : equipment.msa);
    calSetInput("calCalibratedBy", equipment.calibratedBy);
    calSetInput("calCalibrationCost", equipment.calibrationCost === "" ? 0 : equipment.calibrationCost);
    calSetInput("calibrationDate", equipment.calibrationDate || calTodayISO());
    calSetInput("calibrationInterval", equipment.intervalMonths || 12);
    calSetInput("calFrequency", equipment.frequencyMonths || equipment.intervalMonths || 12);

    updateCalibrationNextDate();
    calText("calibrationLoadedCode", equipment.code || "None");
    calText("calibrationMasterState", registered ? "Registered equipment" : "New equipment");
    calSetRecordBadge(
        "calibrationEquipmentBadge",
        registered ? "Registered" : "New master record",
        registered ? "success" : "warning"
    );

    const saveButton = calEl("saveCalibrationEquipmentButton");
    if (saveButton) saveButton.disabled = false;
    calSetRegistrationMode(!registered);
    calSetTemplateCardsEnabled(registered);
    calUpdateRecordActionState();

    if (equipment.calibrationTemplateType && CALIBRATION_TEMPLATE_CONFIG[equipment.calibrationTemplateType]) {
        calibrationTemplateType = equipment.calibrationTemplateType;
        calUpdateTemplateSelectionUI();
    }
}

function calResetCalibrationDocumentSession(options = {}) {
    calibrationTemplateType = "";
    calibrationTemplateRestoreData = null;
    window.clearTimeout(calibrationTemplateResultTimer);

    const workspace = calEl("calibrationTemplateWorkspace");
    const frame = calEl("calibrationTemplateFrame");
    const loading = calEl("calibrationTemplateLoading");
    if (workspace) workspace.hidden = true;
    if (loading) loading.hidden = true;
    if (frame) {
        frame.removeAttribute("srcdoc");
        frame.src = "about:blank";
    }

    const pdfInput = calEl("calibrationPdfInput");
    if (pdfInput) pdfInput.value = "";
    calText("calibrationPdfFileName", "Choose completed calibration PDF");
    calText("calibrationPdfFileMeta", "PDF only. Firebase Storage is used first, with a database fallback for smaller files.");
    calText("calibrationUploadStatus", "");
    calSetUploadProgress(0);
    calText("calibrationTemplateResult", "PENDING");
    const resultElement = calEl("calibrationTemplateResult");
    if (resultElement) resultElement.className = "result-pending";
    calSetRecordBadge("calibrationTemplateBadge", "Not selected", "neutral");
    calSetRecordBadge("calibrationSaveState", "Not saved", "neutral");

    ["weightTemplateCard", "micrometerTemplateCard"].forEach(id => {
        calEl(id)?.classList.remove("selected");
    });
    ["syncTemplateButton", "printTemplateButton"].forEach(id => {
        const button = calEl(id);
        if (button) button.disabled = true;
    });
    calUpdateRecordActionState();

    if (options.message) showToast(options.message, "info", 3000);
}

async function submitCalibrationCode() {
    const input = calEl("calibrationScanInput");
    const code = calNormalizeCode(input?.value || "");
    if (!code) {
        showToast("Scan or enter an equipment code.", "warning");
        input?.focus();
        return;
    }
    if (input) input.value = "";
    await processCalibrationCode(code);
}

function startNewEquipmentRegistration() {
    const enteredCode = calNormalizeCode(calEl("calEquipmentCode")?.value || "");
    const hasWorkspaceData = Boolean(calibrationCurrentCode || enteredCode || calibrationRegistrationMode);
    if (hasWorkspaceData && !confirm("Start a new equipment registration? Unsaved equipment, template, and PDF selections in the current workspace will be discarded.")) {
        return;
    }

    resetCalibrationWorkspace({ skipConfirm: true });
    const equipment = calBuildEquipment("", {});
    equipment.issuedOn = calTodayISO();
    equipment.issuerName = loggedInUser || "";
    equipment.issuerNo = "";
    equipment.calibrationDate = calTodayISO();
    equipment.intervalMonths = 12;
    equipment.frequencyMonths = 12;
    equipment.calibrationCost = 0;
    equipment.status = "IN USE";
    equipment.functionName = "ACTIVE";
    equipment.msa = "N/A";

    fillCalibrationEquipmentForm(equipment, false);
    calibrationCurrentCode = "";
    calibrationCurrentItem = null;
    calText("calibrationLoadedCode", "New registration");
    calText("calibrationMasterState", "Enter new equipment details");
    calSetRecordBadge("calibrationEquipmentBadge", "New registration", "warning");
    calSetRegistrationMode(true, { badgeText: "Registration required", badgeTone: "warning" });
    calSetScannerState("New equipment registration", "active");
    calEl("calEquipmentCode")?.focus();
    showToast("New equipment registration is ready. Complete the required fields and select Register Equipment.", "info", 4800);
}

async function processCalibrationCode(rawCode) {
    const code = calNormalizeCode(rawCode);
    if (!code) return;

    const changingEquipment = calibrationRegistrationMode || Boolean(calibrationCurrentCode && calibrationCurrentCode !== code);
    const currentLabel = calibrationCurrentCode || calNormalizeCode(calEl("calEquipmentCode")?.value) || "the new registration";
    if (changingEquipment && !confirm(`Load ${code}? Unsaved equipment, template, and PDF selections for ${currentLabel} will be discarded.`)) {
        calSetScannerState("Ready to scan", "ready");
        calEl("calibrationScanInput")?.focus();
        return;
    }
    if (changingEquipment) calResetCalibrationDocumentSession();

    calSetScannerState(`Loading ${code}`, "busy");
    calText("calibrationLoadedCode", code);
    calText("calibrationMasterState", "Searching master data...");

    const registeredItem = masterDB[code] || null;
    const equipment = calBuildEquipment(code, registeredItem || {});
    fillCalibrationEquipmentForm(equipment, Boolean(registeredItem));
    subscribeCalibrationRecords(code);

    if (registeredItem) {
        calSetScannerState("Equipment loaded", "active");
        showToast(`${code} master details loaded.`, "success", 2600);
        if (typeof v2Feedback === "function") v2Feedback("pass");
    } else {
        calText("calibrationMasterState", "Registration required");
        calSetScannerState("Code not registered - complete the registration form", "error");
        showToast(`${code} is not in the master list. Complete the registration and equipment details, then select Register Equipment.`, "warning", 5200);
        if (typeof v2Feedback === "function") v2Feedback("fail");
    }

    window.setTimeout(() => calEl("calEquipmentName")?.focus(), 80);
}

function updateCalibrationNextDate(options = {}) {
    const rawDate = calEl("calibrationDate")?.value || "";
    const date = calNormalizeDateISO(rawDate);
    const interval = Number(calEl("calibrationInterval")?.value || 0);
    const nextDate = calAddMonthsISO(date, interval);
    const dateParts = calCalibrationDateParts(date);

    if (date && rawDate !== date) calSetInput("calibrationDate", date);
    calSetInput("calibrationNextDate", nextDate);
    calSetInput("calibrationExpiredDate", nextDate ? calFormatExpiredDate(nextDate) : "");
    calSetInput("calCalibrationMonth", dateParts.month);
    calSetInput("calCalibrationYear", dateParts.year);
    calText("calibrationDueDisplay", `DUE: ${nextDate ? calDueDisplayFromISO(nextDate) : "-"}`);

    if (options.syncFrequency && !calNormalizeText(calEl("calFrequency")?.value) && Number.isInteger(interval) && interval > 0) {
        calSetInput("calFrequency", interval);
    }

    syncEquipmentToCalibrationTemplate({ silent: true, onlyIfReady: true });
    return nextDate;
}

function recalculateCalibrationExpiredDate() {
    const nextDate = updateCalibrationNextDate({ syncFrequency: true });
    if (nextDate) {
        showToast(`Expired date recalculated as ${calFormatExpiredDate(nextDate)} (${calFormatDate(nextDate)}).`, "success", 3200);
    } else {
        showToast("Enter a valid Calibration Date and Duration before recalculating.", "warning", 3600);
    }
}

function collectCalibrationEquipmentForm() {
    const code = calNormalizeCode(calEl("calEquipmentCode")?.value);
    const name = calNormalizeText(calEl("calEquipmentName")?.value);
    const location = calNormalizeText(calEl("calLocation")?.value, "N/A");
    const parsedLocation = typeof parseLocationParts === "function"
        ? parseLocationParts(location)
        : { loc: location, bldg: location.split("-")[0] || "N/A", prod: location.split("-")[1] || "N/A" };
    const locationTokens = String(parsedLocation.loc || location)
        .split("-")
        .map(value => value.trim())
        .filter(Boolean);

    const calibrationDate = calNormalizeDateISO(calEl("calibrationDate")?.value || "");
    const intervalMonths = Number(calEl("calibrationInterval")?.value || 0);
    const frequencyInput = calNormalizeText(calEl("calFrequency")?.value);
    const frequencyMonths = frequencyInput === "" ? intervalMonths : Number(frequencyInput);
    const nextVerificationDate = calAddMonthsISO(calibrationDate, intervalMonths);
    const calibrationParts = calCalibrationDateParts(calibrationDate);
    const calibrationCostInput = calNormalizeText(calEl("calCalibrationCost")?.value);
    const calibrationCostNumber = calibrationCostInput === "" ? "" : Number(calibrationCostInput);
    const calibrationCost = calibrationCostInput !== "" && Number.isFinite(calibrationCostNumber)
        ? calibrationCostNumber
        : calibrationCostInput;
    const section = calNormalizeText(calEl("calSection")?.value);
    const production = calNormalizeText(calEl("calProduction")?.value, parsedLocation.prod || locationTokens[1] || "N/A");

    return {
        code,
        issuedOn: calNormalizeDateISO(calEl("calIssuedOn")?.value || ""),
        issuerName: calNormalizeText(calEl("calIssuerName")?.value),
        issuerNo: calNormalizeText(calEl("calIssuerNo")?.value),
        name,
        serialNo: calNormalizeText(calEl("calSerialNo")?.value),
        className: calNormalizeText(calEl("calEquipmentClass")?.value),
        maker: calNormalizeText(calEl("calMaker")?.value),
        modelNo: calNormalizeText(calEl("calModelNo")?.value),
        status: calNormalizeText(calEl("calEquipmentStatus")?.value, "N/A").toUpperCase(),
        functionName: calNormalizeText(calEl("calFunction")?.value),
        areaUsed: calNormalizeText(calEl("calAreaUsed")?.value),
        loc: parsedLocation.loc || location,
        bldg: calNormalizeText(calEl("calBuilding")?.value, parsedLocation.bldg || locationTokens[0] || "N/A"),
        prod: production,
        prodType: production,
        processName: calNormalizeText(calEl("calProcessName")?.value, locationTokens[2] || ""),
        stationLocation: calNormalizeText(calEl("calStationLocation")?.value, locationTokens.slice(3).join("-") || ""),
        section,
        sectionUse: section,
        msa: calNormalizeText(calEl("calMsa")?.value, "N/A").toUpperCase(),
        calibratedBy: calNormalizeText(calEl("calCalibratedBy")?.value),
        calibrationCost,
        frequencyMonths,
        frequency: frequencyMonths,
        calibrationDate,
        intervalMonths,
        durationMonths: intervalMonths,
        duration: intervalMonths,
        nextVerificationDate,
        expiredDate: nextVerificationDate,
        calibrationMonth: calibrationParts.month,
        calibrationYear: calibrationParts.year,
        due: nextVerificationDate ? calDueDisplayFromISO(nextVerificationDate) : "N/A",
        calibrationTemplateType,
        month: nextVerificationDate ? MONTH_ORDER[new Date(`${nextVerificationDate}T00:00:00`).getMonth()] : "N/A",
        year: nextVerificationDate ? String(new Date(`${nextVerificationDate}T00:00:00`).getFullYear()) : "N/A"
    };
}

function validateCalibrationEquipment(equipment, requireSchedule = true, requireRegistration = calibrationRegistrationMode) {
    if (!equipment.code) return "Equipment Code is required.";
    if (!equipment.name) return "Equipment Name is required.";
    if (requireRegistration && !equipment.issuedOn) return "Issued On is required for a new equipment registration.";
    if (requireRegistration && !equipment.issuerName) return "Issuer Name is required for a new equipment registration.";
    if (requireRegistration && !equipment.issuerNo) return "Issuer No. is required for a new equipment registration.";
    if (requireSchedule && !equipment.calibrationDate) return "Calibration Date is required.";
    if (requireSchedule && (!Number.isInteger(equipment.intervalMonths) || equipment.intervalMonths < 1 || equipment.intervalMonths > 120)) {
        return "Duration must be a whole number from 1 to 120 months.";
    }
    if (equipment.frequencyMonths !== "" && equipment.frequencyMonths !== null && equipment.frequencyMonths !== undefined &&
        (!Number.isInteger(equipment.frequencyMonths) || equipment.frequencyMonths < 1 || equipment.frequencyMonths > 120)) {
        return "Frequency must be a whole number from 1 to 120 months.";
    }
    if (equipment.calibrationCost !== "" && (!Number.isFinite(Number(equipment.calibrationCost)) || Number(equipment.calibrationCost) < 0)) {
        return "Calibration Cost must be zero or a positive number.";
    }
    if (requireSchedule && !equipment.nextVerificationDate) return "Expired Date could not be calculated.";
    return "";
}

function calEnsureRawHeaders(rows) {
    const result = Array.isArray(rows) ? rows.map(row => Array.isArray(row) ? [...row] : []) : [];
    if (!Array.isArray(result[0]) || result[0].length === 0) {
        result.length = 0;
        result.push(Object.values(CALIBRATION_MASTER_HEADERS));
    }

    const header = result[0];
    const indexes = {};

    Object.entries(CALIBRATION_MASTER_HEADERS).forEach(([fieldName, defaultHeader]) => {
        const aliases = CALIBRATION_MASTER_ALIASES[fieldName] || [];
        let index = header.findIndex(value => aliases.includes(calNormalizeHeader(value)));
        if (index < 0) {
            index = header.length;
            header.push(defaultHeader);
            result.slice(1).forEach(row => {
                while (row.length < header.length) row.push("");
            });
        }
        indexes[fieldName] = index;
    });

    result.forEach(row => {
        while (row.length < header.length) row.push("");
    });

    return { rows: result, indexes };
}

function calUpdateRawMasterRows(equipment, oldCode) {
    const normalizedOldCode = calNormalizeCode(oldCode);
    const { rows, indexes } = calEnsureRawHeaders(rawMasterRows);
    let row = rows.slice(1).find(source => {
        const sourceCode = calNormalizeCode(source[indexes.code]);
        return (normalizedOldCode && sourceCode === normalizedOldCode) || sourceCode === equipment.code;
    });

    if (!row) {
        row = new Array(rows[0].length).fill("");
        rows.push(row);
    }

    Object.keys(CALIBRATION_MASTER_HEADERS).forEach(fieldName => {
        const value = equipment[fieldName];
        row[indexes[fieldName]] = value === undefined || value === null ? "" : value;
    });

    return rows;
}

async function calMigrateEquipmentNodes(oldCode, newCode) {
    const normalizedOld = calNormalizeCode(oldCode);
    const normalizedNew = calNormalizeCode(newCode);
    if (!normalizedOld || normalizedOld === normalizedNew) return;

    const oldKey = calFirebaseKey(normalizedOld);
    const newKey = calFirebaseKey(normalizedNew);

    try {
        const oldSnapshot = await db.ref(`calibration_records/${oldKey}`).once("value");
        if (oldSnapshot.exists()) {
            const oldRecords = oldSnapshot.val() || {};
            const migratedRecords = {};

            Object.entries(oldRecords).forEach(([recordId, sourceRecord]) => {
                const record = sourceRecord && typeof sourceRecord === "object"
                    ? { ...sourceRecord }
                    : sourceRecord;

                if (record && typeof record === "object") {
                    record.equipmentCode = normalizedNew;
                    record.equipmentSnapshot = {
                        ...(record.equipmentSnapshot || {}),
                        code: normalizedNew
                    };

                    if (record.pdf?.databasePath) {
                        record.pdf = {
                            ...record.pdf,
                            databasePath: String(record.pdf.databasePath)
                                .replace(`calibration_pdf_files/${oldKey}/`, `calibration_pdf_files/${newKey}/`)
                        };
                    }
                }

                migratedRecords[recordId] = record;
            });

            const newSnapshot = await db.ref(`calibration_records/${newKey}`).once("value");
            await db.ref(`calibration_records/${newKey}`).set({
                ...(newSnapshot.val() || {}),
                ...migratedRecords
            });
            await db.ref(`calibration_records/${oldKey}`).remove();
        }
    } catch (error) {
        console.warn(`Unable to migrate calibration records from ${normalizedOld} to ${normalizedNew}`, error);
    }

    try {
        const oldSnapshot = await db.ref(`calibration_pdf_files/${oldKey}`).once("value");
        if (oldSnapshot.exists()) {
            const newSnapshot = await db.ref(`calibration_pdf_files/${newKey}`).once("value");
            await db.ref(`calibration_pdf_files/${newKey}`).set({
                ...(newSnapshot.val() || {}),
                ...(oldSnapshot.val() || {})
            });
            await db.ref(`calibration_pdf_files/${oldKey}`).remove();
        }
    } catch (error) {
        console.warn(`Unable to migrate database PDF files from ${normalizedOld} to ${normalizedNew}`, error);
    }
}

async function saveCalibrationEquipmentDetails(options = {}) {
    if (calibrationEquipmentSaving) return null;
    const equipment = collectCalibrationEquipmentForm();
    const isNewRegistration = calibrationRegistrationMode || !calNormalizeCode(calibrationOriginalCode);
    const validationError = validateCalibrationEquipment(
        equipment,
        options.requireSchedule !== false,
        options.requireRegistration !== false && isNewRegistration
    );
    if (validationError) {
        if (!options.silent) showToast(validationError, "warning");
        return null;
    }

    const oldCode = isNewRegistration
        ? ""
        : calNormalizeCode(calibrationOriginalCode || calibrationCurrentCode);
    if (isNewRegistration && masterDB[equipment.code]) {
        showToast(`${equipment.code} is already registered. Load the equipment before editing it.`, "error", 5200);
        calEl("calEquipmentCode")?.focus();
        return null;
    }
    if (!isNewRegistration && oldCode !== equipment.code && masterDB[equipment.code]) {
        showToast(`${equipment.code} already exists. Use a unique equipment code.`, "error", 4800);
        calEl("calEquipmentCode")?.focus();
        return null;
    }

    calibrationEquipmentSaving = true;
    const saveButton = calEl("saveCalibrationEquipmentButton");
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = isNewRegistration ? "Registering..." : "Saving...";
    }

    try {
        const now = new Date().toISOString();
        const existing = isNewRegistration
            ? {}
            : (masterDB[oldCode] || masterDB[equipment.code] || {});
        const savedEquipment = {
            ...existing,
            ...equipment,
            ...(isNewRegistration ? {
                createdAt: existing.createdAt || now,
                createdBy: existing.createdBy || loggedInUser,
                registeredAt: existing.registeredAt || now,
                registeredBy: existing.registeredBy || loggedInUser,
                registrationSource: existing.registrationSource || "CALIBRATION WORKSPACE"
            } : {}),
            lastUpdatedAt: now,
            lastUpdatedBy: loggedInUser
        };
        const updatedMasterDB = { ...masterDB };
        if (oldCode && oldCode !== equipment.code) delete updatedMasterDB[oldCode];
        updatedMasterDB[equipment.code] = savedEquipment;
        const updatedRawRows = calUpdateRawMasterRows(savedEquipment, oldCode);

        await db.ref("master_list").set({
            masterDB: updatedMasterDB,
            rawMasterRows: updatedRawRows
        });

        if (oldCode && oldCode !== equipment.code) {
            await calMigrateEquipmentNodes(oldCode, equipment.code);
        }

        masterDB = updatedMasterDB;
        rawMasterRows = updatedRawRows;
        calibrationCurrentCode = equipment.code;
        calibrationOriginalCode = equipment.code;
        calibrationCurrentItem = savedEquipment;
        calSetInput("calibrationOriginalCode", equipment.code);
        calText("calibrationLoadedCode", equipment.code);
        calText("calibrationMasterState", "Registered equipment");
        calSetRegistrationMode(false, {
            badgeText: isNewRegistration ? "Registered" : "Existing record",
            badgeTone: isNewRegistration ? "success" : "neutral"
        });
        calSetRecordBadge(
            "calibrationEquipmentBadge",
            isNewRegistration ? "Registered" : "Saved to master",
            "success"
        );
        calSetTemplateCardsEnabled(true);
        subscribeCalibrationRecords(equipment.code);
        rebuildFilters();
        updateDisplay();
        syncEquipmentToCalibrationTemplate({ silent: true, onlyIfReady: true });

        if (!options.silent) {
            showToast(
                isNewRegistration
                    ? `${equipment.code} was registered and saved to the master database.`
                    : `${equipment.code} equipment details were saved to the database.`,
                "success",
                4200
            );
            if (typeof v2Feedback === "function") v2Feedback("pass");
        }
        return savedEquipment;
    } catch (error) {
        console.error("Unable to save calibration equipment details", error);
        showToast(`Equipment details could not be saved: ${error.message || "Unknown error"}`, "error", 5600);
        return null;
    } finally {
        calibrationEquipmentSaving = false;
        if (saveButton) saveButton.disabled = false;
        calUpdateEquipmentSaveButtonLabel();
        calUpdateRecordActionState();
    }
}

function resetCalibrationWorkspace(options = {}) {
    const enteredCode = calNormalizeCode(calEl("calEquipmentCode")?.value || "");
    const hasWorkspaceData = Boolean(calibrationCurrentCode || enteredCode || calibrationRegistrationMode);
    if (hasWorkspaceData && !options.skipConfirm && !confirm("Clear the current calibration workspace? Unsaved form and template changes will be discarded.")) {
        return false;
    }

    calibrationCurrentCode = "";
    calibrationOriginalCode = "";
    calibrationCurrentItem = null;
    calibrationRecords = [];
    unsubscribeCalibrationRecords();
    calResetCalibrationDocumentSession();

    const form = calEl("calibrationEquipmentForm");
    form?.reset();
    calSetRegistrationMode(false, { badgeText: "No equipment", badgeTone: "neutral" });
    calSetInput("calIssuedOn", "");
    calSetInput("calIssuerName", "");
    calSetInput("calIssuerNo", "");
    calSetInput("calibrationDate", calTodayISO());
    calSetInput("calibrationInterval", 12);
    calSetInput("calFrequency", 12);
    calSetInput("calCalibrationCost", 0);
    calSetInput("calEquipmentStatus", "IN USE");
    calSetInput("calFunction", "ACTIVE");
    calSetInput("calMsa", "N/A");
    updateCalibrationNextDate();
    calSetInput("calibrationOriginalCode", "");
    calText("calibrationLoadedCode", "None");
    calText("calibrationMasterState", "Waiting");
    calSetRecordBadge("calibrationEquipmentBadge", "No equipment", "neutral");
    calSetTemplateCardsEnabled(false);
    ["weightTemplateCard", "micrometerTemplateCard"].forEach(id => {
        calEl(id)?.classList.remove("selected");
    });
    const saveButton = calEl("saveCalibrationEquipmentButton");
    if (saveButton) saveButton.disabled = true;
    calUpdateEquipmentSaveButtonLabel();
    renderCalibrationHistory();
    calSetScannerState("Ready to scan", "ready");
    if (!options.suppressFocus) calEl("calibrationScanInput")?.focus();
    return true;
}

function calTemplateAPI() {
    const frame = calEl("calibrationTemplateFrame");
    try {
        return frame?.contentWindow?.GRID_TEMPLATE_API || null;
    } catch (error) {
        return null;
    }
}

function calUpdateTemplateSelectionUI() {
    Object.keys(CALIBRATION_TEMPLATE_CONFIG).forEach(type => {
        const id = type === "digital-weight" ? "weightTemplateCard" : "micrometerTemplateCard";
        calEl(id)?.classList.toggle("selected", calibrationTemplateType === type);
    });

    const config = CALIBRATION_TEMPLATE_CONFIG[calibrationTemplateType];
    calSetRecordBadge(
        "calibrationTemplateBadge",
        config ? config.label : "Not selected",
        config ? "success" : "neutral"
    );
    calText("calibrationTemplateTitle", config ? `${config.label} Verification Record` : "Verification template");
    calText("calibrationTemplateHint", config
        ? "Complete the form below. Template details and judgment are stored with the calibration record."
        : "Complete the form, then use Print / Save PDF."
    );
    ["syncTemplateButton", "printTemplateButton"].forEach(id => {
        const button = calEl(id);
        if (button) button.disabled = !config;
    });
    calUpdateRecordActionState();
}

function openCalibrationTemplate(type, restoreData = null) {
    const config = CALIBRATION_TEMPLATE_CONFIG[type];
    if (!config) return;
    if (calibrationRegistrationMode) {
        showToast("Register the new equipment before opening a calibration template.", "warning", 4200);
        return;
    }
    if (!calibrationCurrentCode && !calNormalizeCode(calEl("calEquipmentCode")?.value)) {
        showToast("Scan or enter an equipment code before opening a template.", "warning");
        return;
    }

    calibrationTemplateType = type;
    calibrationTemplateRestoreData = restoreData;
    calUpdateTemplateSelectionUI();

    const workspace = calEl("calibrationTemplateWorkspace");
    const frame = calEl("calibrationTemplateFrame");
    const loading = calEl("calibrationTemplateLoading");
    if (!workspace || !frame) return;

    workspace.hidden = false;
    if (loading) loading.hidden = false;

    const expectedUrl = new URL(config.file, window.location.href).href;
    if (frame.src !== expectedUrl) {
        frame.src = config.file;
    } else {
        handleCalibrationTemplateLoaded();
    }

    workspace.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeCalibrationTemplate() {
    const workspace = calEl("calibrationTemplateWorkspace");
    if (workspace) workspace.hidden = true;
}

function handleCalibrationTemplateLoaded() {
    const frame = calEl("calibrationTemplateFrame");
    const loading = calEl("calibrationTemplateLoading");
    if (loading) loading.hidden = true;

    if (!CALIBRATION_TEMPLATE_CONFIG[calibrationTemplateType]) {
        calUpdateRecordActionState();
        return;
    }

    const api = calTemplateAPI();
    if (!api) {
        calSetRecordBadge("calibrationTemplateBadge", "Template integration unavailable", "warning");
        showToast("The template loaded, but the integration API is unavailable. Serve the project from localhost or HTTPS.", "warning", 5200);
        return;
    }

    if (api.type !== CALIBRATION_TEMPLATE_CONFIG[calibrationTemplateType]?.apiType) {
        return;
    }

    if (calibrationTemplateRestoreData) {
        try {
            api.applyData(calibrationTemplateRestoreData);
            calibrationTemplateRestoreData = null;
            pullEquipmentFromCalibrationTemplate({ silent: true });
        } catch (error) {
            console.warn("Unable to restore template data", error);
            syncEquipmentToCalibrationTemplate({ silent: true });
        }
    } else {
        syncEquipmentToCalibrationTemplate({ silent: true });
    }

    try {
        frame.contentDocument?.addEventListener("input", scheduleCalibrationTemplateResultUpdate);
        frame.contentDocument?.addEventListener("change", scheduleCalibrationTemplateResultUpdate);
    } catch (error) {
        // Same-origin access is required for live result updates.
    }

    updateCalibrationTemplateResult();
    calSetRecordBadge("calibrationTemplateBadge", CALIBRATION_TEMPLATE_CONFIG[calibrationTemplateType].label, "success");
    calUpdateRecordActionState();
}

function scheduleCalibrationTemplateResultUpdate() {
    window.clearTimeout(calibrationTemplateResultTimer);
    calibrationTemplateResultTimer = window.setTimeout(updateCalibrationTemplateResult, 180);
}

function updateCalibrationTemplateResult() {
    const api = calTemplateAPI();
    let result = "PENDING";
    try {
        result = String(api?.getResult?.() || "PENDING").toUpperCase();
    } catch (error) {
        result = "PENDING";
    }
    calText("calibrationTemplateResult", result);
    const resultElement = calEl("calibrationTemplateResult");
    if (resultElement) {
        resultElement.className = result === "PASS" ? "result-pass" : result === "FAIL" ? "result-fail" : "result-pending";
    }
}

function syncEquipmentToCalibrationTemplate(options = {}) {
    if (!calibrationTemplateType) return false;
    const api = calTemplateAPI();
    if (!api) {
        if (!options.silent && !options.onlyIfReady) showToast("Open the template before synchronizing equipment details.", "warning");
        return false;
    }

    const equipment = collectCalibrationEquipmentForm();
    try {
        api.applyEquipment({
            name: equipment.name,
            code: equipment.code,
            serialNo: equipment.serialNo,
            location: equipment.loc,
            maker: equipment.maker,
            modelNo: equipment.modelNo,
            className: equipment.className,
            section: equipment.section,
            calibrationDate: equipment.calibrationDate,
            intervalMonths: equipment.intervalMonths,
            nextVerificationDate: equipment.nextVerificationDate
        });
        updateCalibrationTemplateResult();
        if (!options.silent) showToast("Equipment details synchronized to the template.", "success", 2400);
        return true;
    } catch (error) {
        console.error("Unable to synchronize template", error);
        if (!options.silent) showToast("Template synchronization failed.", "error");
        return false;
    }
}

function pullEquipmentFromCalibrationTemplate(options = {}) {
    const api = calTemplateAPI();
    if (!api) {
        if (!options.silent) showToast("Open the template before importing its equipment details.", "warning");
        return false;
    }

    try {
        const data = api.getData();
        const equipment = data?.equipment || {};
        calSetInput("calEquipmentName", equipment.name ?? calEl("calEquipmentName")?.value);
        calSetInput("calEquipmentCode", equipment.code ?? calEl("calEquipmentCode")?.value);
        calSetInput("calMaker", equipment.maker ?? calEl("calMaker")?.value);
        calSetInput("calEquipmentClass", equipment.className ?? calEl("calEquipmentClass")?.value);
        calSetInput("calModelNo", equipment.modelNo ?? calEl("calModelNo")?.value);
        calSetInput("calSection", equipment.section ?? calEl("calSection")?.value);
        calSetInput("calSerialNo", equipment.serialNo ?? calEl("calSerialNo")?.value);
        calSetInput("calLocation", equipment.location ?? calEl("calLocation")?.value);
        calSetInput("calibrationDate", equipment.calibrationOn || equipment.verificationOn || calEl("calibrationDate")?.value);
        const templateInterval = equipment.calibrationPeriod || equipment.verificationPeriod || calEl("calibrationInterval")?.value;
        calSetInput("calibrationInterval", templateInterval);
        if (!calNormalizeText(calEl("calFrequency")?.value)) calSetInput("calFrequency", templateInterval);
        updateCalibrationNextDate();
        updateCalibrationTemplateResult();
        if (!options.silent) showToast("Template equipment details copied back to the master form.", "success", 2600);
        return true;
    } catch (error) {
        console.error("Unable to read template details", error);
        if (!options.silent) showToast("Unable to read the template details.", "error");
        return false;
    }
}

function printCalibrationTemplate() {
    const api = calTemplateAPI();
    if (!api) {
        showToast("Open a verification template first.", "warning");
        return;
    }

    syncEquipmentToCalibrationTemplate({ silent: true });
    updateCalibrationTemplateResult();
    try {
        api.print();
    } catch (error) {
        calEl("calibrationTemplateFrame")?.contentWindow?.print();
    }
}

function calGetTemplateData() {
    const api = calTemplateAPI();
    if (!api) return null;
    try {
        return api.getData();
    } catch (error) {
        console.warn("Unable to serialize template data", error);
        return null;
    }
}

function calUpdateRecordActionState() {
    const hasEquipment = Boolean(calNormalizeCode(calEl("calEquipmentCode")?.value));
    const hasTemplate = Boolean(CALIBRATION_TEMPLATE_CONFIG[calibrationTemplateType]);
    const hasPdf = Boolean(calEl("calibrationPdfInput")?.files?.[0]);

    const draftButton = calEl("saveCalibrationDraftButton");
    const uploadButton = calEl("uploadCalibrationPdfButton");
    const templateReady = Boolean(calTemplateAPI());
    const busy = calibrationEquipmentSaving || calibrationRecordSaving;
    if (draftButton) draftButton.disabled = !hasEquipment || !hasTemplate || !templateReady || busy;
    if (uploadButton) uploadButton.disabled = !hasEquipment || !hasTemplate || !templateReady || !hasPdf || busy;
}

function calSetUploadProgress(percent, label = "") {
    const container = calEl("calibrationUploadProgress");
    const bar = calEl("calibrationUploadProgressBar");
    if (container) container.hidden = percent <= 0 || percent >= 100;
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    if (label) calText("calibrationUploadStatus", label);
}

function calReadFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Unable to read the selected PDF."));
        reader.readAsDataURL(file);
    });
}

async function calUploadPdf(file, equipmentCode, recordId) {
    const codeKey = calFirebaseKey(equipmentCode);
    const safeCode = calStorageSegment(equipmentCode);
    const safeFile = calFileName(file.name || `${safeCode}_Calibration.pdf`);
    const storagePath = `calibration_pdfs/${safeCode}/${recordId}/${safeFile}`;

    if (storage && typeof storage.ref === "function") {
        try {
            const reference = storage.ref().child(storagePath);
            const task = reference.put(file, {
                contentType: "application/pdf",
                customMetadata: {
                    equipmentCode,
                    uploadedBy: loggedInUser,
                    recordId
                }
            });

            await new Promise((resolve, reject) => {
                task.on(
                    "state_changed",
                    snapshot => {
                        const percent = snapshot.totalBytes
                            ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
                            : 0;
                        calSetUploadProgress(percent, `Uploading PDF to cloud storage: ${percent}%`);
                    },
                    reject,
                    resolve
                );
            });

            const url = await task.snapshot.ref.getDownloadURL();
            return {
                storageMode: "firebase-storage",
                storagePath,
                downloadUrl: url,
                fileName: file.name,
                size: file.size,
                contentType: file.type || "application/pdf"
            };
        } catch (error) {
            console.warn("Firebase Storage upload failed; attempting database fallback", error);
            showToast("Cloud file storage was unavailable. Trying the database PDF fallback.", "warning", 4200);
        }
    }

    if (file.size > CALIBRATION_DATABASE_FALLBACK_LIMIT) {
        throw new Error(`The PDF is ${calFormatBytes(file.size)}. Database fallback supports files up to ${calFormatBytes(CALIBRATION_DATABASE_FALLBACK_LIMIT)}.`);
    }

    calSetUploadProgress(25, "Preparing PDF for database storage...");
    const dataUrl = await calReadFileAsDataURL(file);
    calSetUploadProgress(65, "Saving PDF under the equipment code...");
    const databasePath = `calibration_pdf_files/${codeKey}/${recordId}`;
    await db.ref(databasePath).set({
        fileName: file.name,
        size: file.size,
        contentType: file.type || "application/pdf",
        dataUrl,
        uploadedAt: new Date().toISOString(),
        uploadedBy: loggedInUser
    });
    calSetUploadProgress(95, "Finalizing calibration record...");

    return {
        storageMode: "realtime-database",
        databasePath,
        fileName: file.name,
        size: file.size,
        contentType: file.type || "application/pdf"
    };
}

async function saveCalibrationRecord(requirePdf = true) {
    if (calibrationRecordSaving) return;
    if (!CALIBRATION_TEMPLATE_CONFIG[calibrationTemplateType]) {
        showToast("Select and open a verification template before saving the calibration record.", "warning");
        return;
    }
    if (!calTemplateAPI()) {
        showToast("Open the selected verification template before saving the calibration record.", "warning");
        return;
    }

    pullEquipmentFromCalibrationTemplate({ silent: true });
    const equipment = collectCalibrationEquipmentForm();
    const validationError = validateCalibrationEquipment(equipment, true);
    if (validationError) {
        showToast(validationError, "warning");
        return;
    }

    const pdfFile = calEl("calibrationPdfInput")?.files?.[0] || null;
    if (requirePdf && !pdfFile) {
        showToast("Choose the completed PDF before saving the final calibration record.", "warning");
        return;
    }
    if (pdfFile && !/\.pdf$/i.test(pdfFile.name) && pdfFile.type !== "application/pdf") {
        showToast("Only PDF files can be uploaded.", "error");
        return;
    }

    calibrationRecordSaving = true;
    calUpdateRecordActionState();
    calSetRecordBadge("calibrationSaveState", requirePdf ? "Uploading..." : "Saving draft...", "warning");
    calSetUploadProgress(1, requirePdf ? "Starting PDF upload..." : "Saving calibration draft...");

    try {
        const savedEquipment = await saveCalibrationEquipmentDetails({ silent: true, requireSchedule: true });
        if (!savedEquipment) throw new Error("Equipment details were not saved.");

        const codeKey = calFirebaseKey(savedEquipment.code);
        const recordRef = db.ref(`calibration_records/${codeKey}`).push();
        const recordId = recordRef.key;
        const templateData = calGetTemplateData();
        updateCalibrationTemplateResult();
        const result = String(calEl("calibrationTemplateResult")?.textContent || "PENDING").toUpperCase();
        let pdf = null;

        if (pdfFile) {
            pdf = await calUploadPdf(pdfFile, savedEquipment.code, recordId);
        }

        const timestamp = new Date().toISOString();
        const record = {
            recordId,
            equipmentCode: savedEquipment.code,
            equipmentName: savedEquipment.name,
            equipmentSnapshot: savedEquipment,
            calibrationDate: savedEquipment.calibrationDate,
            intervalMonths: savedEquipment.intervalMonths,
            frequencyMonths: savedEquipment.frequencyMonths,
            nextVerificationDate: savedEquipment.nextVerificationDate,
            dueDisplay: savedEquipment.due,
            calibratedBy: savedEquipment.calibratedBy,
            calibrationCost: savedEquipment.calibrationCost,
            templateType: calibrationTemplateType,
            templateLabel: CALIBRATION_TEMPLATE_CONFIG[calibrationTemplateType].label,
            templateData,
            result,
            recordStatus: pdf ? "COMPLETE" : "DRAFT",
            pdf,
            preparedBy: loggedInUser,
            createdAt: timestamp,
            updatedAt: timestamp
        };

        await recordRef.set(record);

        const updatedMaster = {
            ...savedEquipment,
            calibrationTemplateType,
            lastCalibrationRecordId: recordId,
            lastCalibrationResult: result,
            lastCalibrationPdf: Boolean(pdf),
            lastCalibrationSavedAt: timestamp,
            lastCalibrationSavedBy: loggedInUser
        };
        masterDB[savedEquipment.code] = updatedMaster;
        rawMasterRows = calUpdateRawMasterRows(updatedMaster, savedEquipment.code);
        await db.ref("master_list").set({ masterDB, rawMasterRows });

        calSetUploadProgress(100, pdf ? "PDF and calibration record saved." : "Calibration draft saved.");
        calSetRecordBadge("calibrationSaveState", pdf ? "PDF saved" : "Draft saved", "success");
        const pdfInput = calEl("calibrationPdfInput");
        if (pdfInput) pdfInput.value = "";
        calText("calibrationPdfFileName", "Choose completed calibration PDF");
        calText("calibrationPdfFileMeta", "PDF only. Firebase Storage is used first, with a database fallback for smaller files.");
        calUpdateRecordActionState();
        showToast(pdf
            ? `${savedEquipment.code} calibration PDF and record saved successfully.`
            : `${savedEquipment.code} calibration draft saved successfully.`, "success", 4600);
        if (typeof v2Feedback === "function") v2Feedback("pass");
    } catch (error) {
        console.error("Calibration record save failed", error);
        calSetRecordBadge("calibrationSaveState", "Save failed", "danger");
        calText("calibrationUploadStatus", error.message || "Calibration record could not be saved.");
        showToast(`Calibration record could not be saved: ${error.message || "Unknown error"}`, "error", 6200);
        if (typeof v2Feedback === "function") v2Feedback("fail");
    } finally {
        calibrationRecordSaving = false;
        window.setTimeout(() => calSetUploadProgress(0), 900);
        calUpdateRecordActionState();
    }
}

function unsubscribeCalibrationRecords() {
    if (calibrationRecordsRef && calibrationRecordsHandler && typeof calibrationRecordsRef.off === "function") {
        calibrationRecordsRef.off("value", calibrationRecordsHandler);
    }
    calibrationRecordsRef = null;
    calibrationRecordsHandler = null;
}

function subscribeCalibrationRecords(equipmentCode) {
    unsubscribeCalibrationRecords();
    const code = calNormalizeCode(equipmentCode);
    if (!code) {
        calibrationRecords = [];
        renderCalibrationHistory();
        return;
    }

    const codeKey = calFirebaseKey(code);
    calibrationRecordsRef = db.ref(`calibration_records/${codeKey}`);
    calibrationRecordsHandler = snapshot => {
        const records = [];
        snapshot.forEach(child => {
            const value = child.val() || {};
            records.push({ ...value, recordId: value.recordId || child.key });
        });
        calibrationRecords = records.sort((a, b) => {
            const aDate = Date.parse(a.createdAt || a.calibrationDate || 0) || 0;
            const bDate = Date.parse(b.createdAt || b.calibrationDate || 0) || 0;
            return bDate - aDate;
        });
        renderCalibrationHistory();
    };
    calibrationRecordsRef.on("value", calibrationRecordsHandler);
}

function calFindRecord(recordId) {
    return calibrationRecords.find(record => String(record.recordId || "") === String(recordId || ""));
}

function renderCalibrationHistory() {
    const body = calEl("calibrationHistoryBody");
    const empty = calEl("calibrationHistoryEmpty");
    const count = calibrationRecords.length;
    const pdfCount = calibrationRecords.filter(record => record.pdf).length;
    const latest = calibrationRecords[0] || null;

    calText("calibrationRecordCount", count);
    calText("calibrationPdfCount", pdfCount);
    calText("calibrationLatestDate", latest ? calFormatDate(latest.calibrationDate) : "-");
    calText("calibrationLatestDue", latest ? calFormatDate(latest.nextVerificationDate) : "-");
    calText("calibrationHistoryCount", `${count} record${count === 1 ? "" : "s"}`);
    calText("calibrationHistoryHint", calibrationCurrentCode
        ? `${count} calibration record${count === 1 ? "" : "s"} stored under ${calibrationCurrentCode}.`
        : "Scan an equipment code to view its calibration history."
    );

    if (!body) return;
    if (!count) {
        body.innerHTML = "";
        if (empty) {
            empty.hidden = false;
            empty.textContent = calibrationCurrentCode
                ? `No calibration records have been saved for ${calibrationCurrentCode}.`
                : "Scan equipment to load calibration records.";
        }
        return;
    }

    if (empty) empty.hidden = true;
    body.innerHTML = calibrationRecords.map(record => {
        const result = String(record.result || "PENDING").toUpperCase();
        const resultClass = result === "PASS" ? "result-pass" : result === "FAIL" ? "result-fail" : "result-pending";
        const pdfLabel = record.pdf ? calEscape(record.pdf.fileName || "Attached PDF") : "No PDF";
        const recordId = encodeURIComponent(record.recordId || "");
        return `
            <tr>
                <td data-label="Calibration Date">${calEscape(calFormatDate(record.calibrationDate))}</td>
                <td data-label="Next Verification">${calEscape(calFormatDate(record.nextVerificationDate))}</td>
                <td data-label="Equipment Type">${calEscape(record.templateLabel || record.templateType || "-")}</td>
                <td data-label="Result"><span class="calibration-result-pill ${resultClass}">${calEscape(result)}</span></td>
                <td data-label="Prepared By">${calEscape(record.preparedBy || "-")}</td>
                <td data-label="PDF"><span class="pdf-status-pill ${record.pdf ? "attached" : "draft"}">${pdfLabel}</span></td>
                <td data-label="Action">
                    <div class="calibration-row-actions">
                        ${record.pdf ? `<button type="button" class="btn-detail-row" onclick="downloadCalibrationPdf('${recordId}')">Open PDF</button>` : ""}
                        <button type="button" class="btn-detail-row" onclick="loadCalibrationRecord('${recordId}')">Load</button>
                        <button type="button" class="btn-delete-row" onclick="deleteCalibrationRecord('${recordId}')">Delete</button>
                    </div>
                </td>
            </tr>`;
    }).join("");
}

async function downloadCalibrationPdf(encodedRecordId) {
    const recordId = decodeURIComponent(encodedRecordId || "");
    const record = calFindRecord(recordId);
    if (!record?.pdf) {
        showToast("This calibration record does not have an attached PDF.", "warning");
        return;
    }

    const pdf = record.pdf;
    if (pdf.downloadUrl) {
        window.open(pdf.downloadUrl, "_blank", "noopener");
        return;
    }

    if (!pdf.databasePath) {
        showToast("The PDF storage reference is missing.", "error");
        return;
    }

    try {
        calText("calibrationUploadStatus", "Loading archived PDF...");
        const snapshot = await db.ref(pdf.databasePath).once("value");
        const fileData = snapshot.val();
        if (!fileData?.dataUrl) throw new Error("PDF data was not found.");

        const response = await fetch(fileData.dataUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileData.fileName || pdf.fileName || `${record.equipmentCode}_Calibration.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1200);
        calText("calibrationUploadStatus", "Archived PDF downloaded.");
    } catch (error) {
        console.error("Unable to download database PDF", error);
        showToast(`Unable to open the PDF: ${error.message || "Unknown error"}`, "error");
    }
}

function loadCalibrationRecord(encodedRecordId) {
    const recordId = decodeURIComponent(encodedRecordId || "");
    const record = calFindRecord(recordId);
    if (!record) {
        showToast("Calibration record was not found.", "error");
        return;
    }

    const equipment = record.equipmentSnapshot || calBuildEquipment(record.equipmentCode, masterDB[record.equipmentCode] || {});
    fillCalibrationEquipmentForm(equipment, Boolean(masterDB[equipment.code]));
    calSetInput("calibrationDate", record.calibrationDate || equipment.calibrationDate || calTodayISO());
    calSetInput("calibrationInterval", record.intervalMonths || equipment.intervalMonths || 12);
    calSetInput("calFrequency", record.frequencyMonths || equipment.frequencyMonths || record.intervalMonths || equipment.intervalMonths || 12);
    updateCalibrationNextDate();

    if (CALIBRATION_TEMPLATE_CONFIG[record.templateType]) {
        openCalibrationTemplate(record.templateType, record.templateData || null);
    }
    calSetRecordBadge("calibrationSaveState", record.pdf ? "Loaded completed record" : "Loaded draft", record.pdf ? "success" : "warning");
    showToast(`Calibration record from ${calFormatDate(record.calibrationDate)} loaded.`, "success", 3000);
}

async function deleteCalibrationRecord(encodedRecordId) {
    if (typeof canDeleteAuditRecords === "function" && !canDeleteAuditRecords()) {
        showAccessDenied("Delete calibration record");
        return;
    }

    const recordId = decodeURIComponent(encodedRecordId || "");
    const record = calFindRecord(recordId);
    if (!record) return;
    if (!confirm(`Delete the ${calFormatDate(record.calibrationDate)} calibration record for ${record.equipmentCode}?`)) return;

    try {
        const codeKey = calFirebaseKey(record.equipmentCode || calibrationCurrentCode);
        if (record.pdf?.storagePath && storage && typeof storage.ref === "function") {
            try { await storage.ref(record.pdf.storagePath).delete(); } catch (error) { console.warn("Storage file delete failed", error); }
        }
        if (record.pdf?.databasePath) {
            await db.ref(record.pdf.databasePath).remove();
        }
        await db.ref(`calibration_records/${codeKey}/${recordId}`).remove();
        showToast("Calibration record deleted.", "success");
    } catch (error) {
        console.error("Unable to delete calibration record", error);
        showToast(`Calibration record could not be deleted: ${error.message || "Unknown error"}`, "error");
    }
}

async function populateCalibrationCameras() {
    const select = calEl("calibrationCameraSelect");
    if (!select || !window.Html5Qrcode?.getCameras) return [];
    const selected = select.value;
    const cameras = await Html5Qrcode.getCameras();
    select.innerHTML = '<option value="">Rear camera (auto)</option>';
    cameras.forEach((camera, index) => {
        const option = document.createElement("option");
        option.value = camera.id;
        option.textContent = camera.label || `Camera ${index + 1}`;
        option.selected = camera.id === selected;
        select.appendChild(option);
    });
    return cameras;
}

async function stopCalibrationCamera(showReady = true) {
    const scanner = calibrationQrCode;
    calibrationQrCode = null;
    if (scanner) {
        try { await scanner.stop(); } catch (error) { /* already stopped */ }
        try { scanner.clear(); } catch (error) { /* optional */ }
    }
    const reader = calEl("calibrationReader");
    const button = calEl("calibrationCameraButton");
    if (reader) reader.style.display = "none";
    if (button) {
        button.disabled = false;
        button.textContent = "Start Camera";
    }
    if (showReady && gridActiveModule === "calibration") calSetScannerState("Ready to scan", "ready");
}

async function toggleCalibrationCamera() {
    if (calibrationCameraStarting) return;
    if (calibrationQrCode) {
        await stopCalibrationCamera();
        showToast("Calibration camera stopped.", "info", 2200);
        return;
    }

    const reader = calEl("calibrationReader");
    const button = calEl("calibrationCameraButton");
    if (!reader || typeof Html5Qrcode === "undefined") {
        showToast("Camera scanner library is not available.", "error");
        return;
    }

    calibrationCameraStarting = true;
    reader.style.display = "block";
    if (button) {
        button.disabled = true;
        button.textContent = "Starting...";
    }
    calSetScannerState("Starting camera", "busy");

    try {
        const cameras = await populateCalibrationCameras();
        const selected = calEl("calibrationCameraSelect")?.value || "";
        const preferred = selected || cameras.find(camera => /back|rear|environment/i.test(camera.label || ""))?.id || "";
        const source = preferred ? { deviceId: { exact: preferred } } : { facingMode: "environment" };
        const scanWidth = Math.min(340, Math.max(220, window.innerWidth - 70));
        calibrationQrCode = new Html5Qrcode("calibrationReader");

        await calibrationQrCode.start(
            source,
            {
                fps: 15,
                qrbox: { width: scanWidth, height: Math.round(scanWidth * 0.62) },
                aspectRatio: 1.333,
                disableFlip: false
            },
            decodedText => {
                const clean = calNormalizeCode(decodedText);
                const now = Date.now();
                if (!clean || (clean === calibrationLastDecode && now - calibrationLastDecodeTime < 2500)) return;
                calibrationLastDecode = clean;
                calibrationLastDecodeTime = now;
                stopCalibrationCamera(false).finally(() => processCalibrationCode(clean));
            },
            () => { /* frame decode failures are normal */ }
        );

        if (button) {
            button.disabled = false;
            button.textContent = "Stop Camera";
        }
        calSetScannerState("Camera scanning", "active");
        showToast("Calibration camera started.", "success", 2200);
    } catch (error) {
        console.error("Calibration camera start failed", error);
        calibrationQrCode = null;
        reader.style.display = "none";
        if (button) {
            button.disabled = false;
            button.textContent = "Start Camera";
        }
        calSetScannerState("Camera unavailable", "error");
        showToast("Unable to start the camera. Check browser permission and camera availability.", "error", 5200);
    } finally {
        calibrationCameraStarting = false;
    }
}

function handleCalibrationPdfSelection() {
    const file = calEl("calibrationPdfInput")?.files?.[0] || null;
    if (!file) {
        calText("calibrationPdfFileName", "Choose completed calibration PDF");
        calText("calibrationPdfFileMeta", "PDF only. Firebase Storage is used first, with a database fallback for smaller files.");
        calUpdateRecordActionState();
        return;
    }

    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        showToast("Only PDF files can be uploaded.", "error");
        const input = calEl("calibrationPdfInput");
        if (input) input.value = "";
        handleCalibrationPdfSelection();
        return;
    }

    calText("calibrationPdfFileName", file.name);
    calText("calibrationPdfFileMeta", `${calFormatBytes(file.size)} - ready to upload under ${calNormalizeCode(calEl("calEquipmentCode")?.value) || "the equipment code"}`);
    calUpdateRecordActionState();
}

function calAutofillLocationParts() {
    const location = calNormalizeText(calEl("calLocation")?.value);
    if (!location) return;

    const parsed = typeof parseLocationParts === "function"
        ? parseLocationParts(location)
        : { bldg: "", prod: "" };
    const tokens = location.split("-").map(value => value.trim()).filter(Boolean);

    if (!calNormalizeText(calEl("calBuilding")?.value)) {
        calSetInput("calBuilding", parsed.bldg === "N/A" ? (tokens[0] || "") : (parsed.bldg || tokens[0] || ""));
    }
    if (!calNormalizeText(calEl("calProduction")?.value)) {
        calSetInput("calProduction", parsed.prod === "N/A" ? (tokens[1] || "") : (parsed.prod || tokens[1] || ""));
    }
    if (!calNormalizeText(calEl("calProcessName")?.value) && tokens[2]) {
        calSetInput("calProcessName", tokens[2]);
    }
    if (!calNormalizeText(calEl("calStationLocation")?.value) && tokens.length > 3) {
        calSetInput("calStationLocation", tokens.slice(3).join("-"));
    }
}

function calInitializeModule() {
    calSetRegistrationMode(false, { badgeText: "No equipment", badgeTone: "neutral" });
    calSetInput("calIssuedOn", "");
    calSetInput("calIssuerName", "");
    calSetInput("calIssuerNo", "");
    calSetInput("calibrationDate", calTodayISO());
    calSetInput("calibrationInterval", 12);
    calSetInput("calFrequency", 12);
    calSetInput("calCalibrationCost", 0);
    calSetInput("calEquipmentStatus", "IN USE");
    calSetInput("calFunction", "ACTIVE");
    updateCalibrationNextDate();
    calUpdateConnectionUI();
    calUpdateModeUI();
    calUpdateRecordActionState();
    renderCalibrationHistory();

    calEl("calibrationScanInput")?.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            submitCalibrationCode();
        }
    });

    ["calibrationDate", "calibrationInterval"].forEach(id => {
        calEl(id)?.addEventListener("input", updateCalibrationNextDate);
        calEl(id)?.addEventListener("change", updateCalibrationNextDate);
    });

    calEl("calLocation")?.addEventListener("blur", calAutofillLocationParts);
    calEl("calEquipmentCode")?.addEventListener("blur", event => {
        event.target.value = calNormalizeCode(event.target.value);
        calUpdateRecordActionState();
    });

    calEl("calibrationEquipmentForm")?.addEventListener("input", () => {
        calUpdateRecordActionState();
        syncEquipmentToCalibrationTemplate({ silent: true, onlyIfReady: true });
    });

    calEl("calibrationPdfInput")?.addEventListener("change", handleCalibrationPdfSelection);
    calEl("calibrationTemplateFrame")?.addEventListener("load", handleCalibrationTemplateLoaded);
    calEl("calibrationCameraSelect")?.addEventListener("change", () => {
        if (calibrationQrCode) showToast("Stop and restart the camera to apply the selection.", "info");
    });

    window.addEventListener("message", event => {
        const frameWindow = calEl("calibrationTemplateFrame")?.contentWindow;
        if (event.source !== frameWindow) return;
        if (event.data?.type === "grid-template-ready" && event.data.template === calibrationTemplateType) {
            handleCalibrationTemplateLoaded();
        }
    });

    db.ref(".info/connected").on("value", snapshot => {
        isOnline = snapshot.val() === true;
        calUpdateConnectionUI();
    });
}

document.addEventListener("DOMContentLoaded", calInitializeModule);
