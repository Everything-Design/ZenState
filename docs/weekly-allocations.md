# Weekly allocation integration

Saved Everything Ops schedules are the only allocation source. The optional
ZenState Weekly allocation sidebar tab reads them for the connected Basecamp
person. Monday–Sunday uses Asia/Kolkata in both applications.

## Authentication and isolation

The server verifies the bearer token using Basecamp's account-specific
`GET https://3.basecampapi.com/{account}/my/profile.json`. The returned person ID
matches the account's time-entry person IDs. Client-supplied account/person
selectors are rejected. Only a currently verified, non-client Basecamp employee
can read their own data. Ops' planning activity and last-day fields do not grant
or revoke access. Newly imported members may have an empty view until data arrives.
No Google sign-in or shared client secret is used to identify a person.

Reference: https://github.com/basecamp/bc3-api/blob/master/sections/people.md#get-my-personal-info

The desktop sends the current OAuth access token only from the main process to
`https://everything-ops-workspace.vercel.app/api/me/weekly-allocations`.
Redirects are forbidden. It does not transmit a refresh token or client secret.
The planning credential getter never refreshes, writes, expires or disconnects
the existing Basecamp connection. An expired token disables this view until the
existing Basecamp workflow renews it. Responses are discarded if the account,
identity or access token changes while a request is pending.

## Read contract

`GET /api/me/weekly-allocations?weekStart=YYYY-MM-DD`

The date must be Monday. The endpoint reads only the persisted planning document,
completed Basecamp snapshot and sync status. It does not invoke an import or any
time-entry write. Responses use private/no-store and an explicit field allowlist.

Planned hours sum the person's daily allocations in the requested calendar week,
using Ops' existing held/inactive-project commitment rules. Recorded hours sum
their active imported entries by project and Basecamp work date. Financial review
exclusions do not filter recorded hours within the included billable projects.

Only projects explicitly classified Billable in saved Ops planning are included.
Active allocated billable projects appear first. Other recorded billable projects
appear in a collapsed secondary section, including weeks without allocations,
removed project members, and inactive/on-hold projects. Saved member selection,
imported project rosters and dated staffing determine membership; recorded time
never establishes membership. Projects without a verified current status stay in
the secondary section when they have recorded time. This is a display-only scope:
no imported records or Basecamp entries are changed.

The API advertises projectScope: billable and each row's displayGroup and context.
The desktop requires this contract to avoid showing unfiltered results from an
older endpoint. Negative
remaining hours are preserved. No allocation has null planned/remaining values;
an explicit zero has plannedHours 0. Applied master allocations retain memberHours
for the entire schedule, so their zero weeks are intentional. Legacy empty weeks
without that metadata, a zero daily row or saved weekly rules remain No allocation.
Released commitments are labelled separately. No second allocation system exists.

The server includes per-project allocation save time, global planning revision,
last successful import, covered dates and import failure state. The initial
freshness threshold is 15 minutes; it does not increase the import frequency.
The current importer cannot attest account-wide access completeness, so balances
remain provisional and the view says so. No imported coverage returns unknown
recorded/remaining hours, never fabricated zero.

## Desktop behaviour

Only opening the optional tab initiates requests. It refreshes every minute while
visible and when the app becomes visible, with a manual Refresh button. Requests
time out after 20 seconds. Account changes immediately clear the view. Failed
requests clear displayed balances and show an unavailable message. No local or
running time is added, including already-posted sessions awaiting the next import.
Exhausted allocations and server failures never gate timers, local saving or posting.

## Validation and release

The desktop presents a readable week range with a current/past/upcoming label and a compact last-import card. Supporting sync and coverage details are collapsed below the project tables. Recorded hours below the saved plan are green, exactly matching hours are yellow, and overruns are red, with text labels alongside colour. Missing allocations, unavailable time and no recorded time stay neutral. The same comparison applies when browsing past weeks; it does not imply project completion or complete import coverage.

Ops: authorization and aggregation regression tests, typecheck, lint and production
build. Desktop: `npm run test:allocations`, both TypeScript configurations,
`npm run build`, and isolated UI fixtures for overrun/no allocation/zero/outage.

Deploy the Ops endpoint before distributing the desktop update. An older server
returns an unavailable view safely. Do not publish a desktop installer until the
new view has been exercised with real teammate accounts and a normal time-posting
smoke test has been explicitly scheduled. Automated tests use synthetic data and
do not create Basecamp entries.
