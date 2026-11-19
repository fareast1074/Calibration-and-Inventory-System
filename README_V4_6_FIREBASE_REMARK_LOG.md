# GRID Inventory V4.6 - mandatory remarks & Firebase change log

1. The verification popup's existing **Broken** shortcut is now labelled **Remark Broken**.
2. A meaningful defect remark (minimum 3 characters) is **required** before Broken can be committed. The cloud audit carries `operatorRemark` and a separate entry is added to `equipment_change_log`.
3. In the ordinary verification popup, editing Location, Status, or Due Date now requires a meaningful remark. The Firebase multi-location update saves `master_list/masterDB`, `master_list/rawMasterRows`, `audit_history`, and `equipment_change_log` together. No local master state is updated until Firebase confirms success.
4. The change log contains equipment code, auditor, timestamp, operator remark, and each changed field's previous and new value. Changing a location also records derived Building/Prod changes when the GRID location parser updates them.
5. Edits to an old scan also append a **new** change event, enabling CalDash to synchronize it without losing the original scan's audit timestamp.
6. **Done Cal** continues to require a future date and retains a descriptive audit note; its unverified status is not automatically accepted as a calibration approval by CalDash.
7. Ordinary scan history can still be queued offline; **master changes cannot be queued offline**. A Firebase connection is required for all equipment status, location and due-date changes.

## Deployment

Apply the PATCH ZIP to your existing GRID V4.5 GitHub Pages repository; publish all changed files, close old tabs and hard-refresh (`Ctrl+Shift+R`). Cache namespace changed to V4.6. Retain `firebaseConfig` from the trusted source. No Firebase credentials/passwords are newly included.

The existing GRID browser uses a shared client-side passcode; this is **not robust cloud authentication**. Use Firebase Authentication and restrictive Realtime Database Rules before relying on this for production-controlled master changes. Do not leave the production database publicly writable.

## Tests

```sh
node tests/firebase-change-logging.test.cjs
node tests/equipment-actions.test.cjs
node tests/out-of-period.test.cjs
```

No live Firebase writes were made during development/testing.
