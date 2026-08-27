/**
 * GRID V4.3 Inventory SQLite sync / backup / restore module
 * Creates and reads a portable SQLite database in the browser using sql.js.
 * The SQLite file contains GRID master data, raw master rows, and inventory audits.
 * Legacy calibration tables remain readable for backward-compatible restore only; PDF binary payloads are excluded.
 */
(() => {
    'use strict';

    const GRID_SQL_SCHEMA_VERSION = '1';
    const GRID_SQL_APP_VERSION = '4.3';
    const SQL_WASM_CDN = 'https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/sql-wasm.wasm';
    let sqlJsPromise = null;
    let sqlBusy = false;

    const el = id => document.getElementById(id);

    function sqlToast(message, type = 'info', duration = 4200) {
        if (typeof showToast === 'function') {
            showToast(message, type, duration);
        } else {
            alert(message);
        }
    }

    function requireDeveloper(action) {
        if (typeof isDeveloperMode === 'function' && isDeveloperMode()) return true;
        if (typeof showAccessDenied === 'function') showAccessDenied(action);
        else sqlToast(`${action} is available in Developer Mode only.`, 'error');
        return false;
    }

    function setSqlStatus(message, state = '') {
        const node = el('sqlBackupStatus');
        if (!node) return;
        node.textContent = message || '';
        node.dataset.state = state || '';
    }

    function setSqlButtonsDisabled(disabled) {
        ['downloadSqliteButton', 'uploadSqliteButton'].forEach(id => {
            const button = el(id);
            if (button) button.disabled = Boolean(disabled);
        });
    }

    async function getSqlJs() {
        if (window.SQL && window.SQL.Database) return window.SQL;
        if (sqlJsPromise) return sqlJsPromise;
        if (typeof window.initSqlJs !== 'function') {
            throw new Error('SQLite engine could not be loaded. Check the internet connection and reload GRID.');
        }
        sqlJsPromise = window.initSqlJs({ locateFile: filename => filename.endsWith('.wasm') ? SQL_WASM_CDN : filename });
        const SQL = await sqlJsPromise;
        window.SQL = SQL;
        return SQL;
    }

    function jsonText(value) {
        try { return JSON.stringify(value ?? null); }
        catch (error) { return JSON.stringify({ error: 'Unable to serialize record' }); }
    }

    function safeJsonParse(text, fallback = null) {
        try { return JSON.parse(String(text ?? '')); }
        catch (error) { return fallback; }
    }

    function displayValue(value) {
        return value === null || value === undefined ? '' : String(value);
    }

    function firstValue(object, keys) {
        for (const key of keys) {
            const value = object?.[key];
            if (value !== undefined && value !== null && String(value).trim() !== '') return value;
        }
        return '';
    }

    function fileTimestamp() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    }

    function downloadBytes(bytes, filename, mimeType) {
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    }

    function sqliteInsert(db, sql, values) {
        const stmt = db.prepare(sql);
        try { stmt.run(values); }
        finally { stmt.free(); }
    }

    async function fetchBackupData() {
        if (typeof db === 'undefined' || !db) throw new Error('Firebase database is not available.');
        const [masterSnap, auditSnap, calibrationSnap] = await Promise.all([
            db.ref('master_list').once('value'),
            db.ref('audit_history').once('value'),
            db.ref('calibration_records').once('value')
        ]);
        return {
            master: masterSnap.val() || {},
            audits: auditSnap.val() || {},
            calibrations: calibrationSnap.val() || {}
        };
    }

    async function downloadGridSQLite() {
        if (!requireDeveloper('Download SQLite backup') || sqlBusy) return;
        if (typeof isOnline !== 'undefined' && !isOnline) {
            sqlToast('Connect to Firebase before creating the SQLite backup.', 'error');
            return;
        }

        sqlBusy = true;
        setSqlButtonsDisabled(true);
        setSqlStatus('Reading Firebase data...', 'working');

        try {
            const [SQL, source] = await Promise.all([getSqlJs(), fetchBackupData()]);
            const database = new SQL.Database();

            database.run(`
                PRAGMA journal_mode=OFF;
                CREATE TABLE grid_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE equipment_master (
                    equipment_code TEXT PRIMARY KEY,
                    equipment_name TEXT,
                    serial_no TEXT,
                    location TEXT,
                    building TEXT,
                    prod_type TEXT,
                    due_date TEXT,
                    status TEXT,
                    msa TEXT,
                    calibrated_by TEXT,
                    data_json TEXT NOT NULL
                );
                CREATE TABLE master_rows (
                    row_index INTEGER PRIMARY KEY,
                    row_json TEXT NOT NULL
                );
                CREATE TABLE audit_history (
                    cloud_id TEXT PRIMARY KEY,
                    barcode TEXT,
                    audit_status TEXT,
                    auditor TEXT,
                    scan_time INTEGER,
                    data_json TEXT NOT NULL
                );
                CREATE TABLE calibration_records (
                    firebase_code_key TEXT NOT NULL,
                    equipment_code TEXT,
                    record_id TEXT NOT NULL,
                    calibration_date TEXT,
                    next_verification_date TEXT,
                    template_type TEXT,
                    result TEXT,
                    data_json TEXT NOT NULL,
                    PRIMARY KEY (firebase_code_key, record_id)
                );
                CREATE INDEX idx_audit_barcode ON audit_history(barcode);
                CREATE INDEX idx_calibration_equipment ON calibration_records(equipment_code);
            `);

            const meta = {
                schema_version: GRID_SQL_SCHEMA_VERSION,
                app_version: GRID_SQL_APP_VERSION,
                exported_at: new Date().toISOString(),
                exported_by: typeof loggedInUser === 'string' ? loggedInUser : '',
                project_id: 'inventory-88cdd',
                pdf_binary_included: 'no'
            };
            Object.entries(meta).forEach(([key, value]) => {
                sqliteInsert(database, 'INSERT INTO grid_meta(key, value) VALUES (?, ?)', [key, displayValue(value)]);
            });

            const sourceMasterDB = source.master.masterDB || {};
            Object.entries(sourceMasterDB).forEach(([code, item]) => {
                const normalizedCode = String(code || '').toUpperCase();
                sqliteInsert(database, `INSERT INTO equipment_master(
                    equipment_code,equipment_name,serial_no,location,building,prod_type,due_date,status,msa,calibrated_by,data_json
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
                    normalizedCode,
                    displayValue(firstValue(item, ['name', 'equipmentName'])),
                    displayValue(firstValue(item, ['serialNo', 'serial', 'serial_no'])),
                    displayValue(firstValue(item, ['loc', 'location'])),
                    displayValue(firstValue(item, ['bldg', 'building'])),
                    displayValue(firstValue(item, ['prod', 'prodType', 'production'])),
                    displayValue(firstValue(item, ['due', 'expiredDate'])),
                    displayValue(firstValue(item, ['status'])),
                    displayValue(firstValue(item, ['msa'])),
                    displayValue(firstValue(item, ['calby', 'calibratedBy'])),
                    jsonText(item)
                ]);
            });

            const rows = Array.isArray(source.master.rawMasterRows) ? source.master.rawMasterRows : [];
            rows.forEach((row, index) => {
                sqliteInsert(database, 'INSERT INTO master_rows(row_index, row_json) VALUES (?, ?)', [index, jsonText(row)]);
            });

            Object.entries(source.audits || {}).forEach(([cloudId, record]) => {
                const value = record || {};
                sqliteInsert(database, `INSERT INTO audit_history(cloud_id,barcode,audit_status,auditor,scan_time,data_json)
                    VALUES (?,?,?,?,?,?)`, [
                    String(cloudId),
                    displayValue(value.barcode),
                    displayValue(value.auditStatus || (value.isMissing ? 'MISSING' : value.isFail ? 'ABNORMAL' : 'PASS')),
                    displayValue(value.auditor || value.user || value.scannedBy),
                    Number(value.id || value.timestamp || value.time || 0) || 0,
                    jsonText({ ...value, cloudId: value.cloudId || cloudId })
                ]);
            });

            Object.entries(source.calibrations || {}).forEach(([firebaseCodeKey, records]) => {
                Object.entries(records || {}).forEach(([recordId, record]) => {
                    const value = record || {};
                    sqliteInsert(database, `INSERT INTO calibration_records(
                        firebase_code_key,equipment_code,record_id,calibration_date,next_verification_date,template_type,result,data_json
                    ) VALUES (?,?,?,?,?,?,?,?)`, [
                        String(firebaseCodeKey),
                        displayValue(value.equipmentCode || value.code),
                        String(recordId),
                        displayValue(value.calibrationDate || value.verificationDate || value.date),
                        displayValue(value.nextVerificationDate || value.nextCalibration || value.expiredDate),
                        displayValue(value.templateType || value.equipmentType || value.template),
                        displayValue(value.result || value.totalJudgment || value.status),
                        jsonText(value)
                    ]);
                });
            });

            const counts = {
                equipment: Object.keys(sourceMasterDB).length,
                audits: Object.keys(source.audits || {}).length,
                calibration: Object.values(source.calibrations || {}).reduce((sum, records) => sum + Object.keys(records || {}).length, 0)
            };
            const binary = database.export();
            database.close();

            downloadBytes(binary, `GRID_Backup_${fileTimestamp()}.sqlite`, 'application/vnd.sqlite3');
            setSqlStatus(`Downloaded: ${counts.equipment} equipment, ${counts.audits} audits, ${counts.calibration} calibration records.`, 'success');
            sqlToast('SQLite backup downloaded successfully.', 'success');
        } catch (error) {
            console.error('SQLite backup failed', error);
            setSqlStatus(error.message || 'SQLite backup failed.', 'error');
            sqlToast(error.message || 'Unable to create SQLite backup.', 'error', 5600);
        } finally {
            sqlBusy = false;
            setSqlButtonsDisabled(false);
        }
    }

    function tableExists(database, tableName) {
        const stmt = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1");
        try {
            stmt.bind([tableName]);
            return stmt.step();
        } finally { stmt.free(); }
    }

    function readRows(database, sql) {
        const stmt = database.prepare(sql);
        const rows = [];
        try {
            while (stmt.step()) rows.push(stmt.getAsObject());
        } finally { stmt.free(); }
        return rows;
    }

    const FIREBASE_RAW_HEADERS = [
        "EQUIPMENT CODE", "ISSUED ON", "ISSUER NAME", "ISSUER NO", "EQUIPMENT NAME",
        "LOCATION", "DUE DATE", "STATUS", "MSA", "SERIAL NO", "EQUIPMENT CLASS",
        "MAKER", "MODEL", "FUNCTION", "AREA USED", "BUILDING", "PROD TYPE",
        "PROCESS NAME", "STATION LOCATION", "SECTION USE", "CALIBRATED BY",
        "CALIBRATION COST", "FREQUENCY", "CALIBRATION DATE", "DURATION",
        "EXPIRED DATE", "CALIBRATION MONTH", "CALIBRATION YEAR", "CALIBRATION TEMPLATE"
    ];

    const MONTH_NAMES = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

    function tableColumns(database, tableName) {
        if (!tableExists(database, tableName)) return new Set();
        return new Set(readRows(database, `PRAGMA table_info("${String(tableName).replace(/"/g, '""')}")`)
            .map(row => String(row.name || '').toLowerCase()));
    }

    function readScalar(database, sql, fallback = 0) {
        const rows = readRows(database, sql);
        if (!rows.length) return fallback;
        const first = rows[0];
        const key = Object.keys(first)[0];
        return key ? first[key] : fallback;
    }

    function cleanText(value) {
        return value === null || value === undefined ? '' : String(value).trim();
    }

    function valueFromSources(row, metadata, rowKeys, metadataKeys = rowKeys) {
        const rowValue = firstValue(row, rowKeys);
        if (cleanText(rowValue)) return rowValue;
        return firstValue(metadata, metadataKeys);
    }

    function normalizeIsoDate(value) {
        const text = cleanText(value);
        if (!text) return '';
        const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) {
            const date = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`);
            if (!Number.isNaN(date.getTime())) return `${iso[1]}-${iso[2]}-${iso[3]}`;
        }
        const date = new Date(text);
        if (Number.isNaN(date.getTime())) return '';
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
    }

    function monthInfoFromIso(value) {
        const iso = normalizeIsoDate(value);
        if (!iso) return { due: 'N/A', month: 'N/A', year: 'N/A' };
        const parts = iso.split('-').map(Number);
        const month = MONTH_NAMES[parts[1] - 1] || 'N/A';
        const year = String(parts[0]);
        return { due: `${month}-${year.slice(-2)}`, month, year };
    }

    function parseMonthCount(value) {
        if (value === null || value === undefined || cleanText(value) === '') return '';
        if (typeof value === 'number' && Number.isFinite(value)) {
            const number = Math.round(value);
            return number >= 1 && number <= 120 ? number : '';
        }
        const match = cleanText(value).match(/\d+/);
        if (!match) return '';
        const number = Number(match[0]);
        return Number.isInteger(number) && number >= 1 && number <= 120 ? number : '';
    }

    function normalizeExternalClass(value) {
        const raw = cleanText(value);
        const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (compact === 'MASTERSTANDARD') return 'MASTER STANDARD';
        if (compact === 'ORDINARY1STCLASS' || compact === 'ORDINARYFIRSTCLASS' || compact === 'ORIDNARY1STCLASS' || compact === 'ORDINANRY1STCLASS') return 'ORDINARY 1ST CLASS';
        if (compact === 'ORDINARY2NDCLASS' || compact === 'ORDINARYSECONDCLASS' || compact === 'ORDINANRY2NDCLASS') return 'ORDINARY 2ND CLASS';
        return raw;
    }

    function buildFirebaseEquipmentFromCalibrationDashboard(row) {
        const metadata = safeJsonParse(row.metadata_json, {}) || {};
        const code = cleanText(valueFromSources(row, metadata, ['equipment_code'], ['equipmentCode'])).toUpperCase();
        if (!code) return null;

        const calibrationDate = normalizeIsoDate(valueFromSources(row, metadata, ['latest_cal_date'], ['latestCalDate', 'calibrationDate']));
        const nextVerificationDate = normalizeIsoDate(valueFromSources(row, metadata, ['expiry_date'], ['expiryDate', 'nextVerificationDate']));
        const dueInfo = monthInfoFromIso(nextVerificationDate);
        const intervalMonths = parseMonthCount(valueFromSources(row, metadata, ['calibration_interval'], ['calibrationInterval', 'durationMonths', 'duration']));
        const frequencyMonths = parseMonthCount(valueFromSources(row, metadata, ['frequency'], ['frequency'])) || intervalMonths;
        const location = cleanText(valueFromSources(row, metadata, ['location'], ['location'])) ||
            cleanText(valueFromSources(row, metadata, ['area_used'], ['areaUsed'])) || 'N/A';
        const areaUsed = cleanText(valueFromSources(row, metadata, ['area_used'], ['areaUsed'])) || location;
        const building = cleanText(valueFromSources(row, metadata, ['building'], ['building'])) || (location.split('-')[0] || 'N/A');
        const prodType = cleanText(valueFromSources(row, metadata, ['product_type'], ['productType'])) || 'N/A';
        const section = cleanText(valueFromSources(row, metadata, ['section_code'], ['sectionCode', 'sectionUse', 'section']));
        const calibratedBy = cleanText(valueFromSources(row, metadata, ['calibrated_by'], ['calibratedBy']));
        const costRaw = valueFromSources(row, metadata, ['calibration_cost'], ['calibrationCost']);
        const costNumber = Number(costRaw);
        const calibrationCost = cleanText(costRaw) !== '' && Number.isFinite(costNumber) ? costNumber : '';
        const calibrationParts = calibrationDate ? calibrationDate.split('-').map(Number) : [];

        const result = {
            issuedOn: normalizeIsoDate(valueFromSources(row, metadata, ['issued_on'], ['issuedOn'])),
            issuerName: cleanText(valueFromSources(row, metadata, ['issuer_name'], ['issuerName'])),
            issuerNo: cleanText(valueFromSources(row, metadata, ['issuer_no'], ['issuerNo'])),
            name: cleanText(valueFromSources(row, metadata, ['equipment_name'], ['equipmentName'])) || 'UNKNOWN',
            serialNo: cleanText(valueFromSources(row, metadata, ['serial_no'], ['serialNo'])),
            className: normalizeExternalClass(valueFromSources(row, metadata, ['equipment_class'], ['equipmentClass', 'className'])),
            maker: cleanText(valueFromSources(row, metadata, ['maker_name'], ['makerName', 'maker'])),
            modelNo: cleanText(valueFromSources(row, metadata, ['model_no'], ['modelNo'])),
            status: cleanText(valueFromSources(row, metadata, ['status'], ['status'])) || 'N/A',
            functionName: cleanText(valueFromSources(row, metadata, ['equipment_function'], ['equipmentFunction', 'functionName'])),
            areaUsed,
            loc: location,
            bldg: building,
            prod: prodType,
            prodType,
            processName: cleanText(valueFromSources(row, metadata, ['process'], ['process', 'processName'])),
            stationLocation: cleanText(valueFromSources(row, metadata, ['station_location'], ['stationLocation'])),
            section,
            sectionUse: section,
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
            calibrationMonth: calibrationParts.length === 3 ? String(calibrationParts[1]) : '',
            calibrationYear: calibrationParts.length === 3 ? String(calibrationParts[0]) : '',
            due: dueInfo.due,
            month: dueInfo.month,
            year: dueInfo.year
        };

        const msa = cleanText(firstValue(metadata, ['msa', 'MSA']));
        if (msa) result.msa = msa;
        const templateType = cleanText(firstValue(metadata, ['calibrationTemplateType', 'templateType']));
        if (templateType) result.calibrationTemplateType = templateType;
        return { code, record: result };
    }

    function canonicalRawRow(code, item) {
        const value = key => item?.[key] ?? '';
        return [
            code,
            value('issuedOn'), value('issuerName'), value('issuerNo'), value('name'), value('loc'), value('due'),
            value('status'), value('msa') || 'N/A', value('serialNo'), value('className'), value('maker'), value('modelNo'),
            value('functionName'), value('areaUsed'), value('bldg'), value('prodType') || value('prod'), value('processName'),
            value('stationLocation'), value('sectionUse') || value('section'), value('calibratedBy'), value('calibrationCost'),
            value('frequencyMonths') || value('frequency'), value('calibrationDate'), value('intervalMonths') || value('durationMonths') || value('duration'),
            value('expiredDate') || value('nextVerificationDate'), value('calibrationMonth'), value('calibrationYear'), value('calibrationTemplateType')
        ];
    }

    function canonicalRawRowsFromMaster(master) {
        const rows = [FIREBASE_RAW_HEADERS.slice()];
        Object.keys(master || {}).sort().forEach(code => rows.push(canonicalRawRow(code, master[code] || {})));
        return rows;
    }

    function mergeExternalEquipment(currentRecord, incomingRecord) {
        const merged = { ...(currentRecord || {}) };
        Object.entries(incomingRecord || {}).forEach(([key, value]) => {
            if (value === undefined || value === null) return;
            if (typeof value === 'string' && value.trim() === '') {
                if (!(key in merged)) merged[key] = '';
                return;
            }
            merged[key] = value;
        });
        if (!cleanText(merged.msa)) merged.msa = 'N/A';
        if (!cleanText(merged.loc)) merged.loc = 'N/A';
        if (!cleanText(merged.bldg)) merged.bldg = 'N/A';
        if (!cleanText(merged.prod) && cleanText(merged.prodType)) merged.prod = merged.prodType;
        if (!cleanText(merged.prodType) && cleanText(merged.prod)) merged.prodType = merged.prod;
        return merged;
    }

    function parseCalibrationDashboardSQLite(database) {
        const columns = tableColumns(database, 'equipment_master');
        const requiredColumns = ['equipment_code', 'equipment_name'];
        const missingColumns = requiredColumns.filter(name => !columns.has(name));
        if (missingColumns.length) throw new Error(`Unsupported SQLite equipment table. Missing column: ${missingColumns.join(', ')}.`);

        const importedMasterDB = {};
        const equipmentRows = readRows(database, 'SELECT * FROM equipment_master ORDER BY equipment_code');
        equipmentRows.forEach(row => {
            const mapped = buildFirebaseEquipmentFromCalibrationDashboard(row);
            if (mapped) importedMasterDB[mapped.code] = mapped.record;
        });

        let sourceSchemaVersion = '';
        if (tableExists(database, 'app_metadata')) {
            const rows = readRows(database, "SELECT key, value FROM app_metadata WHERE key='schema_version' LIMIT 1");
            sourceSchemaVersion = rows.length ? cleanText(rows[0].value) : '';
        }
        const reportCount = tableExists(database, 'calibration_reports')
            ? Number(readScalar(database, 'SELECT COUNT(*) AS count FROM calibration_reports', 0)) || 0
            : 0;

        return {
            sourceType: 'calibration-dashboard',
            meta: {
                source_type: 'CalibrationDashboard Python SQLite',
                source_schema_version: sourceSchemaVersion,
                pdf_binary_included: 'ignored-on-firebase-sync'
            },
            masterDB: importedMasterDB,
            rawMasterRows: canonicalRawRowsFromMaster(importedMasterDB),
            audits: {},
            calibrations: {},
            counts: {
                equipment: Object.keys(importedMasterDB).length,
                audits: 0,
                calibration: 0,
                rawRows: Object.keys(importedMasterDB).length + 1,
                sourceReports: reportCount
            }
        };
    }

    function parseSQLiteBackup(database) {
        const required = ['grid_meta', 'equipment_master', 'audit_history', 'calibration_records'];
        const missing = required.filter(name => !tableExists(database, name));
        if (missing.length) throw new Error(`This is not a GRID SQLite backup. Missing table: ${missing.join(', ')}.`);

        const metaRows = readRows(database, 'SELECT key, value FROM grid_meta');
        const meta = Object.fromEntries(metaRows.map(row => [String(row.key), String(row.value)]));
        if (meta.schema_version !== GRID_SQL_SCHEMA_VERSION) {
            throw new Error(`Unsupported GRID SQLite schema version: ${meta.schema_version || 'unknown'}.`);
        }

        const equipmentRows = readRows(database, 'SELECT * FROM equipment_master ORDER BY equipment_code');
        const auditRows = readRows(database, 'SELECT * FROM audit_history ORDER BY cloud_id');
        const calibrationRows = readRows(database, 'SELECT * FROM calibration_records ORDER BY firebase_code_key, record_id');
        const rawRows = tableExists(database, 'master_rows')
            ? readRows(database, 'SELECT row_json FROM master_rows ORDER BY row_index').map(row => safeJsonParse(row.row_json, [])).filter(Array.isArray)
            : [];

        const importedMasterDB = {};
        equipmentRows.forEach(row => {
            const code = String(row.equipment_code || '').trim().toUpperCase();
            if (!code) return;
            const parsed = safeJsonParse(row.data_json, null);
            importedMasterDB[code] = parsed && typeof parsed === 'object' ? parsed : {
                name: row.equipment_name || 'UNKNOWN',
                serialNo: row.serial_no || '',
                loc: row.location || 'N/A',
                bldg: row.building || 'N/A',
                prod: row.prod_type || 'N/A',
                due: row.due_date || 'N/A',
                status: row.status || 'N/A',
                msa: row.msa || 'N/A',
                calby: row.calibrated_by || ''
            };
        });

        const importedAudits = {};
        auditRows.forEach(row => {
            const cloudId = String(row.cloud_id || '').trim();
            if (!cloudId) return;
            const parsed = safeJsonParse(row.data_json, null);
            const record = parsed && typeof parsed === 'object' ? parsed : {
                barcode: row.barcode || '',
                auditStatus: row.audit_status || '',
                auditor: row.auditor || '',
                id: Number(row.scan_time || 0) || 0
            };
            record.cloudId = record.cloudId || cloudId;
            importedAudits[cloudId] = record;
        });

        const importedCalibrations = {};
        calibrationRows.forEach(row => {
            const originalKey = String(row.firebase_code_key || '').trim();
            const equipmentCode = String(row.equipment_code || '').trim();
            const codeKey = originalKey || (typeof calFirebaseKey === 'function' ? calFirebaseKey(equipmentCode) : equipmentCode);
            const recordId = String(row.record_id || '').trim();
            if (!codeKey || !recordId) return;
            const parsed = safeJsonParse(row.data_json, null);
            const record = parsed && typeof parsed === 'object' ? parsed : {
                equipmentCode,
                calibrationDate: row.calibration_date || '',
                nextVerificationDate: row.next_verification_date || '',
                templateType: row.template_type || '',
                result: row.result || ''
            };
            if (!importedCalibrations[codeKey]) importedCalibrations[codeKey] = {};
            importedCalibrations[codeKey][recordId] = record;
        });

        return {
            sourceType: 'grid-backup',
            meta,
            masterDB: importedMasterDB,
            rawMasterRows: rawRows,
            audits: importedAudits,
            calibrations: importedCalibrations,
            counts: {
                equipment: Object.keys(importedMasterDB).length,
                audits: Object.keys(importedAudits).length,
                calibration: calibrationRows.length,
                rawRows: rawRows.length
            }
        };
    }

    function parseSQLiteSource(database) {
        const gridTables = ['grid_meta', 'equipment_master', 'audit_history', 'calibration_records'];
        if (gridTables.every(name => tableExists(database, name))) return parseSQLiteBackup(database);

        const equipmentColumns = tableColumns(database, 'equipment_master');
        if (equipmentColumns.has('equipment_code') && equipmentColumns.has('equipment_name')) {
            return parseCalibrationDashboardSQLite(database);
        }
        throw new Error('Unsupported SQLite file. Upload a GRID backup or a CalibrationDashboard Python SQLite database.');
    }

    function normalizeHeader(value) {
        return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    function mergeRawMasterRows(currentRows, incomingRows) {
        if (!Array.isArray(incomingRows) || !incomingRows.length) return Array.isArray(currentRows) ? currentRows : [];
        if (!Array.isArray(currentRows) || !currentRows.length) return incomingRows;

        const currentHeader = Array.isArray(currentRows[0]) ? currentRows[0] : [];
        const incomingHeader = Array.isArray(incomingRows[0]) ? incomingRows[0] : [];
        const mergedHeader = [...currentHeader];
        const headerIndex = new Map(mergedHeader.map((name, index) => [normalizeHeader(name), index]));
        incomingHeader.forEach(name => {
            const key = normalizeHeader(name);
            if (!headerIndex.has(key)) {
                headerIndex.set(key, mergedHeader.length);
                mergedHeader.push(name);
            }
        });

        const codeAliases = new Set(['EQUIPMENTCODE', 'EQUIPCODE', 'CODE']);
        const findCodeIndex = header => header.findIndex(name => codeAliases.has(normalizeHeader(name)));
        const currentCodeIndex = findCodeIndex(currentHeader);
        const incomingCodeIndex = findCodeIndex(incomingHeader);
        if (currentCodeIndex < 0 || incomingCodeIndex < 0) return incomingRows;

        const rowMap = new Map();
        const addRows = (rows, header, codeIndex) => {
            const map = header.map(name => headerIndex.get(normalizeHeader(name)));
            rows.slice(1).forEach(row => {
                if (!Array.isArray(row)) return;
                const code = String(row[codeIndex] ?? '').trim().toUpperCase();
                if (!code) return;
                const merged = rowMap.get(code) || new Array(mergedHeader.length).fill('');
                row.forEach((value, index) => {
                    const target = map[index];
                    if (target !== undefined) merged[target] = value;
                });
                rowMap.set(code, merged);
            });
        };
        addRows(currentRows, currentHeader, currentCodeIndex);
        addRows(incomingRows, incomingHeader, incomingCodeIndex);
        return [mergedHeader, ...rowMap.values()];
    }

    function deepMergeNested(base, incoming) {
        const result = { ...(base || {}) };
        Object.entries(incoming || {}).forEach(([key, value]) => {
            if (value && typeof value === 'object' && !Array.isArray(value) && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
                result[key] = { ...result[key], ...value };
            } else {
                result[key] = value;
            }
        });
        return result;
    }

    async function restoreSQLiteToFirebase(parsed, mode) {
        const replace = mode === 'replace';
        const externalMasterSync = parsed.sourceType === 'calibration-dashboard';

        if (externalMasterSync) {
            const masterSnap = await db.ref('master_list').once('value');
            const currentMaster = masterSnap.val() || {};
            let nextMasterDB = {};

            if (replace) {
                Object.entries(parsed.masterDB || {}).forEach(([code, record]) => {
                    nextMasterDB[code] = mergeExternalEquipment({}, record);
                });
            } else {
                nextMasterDB = { ...(currentMaster.masterDB || {}) };
                Object.entries(parsed.masterDB || {}).forEach(([code, record]) => {
                    nextMasterDB[code] = mergeExternalEquipment(nextMasterDB[code], record);
                });
            }

            // External SQL columns are translated into the existing Firebase master schema.
            // Audit history, calibration records and PDF data are intentionally untouched.
            await db.ref('master_list').set({
                masterDB: nextMasterDB,
                rawMasterRows: canonicalRawRowsFromMaster(nextMasterDB)
            });
            return;
        }

        if (replace) {
            await Promise.all([
                db.ref('master_list').set({ masterDB: parsed.masterDB, rawMasterRows: parsed.rawMasterRows }),
                db.ref('audit_history').set(parsed.audits),
                db.ref('calibration_records').set(parsed.calibrations)
            ]);
            return;
        }

        const [masterSnap, auditSnap, calibrationSnap] = await Promise.all([
            db.ref('master_list').once('value'),
            db.ref('audit_history').once('value'),
            db.ref('calibration_records').once('value')
        ]);
        const currentMaster = masterSnap.val() || {};
        const mergedMasterDB = { ...(currentMaster.masterDB || {}), ...parsed.masterDB };
        const mergedRaw = mergeRawMasterRows(currentMaster.rawMasterRows || [], parsed.rawMasterRows || []);
        const mergedAudits = { ...(auditSnap.val() || {}), ...parsed.audits };
        const mergedCalibrations = deepMergeNested(calibrationSnap.val() || {}, parsed.calibrations);

        await Promise.all([
            db.ref('master_list').set({ masterDB: mergedMasterDB, rawMasterRows: mergedRaw }),
            db.ref('audit_history').set(mergedAudits),
            db.ref('calibration_records').set(mergedCalibrations)
        ]);
    }

    async function importGridSQLite(file) {
        const input = el('sqliteUploadInput');
        if (!file) return;
        if (!requireDeveloper('Upload SQLite backup')) {
            if (input) input.value = '';
            return;
        }
        if (sqlBusy) return;
        if (typeof isOnline !== 'undefined' && !isOnline) {
            sqlToast('Connect to Firebase before restoring a SQLite backup.', 'error');
            if (input) input.value = '';
            return;
        }

        sqlBusy = true;
        setSqlButtonsDisabled(true);
        setSqlStatus('Checking SQLite file...', 'working');

        try {
            const SQL = await getSqlJs();
            const bytes = new Uint8Array(await file.arrayBuffer());
            const database = new SQL.Database(bytes);
            const parsed = parseSQLiteSource(database);
            database.close();

            const mode = el('sqlRestoreMode')?.value === 'replace' ? 'replace' : 'merge';
            const isExternal = parsed.sourceType === 'calibration-dashboard';
            let comparison = null;
            if (isExternal) {
                const currentSnapshot = await db.ref('master_list/masterDB').once('value');
                const currentMaster = currentSnapshot.val() || {};
                const currentCodes = new Set(Object.keys(currentMaster).map(code => String(code).toUpperCase()));
                const incomingCodes = new Set(Object.keys(parsed.masterDB || {}).map(code => String(code).toUpperCase()));
                let matching = 0;
                incomingCodes.forEach(code => { if (currentCodes.has(code)) matching += 1; });
                comparison = {
                    current: currentCodes.size,
                    incoming: incomingCodes.size,
                    matching,
                    newCodes: incomingCodes.size - matching,
                    firebaseOnly: currentCodes.size - matching
                };
            }
            const summary = isExternal
                ? `${parsed.counts.equipment} SQL equipment mapped to Firebase master columns` +
                    (comparison ? `; ${comparison.matching} matching, ${comparison.newCodes} new, ${comparison.firebaseOnly} Firebase-only` : '') +
                    (parsed.counts.sourceReports ? `; ${parsed.counts.sourceReports} PDF report records ignored` : '')
                : `${parsed.counts.equipment} equipment, ${parsed.counts.audits} audits, ${parsed.counts.calibration} calibration records`;
            const message = isExternal
                ? (mode === 'replace'
                    ? `MATCH Firebase master data to this CalibrationDashboard SQLite database?\n\n${summary}\n\nAfter matching, Firebase master data will contain the SQL equipment list only. Firebase-only equipment will be removed from master_list. Inventory audit history, calibration_records and PDF data are kept unchanged.`
                    : `SYNC this CalibrationDashboard SQLite database into Firebase?\n\n${summary}\n\nSQLite values are mapped into the existing Firebase columns. Matching equipment codes are updated, new codes are added, Firebase-only equipment is kept, and Firebase-only field values such as MSA are preserved when SQL has no value.`)
                : (mode === 'replace'
                    ? `REPLACE Firebase data with this GRID SQLite backup?\n\n${summary}\n\nThis replaces master data, audit history, and calibration records. PDF files are not changed.`
                    : `MERGE this GRID SQLite backup into Firebase?\n\n${summary}\n\nRecords in the SQLite file overwrite records with the same equipment code or record ID; other Firebase records are kept.`);

            if (!window.confirm(message)) {
                setSqlStatus('SQLite restore cancelled.', '');
                return;
            }
            if (mode === 'replace') {
                const confirmation = window.prompt(isExternal ? 'To replace Firebase master data with the SQL equipment list, type REPLACE to continue:' : 'For a full replacement, type REPLACE to continue:');
                if (confirmation !== 'REPLACE') {
                    setSqlStatus('SQLite replacement cancelled.', '');
                    sqlToast('Database replacement cancelled.', 'info');
                    return;
                }
            }

            setSqlStatus(isExternal ? (mode === 'replace' ? 'Matching Firebase master data to SQL...' : 'Syncing SQL equipment into Firebase...') : (mode === 'replace' ? 'Replacing Firebase data...' : 'Merging SQLite data...'), 'working');
            await restoreSQLiteToFirebase(parsed, mode);
            setSqlStatus(`${isExternal ? 'SQL sync' : 'Restore'} complete: ${summary}.`, 'success');
            sqlToast(isExternal ? 'SQLite equipment master synchronized to Firebase successfully.' : `SQLite ${mode === 'replace' ? 'replacement' : 'merge'} completed successfully.`, 'success', 5200);
        } catch (error) {
            console.error('SQLite restore failed', error);
            setSqlStatus(error.message || 'SQLite restore failed.', 'error');
            sqlToast(error.message || 'Unable to restore this SQLite file.', 'error', 6000);
        } finally {
            sqlBusy = false;
            setSqlButtonsDisabled(false);
            if (input) input.value = '';
        }
    }

    function chooseSQLiteFile() {
        if (!requireDeveloper('Upload SQLite backup')) return;
        el('sqliteUploadInput')?.click();
    }

    window.downloadGridSQLite = downloadGridSQLite;
    window.chooseSQLiteFile = chooseSQLiteFile;
    window.importGridSQLite = importGridSQLite;
})();
