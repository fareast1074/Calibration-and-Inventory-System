/** Run: node tests/out-of-period.test.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'enhancements.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const fakeContext = {
    console,
    Date,
    Number,
    Set,
    Map,
    MONTH_ORDER: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
    masterDB: {},
    scanHistory: [],
    pendingUploads: [],
    rawMasterRows: [],
    loggedInUser: 'QA',
    escapeHtml: v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    encodeActionValue: encodeURIComponent,
    document: { addEventListener: () => {}, getElementById: () => null },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    window: { XLSX: {} },
    navigator: {}
};
vm.createContext(fakeContext);
vm.runInContext(app, fakeContext, { filename: 'enhancements.js' });
const evaluate = expression => vm.runInContext(expression, fakeContext);
const oct2026 = new Date('2026-10-14T08:00:00+08:00');
const dec2026 = new Date('2026-12-31T23:00:00+08:00');

for (const [date, due, expected] of [
    [oct2026, 'OCT-26', 'CURRENT_MONTH'],
    [oct2026, 'NOV-26', 'NEXT_MONTH'],
    [oct2026, 'DEC-26', 'OUT_OF_PERIOD'],
    [oct2026, 'SEP-26', 'OUT_OF_PERIOD'],
    [oct2026, 'JAN-27', 'OUT_OF_PERIOD'],
    [dec2026, 'DEC-26', 'CURRENT_MONTH'],
    [dec2026, 'JAN-27', 'NEXT_MONTH'],
    [dec2026, 'JAN-26', 'OUT_OF_PERIOD'],
    [dec2026, 'N/A', 'DUE_UNKNOWN'],
    [oct2026, 'bad data', 'DUE_UNKNOWN']
]) {
    const actual = fakeContext.v44ClassifyDue(due, date).scope;
    assert.equal(actual, expected, `reference=${date.toISOString()}, due=${due}`);
}
assert.equal(fakeContext.v44ClassifyDue('MAR-27', oct2026, true).scope, 'UNREGISTERED');
assert.equal(fakeContext.v44MonthWindow(dec2026).label, 'DEC-26 / JAN-27');
assert.equal(fakeContext.v44ClassifyDue('2027-01-19', dec2026).scope, 'NEXT_MONTH');
assert.equal(fakeContext.v44ClassifyDue('26-Oct', oct2026).scope, 'CURRENT_MONTH');

fakeContext.masterDB = {
    'IN': { name: 'Current month', bldg: 'A', prod: 'QC', status: 'InUse', due: 'OCT-26' },
    'OUT': { name: 'Extra scan', bldg: 'A', prod: 'QC', status: 'InUse', due: 'DEC-26' },
    'NONE': { name: 'Due not available', bldg: 'A', prod: 'QC', status: 'InUse', due: 'N/A' }
};
fakeContext.scanHistory = [
    { id: 1791950400000, barcode: 'IN', updatedDue: 'OCT-26', isUnregistered: false, isFail: false },
    { id: 1791950401000, barcode: 'OUT', updatedDue: 'DEC-26', isUnregistered: false, isFail: false, scanDateISO: '2026-10-14T03:00:00Z' },
    { id: 1791950402000, barcode: 'NONE', updatedDue: 'N/A', isUnregistered: false, isFail: true, scanDateISO: '2026-10-14T03:00:00Z' },
    { id: 1791950403000, barcode: 'UNREG', isUnregistered: true, updatedDue: 'N/A', isFail: true, scanDateISO: '2026-10-14T03:00:00Z' }
];
const noFilter = { buildings: [], productions: [], months: [], years: [], statuses: [] };
const results = fakeContext.v44VisibleExtraScans(noFilter);
assert.deepEqual(Array.from(results, r => r.barcode).sort(), ['NONE', 'OUT']);
const rows = fakeContext.v44ExtraScanRows(results);
assert.equal(rows.length, 3);
assert.equal(rows[0][4], 'DUE AT SCAN');
assert.equal(rows.find(row => row[1] === 'OUT')[6], 'Outside schedule');
assert.equal(rows.find(row => row[1] === 'NONE')[6], 'Due date unavailable');

// Date selection should not hide the exception list, but production/building do.
const filtered = fakeContext.v44VisibleExtraScans({ ...noFilter, months: ['OCT'], years: ['2026'] });
assert.equal(filtered.length, 2);
const filteredBuilding = fakeContext.v44VisibleExtraScans({ ...noFilter, buildings: ['B'] });
assert.equal(filteredBuilding.length, 0);

// Classification is preserved after the month rolls over or master due is changed.
const saved = { barcode: 'OUT', scanScope: 'OUT_OF_PERIOD', scanWindow: 'OCT-26 / NOV-26', scanDue: 'DEC-26', scanDateISO: '2026-10-14T03:00:00Z' };
fakeContext.masterDB.OUT.due = 'JAN-27';
assert.equal(fakeContext.v44ClassifyAudit(saved).scope, 'OUT_OF_PERIOD');
assert.equal(fakeContext.v44ClassifyAudit(saved).due, 'DEC-26');
assert.equal(fakeContext.v44ClassifyAudit({ barcode: 'OUT', id: 1791950401000, updatedDue: 'DEC-26', isUnregistered: false }).scope, 'OUT_OF_PERIOD');

for (const required of [
    'id="outOfPeriodSection"', 'id="outOfPeriodBody"', 'id="totalOutOfPeriod"',
    'data-view="outside"', 'v44ExportExtraCsv()', 'v44ExportExtraExcel()'
]) assert.ok(html.includes(required), `missing UI: ${required}`);
assert.ok(app.includes('scanScope: scanClassification.scope'));
assert.ok(app.includes('"Out of Period"'), 'Excel report should have a separate out-of-period sheet');
// Exercise the real save pathway in offline mode, not just the classifier.
(async () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 5);
    const futureDue = `${fakeContext.MONTH_ORDER[future.getMonth()]}-${String(future.getFullYear()).slice(-2)}`;
    fakeContext.scanHistory = [];
    fakeContext.pendingUploads = [];
    fakeContext.currentAuditEditRecord = null;
    fakeContext.currentItem = {
        barcode: 'VERIFY-EXTRA', name: 'Outside cycle meter', loc: 'A-QC',
        status: 'IN USE', due: futureDue, msa: 'NO', isUnregistered: false
    };
    fakeContext.selectedLoc = 'CORRECT';
    fakeContext.selectedStickerLoc = 'CORRECT';
    fakeContext.selectedDue = 'VALID';
    fakeContext.selectedMsa = 'NO';
    fakeContext.isOnline = false;
    fakeContext.overwriteMasterFieldsIfChanged = async () => ({
        locationUpdated: false, dueUpdated: false, statusUpdated: false
    });
    fakeContext.v2BuildRemarkSuggestion = () => '';
    fakeContext.updateVerificationState = () => {};
    fakeContext.v2SetLastScan = () => {};
    fakeContext.showToast = () => {};
    fakeContext.v2Feedback = () => {};
    fakeContext.updateDisplay = () => {};
    fakeContext.closeModal = () => {};
    const record = await fakeContext.v2SaveAuditRecord({ isMissing: false });
    assert.equal(record.scanScope, 'OUT_OF_PERIOD');
    assert.equal(record.scanDue, futureDue);
    assert.ok(record.scanDateISO.includes('T'));
    assert.equal(fakeContext.pendingUploads.length, 1);
    assert.equal(fakeContext.pendingUploads[0].scanScope, 'OUT_OF_PERIOD');
    console.log('PASS: date boundaries, saved classifications, filters, historical records, exports, and real offline audit save');
})().catch(error => { console.error(error); process.exitCode = 1; });
