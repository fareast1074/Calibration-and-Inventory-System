/** Run: node tests/equipment-actions.test.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'enhancements.js'), 'utf8');
const sourceScript = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const messages = [];
const writes = [];
const elements = new Map();
function el(id) {
    if (!elements.has(id)) {
        const attrs = new Map();
        elements.set(id, {
            id, value: '', textContent: '', disabled: false, hidden: false, required: false,
            classList: { add() {}, remove() {}, toggle() {} },
            setAttribute: (key, value) => attrs.set(key, value),
            removeAttribute: key => attrs.delete(key),
            getAttribute: key => attrs.get(key),
            focus() {},
            style: {}
        });
    }
    return elements.get(id);
}
let failure = false;
let sequence = 0;
const rawHeader = [
    'EQUIPMENT CODE', 'ISSUED ON', 'ISSUER NAME', 'ISSUER NO', 'EQUIPMENT NAME',
    'LOCATION', 'DUE DATE', 'STATUS', 'MSA', 'SERIAL NO', 'EQUIPMENT CLASS',
    'MAKER', 'MODEL', 'FUNCTION', 'AREA USED', 'BUILDING', 'PROD TYPE',
    'PROCESS NAME', 'STATION LOCATION', 'SECTION USE', 'CALIBRATED BY',
    'CALIBRATION COST', 'FREQUENCY', 'CALIBRATION DATE', 'DURATION', 'EXPIRED DATE',
    'CALIBRATION MONTH', 'CALIBRATION YEAR', 'CALIBRATION TEMPLATE'
];
const raw = new Array(rawHeader.length).fill('');
raw[0] = 'BEAE13-303'; raw[4] = 'INFRARED THERMOMETER'; raw[5] = 'B-CM-TECH';
raw[6] = 'NOV-26'; raw[7] = 'NEW'; raw[8] = 'No'; raw[25] = '2026-11-24';
const fake = {
    console, Date, Number, Map, Set,
    MONTH_ORDER: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
    masterDB: {'BEAE13-303': {name: 'INFRARED THERMOMETER', status: 'NEW', due: 'NOV-26', month: 'NOV', year: '2026', loc: 'B-CM-TECH', nextVerificationDate: '2026-11-24', expiredDate: '2026-11-24'}},
    rawMasterRows: [rawHeader, raw], scanHistory: [], pendingUploads: [],
    loggedInUser: 'QA Tester', currentAuditEditRecord: null,
    currentItem: {barcode: 'BEAE13-303', name: 'INFRARED THERMOMETER', status: 'NEW', due: 'NOV-26', loc: 'B-CM-TECH', isUnregistered: false},
    isOnline: true,
    document: { addEventListener() {}, getElementById: el },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { XLSX: {} }, navigator: {},
    db: { ref: (path) => path === 'audit_history' || path === 'equipment_change_log'
        ? {push: () => ({key: `test-key-${++sequence}`})}
        : path === undefined
            ? {update: async changes => { if (failure) throw Error('simulated Firebase failure'); writes.push(changes); }}
            : {update: async () => { throw Error('unexpected Firebase path'); }}
    },
    escapeHtml: value => String(value ?? '').replace(/[&<>'"]/g, m => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'}[m])),
    encodeActionValue: encodeURIComponent,
    normalizeEquipmentStatus: value => String(value || '').trim().toUpperCase(),
    v2SetLastScan() {}, v2Feedback() {}, updateVerificationState() {},
    rebuildFilters() {}, updateDisplay() {}, closeModal() {},
    showToast: value => messages.push(value)
};
vm.createContext(fake);
// Extract production header-based indexing functions, not mocked equivalents.
const start = sourceScript.indexOf('function getRawMasterFieldIndices() {');
const end = sourceScript.indexOf('\nfunction toggleMasterFieldEdit(field)', start);
assert.ok(start >= 0 && end > start);
vm.runInContext(sourceScript.slice(start, end), fake, {filename: 'script-functions.js'});
vm.runInContext(code, fake, {filename: 'enhancements.js'});
// The application defines its own host UI helpers; override them after loading
// so this test exercises persistence and validation without a browser DOM.
fake.showToast = value => messages.push(value);
fake.updateVerificationState = () => {};
fake.v2SetLastScan = () => {};
fake.v2Feedback = () => {};
fake.closeModal = () => {};
fake.updateDisplay = () => {};

const get = js => vm.runInContext(js, fake);
const check = (date, today) => fake.v45CheckNextCalDate(date, today);
assert.equal(check('', new Date(2026, 10, 19)).valid, false);
assert.equal(check('2026-11-19', new Date(2026, 10, 19)).valid, false);
assert.equal(check('2026-11-20', new Date(2026, 10, 19)).valid, true);
assert.equal(check('2027-02-29', new Date(2026, 10, 19)).valid, false);
assert.equal(check('2028-02-29', new Date(2026, 10, 19)).valid, true);
assert.equal(check('2027-01-20', new Date(2026, 10, 19)).due, 'JAN-27');
assert.equal(check('2026-12-05', new Date(2026, 10, 19)).due, 'DEC-26');
assert.equal(check('2100-01-20', new Date(2026, 10, 19)).valid, false);
assert.equal(fake.getRawMasterFieldIndices().due, 6);
assert.equal(fake.getRawMasterFieldIndices().status, 7);
assert.equal(fake.getRawMasterFieldIndices().nextVerificationDate, 25);

for (const required of [
    'id="btnMarkBroken"', 'id="btnMarkDoneCal"', 'id="equipmentActionModal"',
    'id="equipmentActionNextDate"', 'type="date" required',
    'onclick="v45SaveEquipmentAction()"'
]) assert.ok(html.includes(required), `Missing required UI: ${required}`);
assert.ok(css.includes('.btn-equipment-broken'));
assert.ok(css.includes('.btn-equipment-done'));

(async () => {
    fake.v45OpenEquipmentAction('DONE_CAL');
    assert.equal(el('equipmentActionNextDateBlock').hidden, false);
    assert.equal(el('equipmentActionNextDate').value, '');
    assert.equal(el('btnSaveEquipmentAction').disabled, true, 'Do not allow Done Cal without next date');

    await fake.v45SaveEquipmentAction();
    assert.equal(writes.length, 0, 'No date should never save');
    el('equipmentActionNextDate').value = '2020-10-03';
    fake.v45ValidateActionDateUI();
    assert.equal(el('btnSaveEquipmentAction').disabled, true, 'Past date cannot save');

    el('equipmentActionNextDate').value = '2027-12-08';
    fake.v45ValidateActionDateUI();
    assert.equal(el('btnSaveEquipmentAction').disabled, false);
    await fake.v45SaveEquipmentAction();
    assert.equal(writes.length, 1);
    const done = writes[0];
    assert.equal(done['master_list/masterDB/BEAE13-303/status'], 'COMPLETED');
    assert.equal(done['master_list/masterDB/BEAE13-303/due'], 'DEC-27');
    assert.equal(done['master_list/masterDB/BEAE13-303/month'], 'DEC');
    assert.equal(done['master_list/masterDB/BEAE13-303/year'], '2027');
    assert.equal(done['master_list/masterDB/BEAE13-303/nextCalibrationDate'], '2027-12-08');
    assert.equal(done['master_list/masterDB/BEAE13-303/nextVerificationDate'], '2027-12-08');
    assert.equal(done['master_list/rawMasterRows/1/7'], 'COMPLETED');
    assert.equal(done['master_list/rawMasterRows/1/6'], 'DEC-27');
    assert.equal(done['master_list/rawMasterRows/1/25'], '2027-12-08');
    assert.equal(done['audit_history/test-key-1'].equipmentAction, 'DONE_CAL');
    assert.equal(done['audit_history/test-key-1'].nextCalibrationDate, '2027-12-08');
    assert.equal(done['audit_history/test-key-1'].scanDue, 'NOV-26', 'Classify on OLD due at action time');
    assert.equal(fake.masterDB['BEAE13-303'].due, 'DEC-27');
    assert.equal(fake.rawMasterRows[1][25], '2027-12-08');
    assert.equal(fake.rawMasterRows[1][4], 'INFRARED THERMOMETER', 'Unrelated raw master columns must not be overwritten');
    assert.equal(fake.v2AuditCategory(fake.scanHistory[0]), 'DONE CAL');
    assert.equal(fake.v2IsPassedAudit(fake.scanHistory[0]), false, 'Done Cal is not unverified PASS');
    const doneReport = fake.v2BuildReportData(false);
    assert.equal(doneReport.doneCalRows.length, 2, 'Done Cal gets its own report worksheet');
    assert.equal(doneReport.passedRows.length, 1, 'Done Cal is not counted as verified PASS');
    assert.equal(doneReport.allRows[1][14], '2027-12-08', 'Exact next date is exported');
    assert.equal(doneReport.summaryRows.find(row => row[0] === 'Scanned')[1], 1, 'Completed calibration counts as scanned');
    assert.equal(fake.v2EquipmentExportStatus(fake.scanHistory[0]), 'DONE CAL');

    fake.currentItem = {barcode:'BEAE13-303', name: 'INFRARED THERMOMETER', status: 'COMPLETED', due: 'DEC-27', loc:'B-CM-TECH', isUnregistered:false};
    fake.v45OpenEquipmentAction('BROKEN');
    assert.equal(el('equipmentActionNextDateBlock').hidden, true);
    assert.equal(el('btnSaveEquipmentAction').disabled, true, 'Broken requires a remark');
    el('equipmentActionRemark').value = 'Wiring damaged; no output reading';
    fake.v45ValidateActionDateUI();
    assert.equal(el('btnSaveEquipmentAction').disabled, false);
    await fake.v45SaveEquipmentAction();
    assert.equal(writes.length, 2);
    const broken = writes[1];
    assert.equal(broken['master_list/masterDB/BEAE13-303/status'], 'BROKEN');
    assert.equal(Object.hasOwn(broken,'master_list/masterDB/BEAE13-303/due'), false, 'Broken leaves due unchanged');
    assert.equal(broken['audit_history/test-key-3'].auditStatus, 'BROKEN');
    assert.equal(broken['audit_history/test-key-3'].operatorRemark, 'Wiring damaged; no output reading');
    assert.equal(broken['equipment_change_log/test-key-4'].remark, 'Wiring damaged; no output reading');
    assert.equal(broken['audit_history/test-key-3'].previousDue, 'DEC-27');
    assert.equal(fake.v2IsAbnormalAudit(fake.scanHistory[0]), true);
    const brokenReport = fake.v2BuildReportData(false);
    assert.equal(brokenReport.abnormalRows.length, 2, 'Broken is counted in abnormal summary');
    assert.equal(brokenReport.doneCalRows.length, 1, 'The latest category is Broken');
    assert.equal(fake.v2EquipmentExportStatus(fake.scanHistory[0]), 'BROKEN');
    assert.equal(fake.rawMasterRows[1][6], 'DEC-27', 'Broken preserves due in raw master');

    fake.isOnline = false;
    fake.currentItem = {...fake.currentItem, status:'BROKEN'};
    fake.v45OpenEquipmentAction('BROKEN');
    assert.equal(writes.length, 2, 'Offline cannot commit master status');
    assert.equal(get('v45EquipmentAction'), null, 'Offline does not open write dialog');
    fake.isOnline = true;

    fake.v45OpenEquipmentAction('BROKEN');
    el('equipmentActionRemark').value = 'Broken cable identified';
    fake.v45ValidateActionDateUI();
    failure = true;
    await fake.v45SaveEquipmentAction();
    assert.equal(writes.length, 2, 'Failed cloud write does not persist new master');
    assert.equal(fake.masterDB['BEAE13-303'].status, 'BROKEN');
    assert.equal(fake.scanHistory.length, 2);
    assert.equal(get('v45ActionSaving'), false, 'UI unlocked after save failure');
    assert.ok(messages.some(message => message.includes('simulated Firebase failure')));
    failure = false;

    fake.rawMasterRows = [
        ['CODE','NAME','LOCATION','DUE','STATUS','MSA'],
        ['OLD-001','Old equipment','A-TEST','JAN-26','NEW','No']
    ];
    assert.equal(fake.getRawMasterFieldIndices().due, 3);
    assert.equal(fake.getRawMasterFieldIndices().status, 4);
    fake.updateRawMasterFields('OLD-001', null, 'FEB-27', 'BROKEN');
    assert.equal(fake.rawMasterRows[1][3], 'FEB-27');
    assert.equal(fake.rawMasterRows[1][4], 'BROKEN');
    console.log('PASS: required future dates, Done Cal master and audit atomic paths, Broken, no unrelated writes, offline/failed saves, modern/legacy raw rows');
})().catch(error => {console.error(error); process.exitCode = 1;});
