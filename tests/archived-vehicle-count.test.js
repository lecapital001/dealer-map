const { test } = require('node:test');
const assert = require('node:assert/strict');
const { countArchivedVehicles } = require('../lib/archived-vehicle-count');
const { createHandler } = require('../netlify/functions/audits');
const now = new Date('2026-07-07T10:00:00Z');
const row = (id, date = '2026-07-07T09:00:00Z') => ({ id, fields: { 'Date Audited': date } });
const options = { base: 'appExample', token: 'private-token', time: now, signal: new AbortController().signal };
test('counts archive records, including repeat appearances of a vehicle, rather than scheduled visit rollups', async () => {
  const records = [row('archive-a'), row('archive-b'), row('archive-c')];
  for (const record of records) record.fields['Vehicle Record ID'] = ['same-vehicle'];
  const count = await countArchivedVehicles({ ...options, fetcher: async url => {
    assert.deepEqual(url.searchParams.getAll('fields[]'), ['Date Audited']);
    assert(url.searchParams.get('filterByFormula').includes("SET_TIMEZONE({Date Audited}, 'Europe/London')"));
    return { ok: true, json: async () => ({ records }) };
  } });
  assert.equal(count, 3);
});
test('UK date boundaries include late UTC summer checks and exclude yesterday', async () => {
  const result = await countArchivedVehicles({ ...options, fetcher: async () => ({ ok: true, json: async () => ({ records: [row('a', '2026-07-06T23:30:00Z'), row('b', '2026-07-06T21:00:00Z')] }) }) });
  assert.equal(result, 1);
});
test('follows pagination and rejects a partial archive read', async () => {
  let calls = 0;
  await assert.rejects(countArchivedVehicles({ ...options, fetcher: async () => ++calls === 1 ? { ok: true, json: async () => ({ records: [row('a')], offset: 'next' }) } : { ok: false } }));
  assert.equal(calls, 2);
});
test('audit endpoint replaces the scheduled rollup with the archive total', async () => {
  const handler = createHandler({ env: { AIRTABLE_BASE_ID: 'appExample', AIRTABLE_TOKEN: 'private-token', AIRTABLE_AUDIT_VISITS_TABLE: 'tblVisits' }, now: () => now, fetcher: async url => ({ ok: true, json: async () => ({ records: url.pathname.endsWith('tblVisits') ? [{ id: 'visit', fields: { Dealer: ['dealer'], 'Audit Date': '2026-07-07', 'Visit Status': 'Completed', 'Total Completed': 768 } }] : Array.from({ length: 895 }, (_, i) => row('archive-' + i)) }) }) });
  const response = await handler({ httpMethod: 'GET' }), data = JSON.parse(response.body);
  assert.equal(data.vehiclesCountedToday, 895);assert.equal(data.scheduledVehiclesCountedToday, 768);assert.equal(data.completedToday, 1);
  assert(!response.body.includes('archive-'));assert(!response.body.includes('private-token'));
});
test('archive failure leaves scheduled audit totals usable and never falls back to the wrong vehicle total', async () => {
  const handler = createHandler({ env: { AIRTABLE_BASE_ID: 'appExample', AIRTABLE_TOKEN: 'private-token', AIRTABLE_AUDIT_VISITS_TABLE: 'tblVisits' }, now: () => now, fetcher: async url => url.pathname.endsWith('tblVisits') ? { ok: true, json: async () => ({ records: [{ id: 'visit', fields: { Dealer: ['dealer'], 'Audit Date': '2026-07-07', 'Visit Status': 'Completed', 'Total Completed': 768 } }] }) } : { ok: false } });
  const response = await handler({ httpMethod: 'GET' }), data = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);assert.equal(data.completedToday, 1);assert.equal(data.vehiclesCountedToday, null);assert.equal(data.vehicleCountError, 'VEHICLE_ARCHIVE_UNAVAILABLE');
});
