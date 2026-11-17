# Dealer map and today's audits

The map reads dealers from Airtable through a Netlify function. Audit reporting is
an additional read-only feed. It counts actual completion timestamps in
**Europe/London**, rather than assuming a scheduled audit date is its completion date.

## Airtable setup

In **Audit Visits** (`tblpJnFdahUCzyxIX` in the existing LEAPS schema):

| Field | Type | Meaning |
| --- | --- | --- |
| Dealer | Existing link to Dealers | Used to show audit status in map popups |
| Audit Date | Existing date/formula | Scheduled audit date |
| Visit Status | Existing status | Completed, Submitted or Signed Off count as done |
| Completed At | **New date with time** | Actual completion timestamp; enable time |
| Vehicles Counted | **New integer number** | Actual checked vehicle count for that visit; zero is valid |

The endpoint does not create or change Airtable records. Initially these new
fields can be filled in Airtable as each audit is completed. Do not populate
`Completed At` from `Audit Date` or backfill it with the current time.

For automatic timestamps, configure an Airtable automation triggered when
`Visit Status` first enters Completed, Submitted or Signed Off **and Completed At
is empty**, then write the automation's actual run timestamp into `Completed At`.
Leave an existing timestamp intact when a visit progresses to Signed Off. The
audit submission process should write `Vehicles Counted` from the actual result.
Do not substitute the planned `Total Vehicles`. If `Total Completed` is confirmed
to represent the actual checked count, it can instead be configured as the vehicle
field. Reused visit records require deliberate reset/versioning by the audit app.

Add the variables from `.env.example` to Netlify's Functions environment. Keep
the Airtable token in Netlify and allow read access to Audit Visits as well as
Dealers. Leave `AIRTABLE_AUDIT_VISITS_TABLE` unset until the fields are ready.
Set the field overrides if your reporting fields have different names.

## Reporting behaviour

- Completed today: completed-status visits whose `Completed At` falls today in UK time,
  including visits originally scheduled on another day.
- Vehicles counted: sum of actual counts on those completed visits. An unknown count
  displays a dash and a missing-data note; a confirmed zero displays 0.
- Scheduled today: non-cancelled visits scheduled today, shown separately.
- Dealer popups show the linked visit's status and today's completed audit count.
- Cancelled visits are excluded. Multiple linked dealer records do not multiply
  dashboard totals; visit records are deduplicated by Airtable record ID.
- No auditor names, vehicle records, notes or completion timestamps are returned
  individually. The endpoint returns aggregate counts and dealer record IDs/statuses.
- The browser polls every minute. Failed reads keep the last good same-day figures
  labelled as saved; yesterday's totals are never presented as today's.
- Missing configuration or a partial upstream read shows unavailable, not zero.

This repository is public and its deployed map and aggregate audit endpoint are
public. Do not add credentials, vehicle details or audit notes to its output.

## Validation

Node 22 or newer: `node --test tests/*.test.js`. No install step is needed.

Netlify publishes the existing map at `/` and serves
`/.netlify/functions/dealers` and `/.netlify/functions/audits`.
The DAKboard widget can consume the same audit feed after it is configured and deployed.
