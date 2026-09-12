# Security and Local-Only Privacy Audit

Audit date: September 11, 2026

## Verdict

**PASS — Core financial data remains local-only during normal application use.**

## Local storage

The application stores one versioned `AppData` snapshot in the browser's IndexedDB database `lighter-db`, object store `app`, key `current`.

| Data | Storage |
| --- | --- |
| Debt names, types, balances, original balances, APRs, minimums, limits, due days, notes and status | IndexedDB snapshot: `debts` |
| Payment amounts, principal, interest, dates, notes and before/after balances | IndexedDB snapshot: `payments` |
| Strategy, custom order, extra payment, hybrid threshold and current-month adjustment | IndexedDB snapshot: `plan` |
| Currency, payday preference, theme, Reality View and onboarding preference | IndexedDB snapshot: `settings` |
| Milestones and journey balance history | IndexedDB snapshot: `milestones` and `balanceHistory` |
| HTML, CSS, JavaScript, manifest and icons | Cache Storage cache `lighter-v0.1.0-security1` |
| User-initiated backups | A local JSON Blob handed to the browser/operating-system download UI |

No application data is stored in cookies, `localStorage`, `sessionStorage`, URL parameters, server logs, or the static asset cache.

## External connections

There are no runtime external domains or URLs. Startup retrieves only same-origin static application files. The only `http://` strings are local development instructions. `http://www.w3.org/2000/svg` in the SVG icon is an XML namespace identifier and does not initiate a request.

The document CSP uses `connect-src 'none'` and allows scripts, styles, images, the manifest and the worker only from the same origin. The application contains no analytics, telemetry, advertising, crash reporting, authentication, cloud database, remote font, CDN, API client, WebSocket, beacon or external SDK.

## Service worker

The service worker pre-caches an explicit list of the application shell and local assets. Its fetch handler ignores non-GET requests, other origins, and same-origin URLs outside that allowlist. It cannot cache Blob backup downloads. Version activation removes old app caches. It contains no upload, analytics or user-state code.

## Backup system

Export runs in the page, serializes IndexedDB state into a Blob, and starts a download only after an explicit click. Import reads the selected file with the browser File API and does not upload it. It enforces a 5 MB file limit, current schema version, record-count limits, safe IDs, field lengths, enum values, dates, numeric bounds and referential integrity before asking for confirmation and replacing data. User text is HTML-escaped wherever template rendering is used.

## Dependencies and logging

The project has no production or development package dependencies. The test script uses Node's built-in test runner, so a package vulnerability audit has no dependency graph to evaluate. No user data is written to the console. The only prior console warning was replaced with a generic in-app offline-support message.

## Verification performed

- `node --test`: 15 tests passed, including payoff edge cases, backup acceptance, malformed-backup rejection and attribute-injection ID rejection.
- JavaScript syntax and manifest JSON checks passed.
- A local browser session loaded the hardened bundle with the CSP in place. Server access logs showed only same-origin shell/module/icon requests and service-worker update checks; changing strategies and What If values generated no network requests.
- After the local server was stopped, the cached app reloaded offline. Offline strategy changes, simulator calculations, debt creation, debt editing, payment recording, backup export, and a close/reopen persistence check all completed successfully.
- Destructive delete/reset was left behind its confirmation prompt in the browser session; the confirmation and deletion paths were code-reviewed. Import validation is covered by the automated backup tests; the browser upload picker was not automated.

## Changes from this audit

- Added a restrictive Content Security Policy and no-referrer policy.
- Removed inline styles so the CSP does not require `unsafe-inline`.
- Restricted service-worker interception and runtime caching to named application assets.
- Added strict validation of imported and existing IndexedDB snapshots.
- Added record-count, text-length, ID, enum, date and numeric limits.
- Closed non-finite payment and form-input cases that could corrupt stored data.
- Added Settings privacy and sensitive-backup explanations.
- Renamed reset to **Delete All Local Data** while retaining confirmation.
- Changed normal server instructions to bind to `127.0.0.1` and documented deliberate LAN exposure separately.
- Added malicious-backup regression coverage.

## Remaining privacy risks

- A person or application with access to the unlocked device, browser profile, downloaded backup, browser developer tools or device backups may read the data. IndexedDB is not separately encrypted by Lighter.
- Browser extensions and a compromised browser or operating system remain outside the application's control.
- Exported files can leave the device if the user saves them to a synced folder or shares them. Lighter does not control the file after download.
- Clearing site data can erase records. Safari and other browsers may evict local storage; users should keep backups somewhere they trust.
- The meta-delivered CSP cannot enforce `frame-ancestors`; a production HTTPS host should send `Content-Security-Policy: frame-ancestors 'none'` as an HTTP response header. This does not affect the local-only data path but protects against clickjacking when hosted.
