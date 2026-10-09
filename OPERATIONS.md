# JustTitip Operations

The internal workspace lives at `/ops/`. It manages catalogue prices and retailer links, customer records, trip batches, orders and item quotes, purchasing, fulfilment, payments and refunds, import reviews, and CSV/JSON exports. The existing customer request site continues to use its existing backend.

The operations source of truth is a native Google Sheets workbook stored in Drive. Tables use stable record IDs and foreign keys: Customers, Products, RetailerOffers, Trips, Orders, OrderItems, Payments, Settings, ActivityLog, ImportIssues and Meta. Currency amounts stay separate. Missing prices and weights are unknown. Catalogue price edits affect future quotes. Original quoted totals persist until an operator edits the item's quote or quantity. Legacy payment notes do not create numeric payment transactions.

## Backend setup

Configure encrypted Vercel environment variables `ADMIN_PASSWORD_HASH` (salt:hex scrypt hash), `SESSION_SECRET`, `GOOGLE_SHEETS_BRIDGE_SECRET`, `GOOGLE_SHEETS_ID`, `GOOGLE_SHEETS_DATABASE_URL`, `GOOGLE_DRIVE_FOLDER_URL` and `GOOGLE_SHEETS_BRIDGE_URL` (Google Apps Script `/exec` URL). Each secret must be long and randomly generated. Keep secrets and customer exports out of Git.

Create a bound Apps Script project from the new database. Sign into `/ops/` and download the configured script and manifest through the connection setup page. Replace Code.gs and appsscript.json. The manifest enables the Sheets v4 advanced service with spreadsheet scope. Deploy a web app executing as the database owner with access Anyone, authorize Google, and configure its URL in Vercel. Anonymous calls cannot access records without a timestamped, non-replayable HMAC signature. Ordinary app users never receive the bridge secret.

All reads and commits acquire the script lock. Every commit checks the current revision and writes the changed tables, revision and audit receipt with a single atomic Sheets batch. Stale revisions return 409. Retries with the same request ID return the original receipt without applying the edit again. Google Sheets remains accessible through Drive; make routine record edits through the app so validation, revisions and audit history stay consistent.

## Validation and recovery

Run `npm test`. To test locally without production records, run `node scripts/qa-server.mjs` and use the documented synthetic QA credentials in that script. The production API never returns bundled fixtures as a fallback. The quote helper applies markup to purchase cost, then adds the rounded weight fee; conversion needs an explicit exchange rate. Suggestions never overwrite order quotes.

Download JSON backups in Settings & backup and store them in the Operations/Backups folder. ImportIssues records source uncertainties and should be marked resolved after correcting their linked records. A backup restoration requires reviewed table import; this version intentionally exposes no one-click destructive restore. Drive archives retain the original spreadsheet exports for reconciliation. Receipts and attachments can be filed in the Operations/Attachments folder.
