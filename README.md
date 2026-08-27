# GRID V4.3 Inventory System

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

The SQLite compatibility layer can still read older GRID V4.2 backup files. Calibration/PDF UI assets are not part of V4.3.

## GitHub Pages deployment
Replace all files in the repository with the V4.3 package. After deployment, close the old GRID tab, reopen the site, and perform one hard refresh (`Ctrl + Shift + R`) so the new service worker takes control.
