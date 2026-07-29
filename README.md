# GRID V3.0 Calibration & Inventory System

GRID V3.0 combines the existing inventory-audit workflow with a new equipment-calibration workspace. The current Firebase project configuration is retained, and existing inventory records remain compatible.

## Login and system selection

After a successful login, the user chooses one of two workspaces:

- **Inventory** - scan and verify equipment, track Pass, Abnormal, Missing, Pending, and Unregistered results, edit equipment status, delete individual audit records, and export filtered reports.
- **Calibration** - scan an equipment code, edit its master information, complete a verification template, calculate the next verification date, and archive the completed PDF.

The existing access modes remain:

- Password `1234`: **User Mode**. Normal scanning, editing, saving, report access, and individual-record deletion are available. Bulk **Clear Cloud** remains unavailable, and Logout does not clear records.
- Password `1074`: **Developer Mode**. Full existing inventory controls are available, including **Clear Cloud** and **Logout & Clear** for inventory audit history and temporary locks.

The passwords are stored in browser JavaScript. They separate workflows and prevent accidental bulk deletion, but they are not equivalent to Firebase Authentication or server-side authorization.

## Calibration workflow

1. Open **Calibration** after login.
2. Scan or type the equipment code.
3. The application loads all available fields from `master_list`.
4. Edit any equipment information and save it back to the database.
5. Enter the calibration date and interval in whole months.
6. The next verification date is calculated automatically. End-of-month dates are handled correctly; for example, 31 January plus one month becomes 28 or 29 February.
7. Select **Digital Weight Measure** or **Micrometer**.
8. Complete the integrated verification template. The scanned equipment details, calibration date, and interval are synchronized into the template.
9. Select **Print / Save PDF** in the template and save the completed record as a PDF from the browser print dialog.
10. Select that PDF in the calibration page and press **Upload PDF & Save**.

A draft can also be saved without a PDF. Each saved record retains the equipment snapshot, selected template, template form data, calculated result, calibration date, interval, next verification date, preparer, timestamps, and PDF metadata.

## Calibration master-data fields

The calibration page can display and edit:

- Equipment Code
- Equipment Name
- Serial No.
- Status
- Location
- Building
- Production
- MSA Requirement
- Maker
- Model No.
- Class
- Section
- Calibration Date
- Interval in months
- Next Verification Date
- Selected Calibration Template

New optional columns are added to `rawMasterRows` automatically when calibration information is saved. Existing master files without those columns remain readable.

## Verification templates

Two standalone templates are included and integrated into the calibration page:

- `Digital_Weight_Measure_Profile_Standalone.html` - profile-based digital weight verification with linearity, repeatability, eccentric testing, master standards, judgment, and approval stamps.
- `Micrometer_Verification_Standalone.html` - profile-based micrometer verification with appearance/function checks, measuring points, tolerance judgment, master standards, and approval stamps.

Both templates remain usable as independent HTML files. Inside GRID, each exposes a same-origin integration API so equipment details and completed template data can be synchronized with the calibration record.

## Firebase storage structure

The application uses these Firebase Realtime Database paths:

```text
master_list
calibration_records/{encodedEquipmentCode}/{recordId}
calibration_pdf_files/{encodedEquipmentCode}/{recordId}
audit_history
temporary_locks
```

Completed PDFs are uploaded first to Firebase Storage:

```text
calibration_pdfs/{equipmentCode}/{recordId}/{filename}
```

The Storage path and download URL are stored in the calibration record. When Firebase Storage is unavailable or rejects the upload, the application attempts a Realtime Database fallback for PDFs up to 6 MiB. The fallback file is stored under `calibration_pdf_files` as a data URL. Configure Firebase Storage and Realtime Database rules according to your company security requirements.

Changing an equipment code migrates its calibration-record and database-fallback nodes to the new encoded code. Existing Firebase Storage files keep their original physical path, while the stored record continues to reference them.

## Calibration history

For every scanned equipment code, the page displays:

- Total calibration records
- Number of attached PDF files
- Latest calibration date
- Latest next-verification date
- Template type
- Result
- Prepared-by name
- PDF availability

The user can reopen a saved template record, open/download its PDF, or delete one selected calibration record after confirmation.

## Inventory functions retained

The existing inventory features remain available, including:

- Physical-location and sticker-location verification
- Editable equipment status
- One-button Missing workflow
- Missing separated from Abnormal
- Pass, Abnormal, Missing, Pending, and Unregistered dashboard counts
- Search and multi-select filters
- Filtered CSV with `MISSING`, `PENDING`, and `OK`
- Multi-sheet Excel reporting
- Header-aware CSV/Excel master import
- Camera and hardware-scanner input
- Offline inventory audit queue
- Individual audit-record deletion in both User and Developer modes

## Files

- `index.html` - login, system chooser, Inventory page, Calibration page, and Firebase initialization.
- `script.js` - original inventory and Firebase database logic.
- `enhancements.js` - V3.0 inventory interface, scanning, filtering, access-mode, import, and reporting layer.
- `calibration.js` - calibration workflow, master-data editing, template integration, schedule calculation, Firebase record storage, PDF upload, and history.
- `Digital_Weight_Measure_Profile_Standalone.html` - integrated digital weight template.
- `Micrometer_Verification_Standalone.html` - integrated micrometer template.
- `style.css` - responsive styling for both systems.
- `manifest.json`, `icon.svg`, `sw.js` - installable application shell.
- `sample_master.csv` - example master-data import file.

## Running the project

Use localhost or HTTPS. Opening `index.html` directly with a `file://` URL can prevent iframe integration, camera access, service workers, and some browser-storage functions.

From the project folder:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Deploy the complete folder to the existing HTTPS static host for production use.

## Operational notes

- Calibration saving requires a live Firebase connection. The existing offline queue applies to inventory audits only.
- Browser **Print / Save PDF** is used to create the final PDF. The application then archives the user-selected PDF; it does not silently read files from the Downloads folder.
- The app still loads Html5Qrcode, SheetJS, Chart.js, and Firebase compatibility libraries from CDNs. Initial use therefore requires network access unless those libraries are hosted locally.
- The same-origin service worker caches the application shell and both verification templates. Firebase synchronization and uncached CDN libraries still require a connection.
- Firebase Storage rules may block uploads until configured. In that case, the database fallback is attempted automatically for eligible PDF sizes.
