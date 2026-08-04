# GRID V3.4 Calibration & Inventory System

GRID V3.4 combines the existing inventory-audit workflow with a new equipment-calibration workspace. The current Firebase project configuration is retained, and existing inventory records remain compatible.

## Login and system selection

After a successful login, the user chooses one of two workspaces:

- **Inventory** - scan and verify equipment, track Pass, Abnormal, Missing, Pending, and Unregistered results, edit equipment status, delete individual audit records, and export filtered reports.
- **Calibration** - scan an equipment code, edit its master information, complete a verification template, calculate the next verification date, and archive the completed PDF.

The existing access modes remain:

- Password `1234`: **User Mode**. Normal scanning, editing, saving, report access, and individual-record deletion are available. Bulk **Clear Cloud** remains unavailable, and Logout does not clear records.
- Password `1074`: **Developer Mode**. Full existing inventory controls are available, including **Clear Cloud** and **Logout & Clear** for inventory audit history and temporary locks.

The passwords are stored in browser JavaScript. They separate workflows and prevent accidental bulk deletion, but they are not equivalent to Firebase Authentication or server-side authorization.


## V3.4 new equipment registration

The Calibration workspace now includes an explicit **Register New Equipment** workflow. It can be opened without scanning, or it starts automatically when a scanned equipment code is not found in `master_list`.

New registrations capture:

- Issued On
- Issuer Name
- Issuer No.
- Equipment Code, Equipment Name, Serial No., Equipment Class, Maker, and Model
- Function, Status, Area Used, Location, Building, Prod Type, Process Name, Station Location, and Section Use
- Calibrated By, Calibration Cost, Frequency, Calibration Date, Duration, Expired Date, Month, Year, and MSA Requirement

For a new record, Issued On, Issuer Name, Issuer No., Equipment Code, Equipment Name, Calibration Date, and Duration are validated before saving. Issued On defaults to the current date and Issuer Name defaults to the signed-in user. Duplicate equipment codes are blocked so an existing master record cannot be overwritten accidentally.

After registration, the new equipment is written to both `masterDB` and `rawMasterRows` under `master_list`. The raw master data receives `ISSUED ON`, `ISSUER NAME`, and `ISSUER NO` columns automatically. Registration audit metadata (`createdAt`, `createdBy`, `registeredAt`, `registeredBy`, and `registrationSource`) is also stored in the equipment object. Calibration templates remain disabled until the new equipment has been registered successfully.

The master importer recognizes the optional headers `ISSUED ON`, `ISSUER NAME`, and `ISSUER NO`, including supported aliases. Existing nine-column inventory files remain compatible and leave these optional fields blank.

## V3.2 inventory scan-detail update

The Inventory verification and scanned-item detail panel now shows four additional registered master-data fields immediately after the equipment name:

- Serial No.
- Prod Type
- Building
- Calibrated By

Values are resolved from both Firebase `master_list` and the imported raw master rows. `CalBy`, `Calibrated By`, and equivalent calibrated-by headers are recognized. Blank or unavailable values display as `N/A`. The fields appear for new scans and when reopening an existing audit record.

## V3.3 master CSV synchronization

The master importer is synchronized with the nine-column inventory file used for July 2026:

| Source column | System field |
|---|---|
| `EQUIPMENT CODE` | Equipment code and Firebase master key |
| `SERIAL NO` | Serial number |
| `EQUIPMENT NAME` | Equipment name |
| `LOCATION` | Registered location |
| `BUILDING` | Building filter and equipment detail |
| `PRODTYPE` | Production type filter and equipment detail |
| `DUE DATE` | Due display, due month, and due year |
| `STATUS` | Equipment status |
| `MSA` | Registered MSA requirement |

CSV files are parsed as text before validation, so serial numbers such as `020408932`, `004847`, and `060` retain their leading zeroes. The importer accepts the source due-date format `YY-MMM`, for example `22-Dec`, and synchronizes it to the application format `DEC-22` with month `DEC` and year `2022`. `MMM-YY` remains supported.

The import preview now displays Code, Serial No., Name, Location, Building, Prod Type, Due, Status, MSA, and CalBy in synchronized order. A column-mapping panel shows the detected source header for every system field before upload. `CALBY` or `CALIBRATED BY` is optional; when it is absent, the scanned detail displays `N/A` until the field is entered manually or supplied in a later master file.

Header-aware mapping is used whenever an equipment-code header is detected. A partially recognized file without `EQUIPMENT CODE` is rejected instead of being silently imported in the wrong column order. Legacy positional files with no recognizable headers remain supported.

## Calibration workflow

1. Open **Calibration** after login.
2. Scan or type an existing equipment code, or select **Register New Equipment** for a new master record.
3. Existing equipment loads from `master_list`; an unknown scanned code opens registration mode automatically.
4. Enter or edit registration, identification, usage, location, schedule, and cost details, then save them to the database.
5. Enter the calibration date and Duration in whole months. Frequency can be stored independently.
6. The Expired Date and exact Next Verification Date are calculated automatically. End-of-month dates are handled correctly; for example, 31 January plus one month becomes 28 or 29 February.
7. Select **Digital Weight Measure** or **Micrometer**.
8. Complete the integrated verification template. The scanned equipment details, calibration date, and interval are synchronized into the template.
9. Select **Print / Save PDF** in the template and save the completed record as a PDF from the browser print dialog.
10. Select that PDF in the calibration page and press **Upload PDF & Save**.

A draft can also be saved without a PDF. Each saved record retains the equipment snapshot, selected template, template form data, calculated result, calibration date, interval, next verification date, preparer, timestamps, and PDF metadata.

## Calibration master-data fields

The calibration page now contains the complete equipment-detail profile shown in the reference system:

- Issued On, Issuer Name, and Issuer No.
- Equipment Code, Equipment Name, Serial No., Equipment Class, Maker, and Model
- Status, Function, Area Used, Location, Building, Prod Type, Process Name, Station Location, and Section Use
- MSA Requirement, Calibrated By, and Calibration Cost
- Calibration Date, Duration, Frequency, Expired Date, exact Next Verification Date, Month, and Year
- Selected Calibration Template

`Duration` is the interval used to calculate the exact next-verification date. `Frequency` is stored separately as equipment metadata. The page also derives Building, Prod Type, Process Name, and Station Location from a location such as `C-RF15-EST-926` when those fields are blank.

The master importer recognizes the expanded headers, including `EquipCode`, `EquipName`, `LocationName`, `ProdType`, `Seerial No`, `Calibration Date`, `Duration`, `Expired Date`, `Frequency`, `Calibration Cost`, `Function`, `Process Name`, `Station Location`, and `Section Use`. New optional columns are added to `rawMasterRows` automatically when calibration information is saved. Existing six- or seven-column master files remain readable.

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
- `enhancements.js` - V3.4 inventory interface, scanning, filtering, access-mode, import, and reporting layer.
- `calibration.js` - calibration workflow, new-equipment registration, master-data editing, template integration, schedule calculation, Firebase record storage, PDF upload, and history.
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
