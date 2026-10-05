# Your week — local test build

ZenState replaces the Weekly allocation tab with Your week: Billable/Growth time, personal leave-adjusted targets, selected and following week capacity, own projects and reported progress, current requests/reminders, and personal leave. Recent wins and management/financial information are excluded. Open Ops handles edits; this integration is read-only.

The new API is `GET https://ops.everythingflow.agency/api/me/weekly-overview?weekStart=YYYY-MM-DD`. The existing allocation API remains unchanged for older clients. Tokens stay in the main process and go only to the fixed HTTPS endpoint with redirects forbidden. The server verifies the current Basecamp employee before reading records, maps trusted duplicate identities, and projects only personal fields; the desktop validates and allowlists them again.

Ops supplies corrected/reassigned time, excluding reviewed-out entries. Historical plans use the saved version before Monday 00:00 IST. Weeks remain Monday–Sunday, including weekends. Missing coverage is not zero; imported totals remain provisional. Free capacity subtracts committed allocations, not logged hours. Tentative capacity is separate. Missing personal targets stay unavailable.

Local unposted sessions, the live timer and recently posted time are separate from Ops totals. A minute refresh runs only while visible; week/account changes invalidate older responses. Ops errors do not change authentication or time recording.

## Release 5.8.6

The local test build was approved. The test-build notice and sample-preview controls have been removed. Open **Your week** with your Basecamp connection to load your personal overview from the deployed read-only endpoint.

Backend commit `400fcc0` is in `EverythingDesign/everything-ops-lab`. Authenticated checks passed for previous, current and following weeks, including the desktop response allowlist. No business records were changed. Desktop release validation is recorded in `docs/release-validation.md`.

## Checks

- Ops: 519 tests passed after rebasing onto the latest Ops changes; the initial production build passed; focused historical/break/allocation tests rerun after refinements (38 passed).
- Desktop: main and renderer builds, renderer TypeScript, 12 allocation/overview tests and 15 release-safety tests passed.
- Disposable Electron UI: section rendering, local account filtering, collapsed projects, navigation links, narrow bounds, offline/retry, week/account races and absence of the test-build notice passed.
- Local app signature and DMG checksum verified.
- Packaged version, new IPC bridge and trusted endpoint verified inside the local app archive; sample preview data is not shipped.
- The endpoint is deployed. Live authenticated checks passed for 28 September, 5 October and 12 October 2026 using the CEO workspace's existing Basecamp connection. Identity matched, the complete response passed the desktop parser, anonymous/selector/write requests were denied, the legacy endpoint remained protected, and no private financial fields appeared. Your own Mac connection remains for user testing. Desktop publication follows the complete release checks.
