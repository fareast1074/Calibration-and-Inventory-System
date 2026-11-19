# GRID V4.5 Inventory System

Inventory-only GitHub web application. The Calibration workspace has been removed.

## Login
- Password `1234`: User Mode. Scan/verify equipment and delete individual audit records. Clear Cloud is not available.
- Password `1074`: Developer Mode. Includes Clear Cloud and SQLite sync/backup controls.

## Inventory features
- Hardware/manual/camera equipment-code scanning
- Physical-location and sticker-location verification
- PASS, ABNORMAL, MISSING, PENDING, and UNREGISTERED tracking
- Missing-equipment email notification with multi-recipient selection and configured CC recipients
- Master CSV/Excel import with column/date normalization
- Filtered CSV and Excel reports
- Firebase Realtime Database synchronization and offline queue
- Developer SQLite download/upload/sync with external equipment databases mapped to the existing Firebase master schema

## Firebase data used
- `master_list/masterDB`
- `master_list/rawMasterRows`
- `audit_history`
- `temporary_locks`

The SQLite compatibility layer can still read older GRID V4.2 backup files. Calibration/PDF UI assets are not part of V4.5.

## GitHub Pages deployment
Replace all files in the repository with the V4.5 package. After deployment, close the old GRID tab, reopen the site, and perform one hard refresh (`Ctrl + Shift + R`) so the new service worker takes control.

## New in V4.4 — Out-of-Period Scans
- **Current/next month** is determined from the auditor's local calendar month and year (for example, DEC-26 and JAN-27 when scanned in December 2026).
- Scanning equipment whose registered due month is *neither* the current month nor the following month is permitted. It follows the regular verification flow, but its saved audit is tagged `scanScope: OUT_OF_PERIOD` and appears in the **Out-of-Period Scans** list, with its own count and CSV/Excel export.
- Registered equipment with missing/invalid due dates is recorded under `scanScope: DUE_UNKNOWN` in that same review list. Truly unregistered codes remain in the existing **Unregistered** category.
- The UI alerts the auditor about an additional scan *before* the verification is saved. The separate list shows the equipment code/name, due date at the time of scan, schedule window, audit result, auditor, and access to the full record.
- Scan scope, recorded due date, local window, and scan timestamp are embedded in the existing `audit_history` record in Firebase. Existing audit records are classified for display using historical scan timestamps and due-date snapshots when available. No Firebase migration or extra credentials are required. SQLite backup/restore retains these fields through the audit `data_json` column.
- **All scans** still means all audit history, including additional scans, so existing inventory counts, reports, and quick filters are unchanged. The new category is a separate review list, not a second stored copy of a scan. The full Excel report includes an **Out of Period** worksheet.
- Due Month/Year filters do not hide historical extra scans; search, building, production, and status filters remain active in their separate list. Deleting/editing a scan through the existing UI updates this list automatically.

Deployment: replace the files, publish the updated static app, then hard-refresh in the browser. The service-worker cache has been versioned to V4.5.


## New in V4.5 — Broken / Done Cal in Verification

The Verification popup now has two separate status actions above the regular audit buttons:

- **Broken** opens a confirmation. Saving changes the registered equipment master status to `BROKEN`, keeps the current due date unchanged, and saves a new `BROKEN` audit-history record. It is counted as abnormal, not PASS.
- **Done Cal** opens a confirmation that **requires a valid next calibration date after today**. Saving changes the registered master status to `COMPLETED` and updates `due`, `month`, and `year` from the chosen date, while keeping the full date as `nextCalibrationDate` (ISO format). Existing `nextVerificationDate` and `expiredDate` fields are also synchronized when present. It saves a new `DONE_CAL` audit record with the full date and the previous status/due. Done Cal is distinct from a four-check verification PASS.
- Neither shortcut requires completing the four normal inventory verification toggles. Existing **Complete verification** and **Mark Missing & Notify** behavior is unchanged.
- These actions only work for **registered equipment with an active Firebase connection**, because they change the shared equipment master. They are deliberately not queued offline to avoid a stale master.
- The master-field updates, compatible raw master row updates, and new audit-history record are committed together in one Firebase multi-location update. The older six-column and current 29-column master layouts are handled by column header rather than hard-coded positions.
- Out-of-period classification for the new action uses the **registered due date before** the update. Original history is preserved as a separate audit entry.
- Full Excel report includes the exact next-calibration date, a separate **Done Cal** worksheet, and the new category in the summary. The separate out-of-period export includes the new date as well.

**Assumption:** `Done Cal` means the calibration itself has already been performed and approved. This button records that declaration and next date; it does not validate a certificate or perform calibration.

### Local tests

From this directory, with Node.js installed:

```bash
node tests/out-of-period.test.cjs
node tests/equipment-actions.test.cjs
```

Tests cover date validation, status transitions, both raw master schemas, atomic Firebase update paths, failed writes, and offline blocking. A live Firebase test still needs to be performed in your own environment.
