# Lighter — Version 0.1

## Source of truth
This file was created at project start because the supplied project directory was empty. It records the user's debt payoff companion brief and implementation decisions. Update this file before major architectural changes and keep it current for future sessions.

## Product
An encouraging, practical, private debt payoff companion. iPhone first, comfortable on iPad and desktop. No shame, streak penalties, account setup, bank connections, or transmission of financial data. Prefer clarity and sustainable payments over pressure or gamification.

## Architecture (approved starting scope)
- Plain HTML, separate CSS, and native JavaScript ES modules; no framework, dependencies, or build step.
- `index.html`, `styles.css`, `js/app.js` (UI), `js/state.js` (mutations and milestones), `js/storage.js` (IndexedDB), `js/engine.js` (payoff calculation), `js/strategies.js`, `js/backup.js` (strict schema validation), `js/format.js`.
- IndexedDB stores one versioned application snapshot after each meaningful change. A failed write is surfaced; no silent fallback to volatile storage.
- Six sections: Home, Debts, Plan, What If, Journey, Settings. Dialogs for debt editing, payment recording, and Life Happened.
- `manifest.json`, local icons, and `sw.js` provide install metadata and an allowlisted static-asset cache. HTTPS or localhost required. No third-party requests.
- A restrictive document CSP blocks remote connections, scripts, styles, fonts, frames, objects, and form submissions. Imported and saved snapshots are schema-validated before rendering.
- Node's built-in test runner tests pure modules with no installation required.

## Financial rules
- Currency amounts are rounded to integer cents per monthly calculation. APR is nominal annual rate, compounded monthly (APR / 12). Real lender daily interest, fees, variable minimums, promotional rates, and billing schedules can differ.
- Apply monthly interest, fixed entered minimums, then remaining budget by strategy. Monthly budget preserves the minimums of tracked paid-off debts so freed payments roll forward. Deleting a debt intentionally removes that contribution.
- Avalanche: highest APR, then lowest balance, then stable ID. Snowball: lowest balance, then highest APR, then ID. Hybrid: initially qualifying balances at/below threshold first, then Avalanche. Custom: ordered IDs, with omitted debts appended deterministically.
- Cap projections at 1,200 months and show a clear non-payoff result rather than an impossible date. Large amounts are bounded to protect precision and performance.
- Record actual payment amount and interest portion (default zero, clearly disclosed). Principal = amount - interest, capped to balance; overpayment is rejected. No interest is silently posted to real balances by a forecast. Manual balance edits record adjustment history.
- Life Happened overrides extra payment for the current calendar month only; next month's regular plan resumes. What If remains a draft until explicitly applied. One-time extras are projection-only unless separately recorded.
- Estimated interest saved compares current payoff projections against a minimum-only fixed-budget baseline; it is not historical lender-confirmed savings.

## V0.1 scope
Debt CRUD, payment history, four payoff strategies, comparison, simulations, missions, temporary extra reduction, milestone history, journey chart, reclaimed payments, reality view, clean/wall themes, onboarding, export/import confirmation and validation, reset confirmation, optional demo, offline PWA, and calculation tests.

## Deferred
Cloud sync, bank linking, notifications, automatic interest posting, automatic payment detection, financial advice, additional goals, additional visual themes. Safari may evict local website data; backup export is important. Install and storage behavior must be tested on physical iPhone/iPad.

## Running and validation
Run `python3 -m http.server 8080 --bind 127.0.0.1`, open `http://localhost:8080`. Run `npm test` (Node 18+). Use `0.0.0.0` only for intentional trusted-LAN testing; it exposes the server to that LAN. Remote iPhone PWA installation requires HTTPS, not a plain HTTP LAN address.

## Version 0.1 implementation status
Completed September 11, 2026. The functional flows in the V0.1 scope are implemented. Automated verification has 15 passing calculation and backup-validation tests. Browser verification covered onboarding, debt creation, strategy comparison, live simulation and plan adoption, interest-aware mission payments, balance updates, Life Happened options, persistence across refresh, responsive mobile layout, and offline reload through the service worker.

## Security and privacy posture
Audited September 11, 2026. All financial state is one versioned snapshot in IndexedDB (`lighter-db` / `app` / `current`). Cache Storage contains only an explicit allowlist of static app assets. The app has no dependencies, accounts, analytics, telemetry, remote assets, backend, or runtime external URLs. Export creates a local JSON Blob only after a user click; import reads a user-selected file locally, applies strict limits and schema validation, and confirms replacement. See `SECURITY_AUDIT.md` for findings, tests, and remaining platform risks.
