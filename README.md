# Dealer map and today’s audits

The map and audit reporting use the existing server-side Airtable token and base.
No new Airtable fields are required for the scheduled-day dashboard.

## Existing Audit Visits fields

| Field | Purpose |
| --- | --- |
| Dealer | Link to Dealers; maps visit status to the correct marker |
| Audit Date | Existing formula returning the scheduled audit date |
| Visit Status | Completed, Signed Off and VONR Complete count as complete |
| Total Completed | Existing numeric rollup of checked vehicles |

Opened and Started are in progress. Pending escalation is awaiting review and is
not included in completed audits. Planned, Collection, Re Run VONR, Remote and
Self Audit are not treated as completion states. Canceled/Cancelled visits are excluded.

## What today means

All metrics refer to visits with **Audit Date equal to today in Europe/London**.
The labels say “Today’s audits completed” and “Vehicles checked on today’s audits”.
Vehicle checks include work in progress, not just completed audits. Total Vehicles
is a planned count and is never substituted for actual checked vehicles.

The table has no actual completion timestamp. Consequently this dashboard cannot
identify audits completed today that were scheduled for another day. It must not
be described as an actual completion-date report. Reused visit records and changing
rollups follow the current Audit Date and status stored by LEAPS.

## Netlify configuration

Keep the existing AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID and AIRTABLE_TOKEN.
Add AIRTABLE_AUDIT_VISITS_TABLE=tblpJnFdahUCzyxIX to the Production Functions scope.
The existing token must have read access to Audit Visits in the same base.

The optional AIRTABLE_AUDIT_VEHICLES_FIELD override defaults to Total Completed.
If a previous setup used Vehicles Counted, change the override to Total Completed
or remove it. AIRTABLE_AUDIT_COMPLETED_AT_FIELD is no longer used.
Redeploy after environment changes. No credentials belong in HTML or GitHub.

## Behaviour and validation

GET /.netlify/functions/audits is read-only and returns aggregate totals plus
linked dealer IDs/statuses. No individual audit notes, contacts or vehicle records
are returned. This endpoint is public like the existing dealer map.

Multiple linked dealer records do not multiply the overall visit or vehicle totals.
Missing counts show a dash and a missing-data note; a confirmed zero displays 0.
Failed upstream reads return no partial totals. The browser polls every minute,
retains labelled same-day figures on failure and clears yesterday’s totals.

Run `node --test tests/*.test.js` with Node 22 or later. No install step is needed.
Netlify publishes the map at / and serves both dealers and audits functions.
The DAKboard widget uses the same audit endpoint.

## MEISTER checks today

GET /.netlify/functions/meister counts distinct vehicles with their recorded
MEISTER Checked ? date equal to today in Europe/London. This is independent of
scheduled audit dates and includes all completed checks, including failed results.
It does not count the individual component answers as separate checks.

The endpoint combines Vehicles (tbl94CHYOKqCxgqLc) and Audited Vehicles
(tblWGNorphd092WF3), deduplicating archived rows against live rows through the
Vehicle Record ID link. Historical MEISTER dates copied into a newer archive do
not count. A vehicle checked more than once on the same date counts once. Checks
not yet submitted to Airtable are not included. The field is date-only, so the
comparison uses the recorded calendar date, not an inferred completion timestamp.

It reuses AIRTABLE_TOKEN and AIRTABLE_BASE_ID. No new fields are needed. The token
must read both tables; optional table overrides are in .env.example. It only reads
the date and archive vehicle link. No vehicle details are returned to the browser.
Failed or incomplete reads show unavailable, never a partial count. An archived
check without one usable vehicle link makes the full total unknown and is flagged.
The MEISTER tile refreshes independently, so its failure does not hide audit totals.
