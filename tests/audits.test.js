const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarize, londonDay } = require('../lib/audit-summary');
const { createHandler } = require('../netlify/functions/audits');
const now = new Date('2026-07-07T10:00:00Z');
const row = (id, extra = {}) => ({ id, fields: { Dealer: ['dealer-a'], 'Audit Date': '2026-07-07', 'Visit Status': 'Signed Off', 'Total Completed': 10, ...extra } });
test('today means the scheduled audit date, not an inferred completion date', () => {
  const result=summarize([row('late',{'Audit Date':'2026-07-06'}),row('planned',{'Visit Status':'Planned','Total Completed':0}),row('done'),row('cancelled',{'Visit Status':'Canceled'})],now);
  assert.equal(result.completedToday,1);assert.equal(result.scheduledToday,2);assert.equal(result.vehiclesCountedToday,10);assert.equal(result.reportingBasis,'scheduled');
});
test('UK summer midnight and winter midnight use the correct day', () => {
  assert.equal(londonDay('2026-07-06T23:30:00Z'), '2026-07-07');
  assert.equal(londonDay('2026-01-06T23:30:00Z'), '2026-01-06');
  assert.equal(summarize([row('r')], new Date('2026-07-06T23:30:00Z')).completedToday, 1);
});
test('vehicle checks include work in progress, zero is valid and missing counts remain unknown',()=>{
 assert.equal(summarize([row('zero',{'Total Completed':0})],now).vehiclesCountedToday,0);
 const progress=summarize([row('a'),row('b',{'Visit Status':'Started','Total Completed':4})],now);
 assert.equal(progress.vehiclesCountedToday,14);assert.equal(progress.completedToday,1);assert.equal(progress.dealers['dealer-a'].status,'in_progress');
 const missing=summarize([row('a'),row('b',{'Total Completed':undefined})],now);assert.equal(missing.vehiclesCountedToday,null);assert.equal(missing.missingVehicleCounts,1);
});
test('actual Visit Status choices distinguish completion, progress and escalation',()=>{
 const result=summarize([row('a',{'Visit Status':'Completed'}),row('b',{'Visit Status':'Signed Off'}),row('c',{'Visit Status':'VONR Complete'}),row('d',{'Visit Status':'Pending escalation',Dealer:['review']}),row('e',{'Visit Status':'Opened',Dealer:['opened'],'Total Completed':0}),row('f',{'Visit Status':'Self Audit'}),row('g',{'Visit Status':'Remote'})],now);
 assert.equal(result.completedToday,3);assert.equal(result.awaitingReviewToday,1);assert.equal(result.dealers.review.status,'awaiting_review');assert.equal(result.dealers.opened.status,'in_progress');
});
test('duplicate records and linked duplicate dealer records never inflate the totals', () => {
  const record = row('a', { Dealer: ['dealer-a', 'dealer-b', 'dealer-a'] });
  const result = summarize([record, record], now);
  assert.equal(result.completedToday, 1); assert.equal(result.vehiclesCountedToday, 10);
  assert.equal(result.dealers['dealer-a'].completed, 1); assert.equal(result.dealers['dealer-b'].completed, 1);
});
const env = { AIRTABLE_BASE_ID: 'appExample', AIRTABLE_TOKEN: 'test-secret', AIRTABLE_AUDIT_VISITS_TABLE: 'tblVisits' };
test('all Airtable pages must succeed; the API returns aggregates only', async () => {
  const calls = [];
  const handler = createHandler({ env, now: () => now, fetcher: async (url, options) => {
    calls.push({ url, options }); return { ok: true, json: async () => calls.length === 1 ? { records: [row('a')], offset: 'page2' } : { records: [row('b') ] } };
  } });
  const response = await handler({ httpMethod: 'GET' }), result = JSON.parse(response.body);
  assert.equal(response.statusCode, 200); assert.equal(result.completedToday, 2);
  assert.equal(calls[1].url.searchParams.get('offset'), 'page2');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-secret');
  assert(!response.body.includes('test-secret')); assert(!response.body.includes('Visit Status')); assert(!response.body.includes('Completed At'));assert.deepEqual(calls[0].url.searchParams.getAll('fields[]'),['Dealer','Audit Date','Visit Status','Total Completed']);
});
test('a failed second page is unavailable, never a partial total', async () => {
  let calls = 0; const handler = createHandler({ env, now: () => now, fetcher: async () => ++calls === 1 ? { ok: true, json: async () => ({ records: [row('a')], offset: 'next' }) } : { ok: false } });
  const res = await handler({ httpMethod: 'GET' }); assert.equal(res.statusCode, 503); assert.equal(JSON.parse(res.body).available, false); assert(!res.body.includes('completedToday'));
});
test('unconfigured fields do not claim zero; writes are rejected', async () => {
  const handler = createHandler({ env: {}, fetcher: () => { throw new Error('Must not call Airtable'); } });
  assert.equal((await handler({ httpMethod: 'GET' })).statusCode, 503);
  assert.equal((await handler({ httpMethod: 'POST' })).statusCode, 405);
  assert.equal((await handler({ httpMethod: 'OPTIONS' })).statusCode, 204);
});
test('diagnostics distinguish table access, missing fields and date-filter failures without exposing upstream bodies', async () => {
  for (const [status, type, expected] of [[403, 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND', 'AUDIT_TABLE_ACCESS'], [422, 'UNKNOWN_FIELD_NAME', 'AUDIT_FIELDS_MISSING'], [422, 'INVALID_FILTER_BY_FORMULA', 'AUDIT_FILTER_REJECTED'], [401, 'AUTHENTICATION_REQUIRED', 'AIRTABLE_AUTH']]) {
    const handler = createHandler({ env, now: () => now, fetcher: async () => ({ ok: false, status, json: async () => ({ error: { type, message: 'private details test-secret' } }) }) });
    const res = await handler({ httpMethod: 'GET' });
    assert.equal(JSON.parse(res.body).code, expected);
    assert(!res.body.includes('private details')); assert(!res.body.includes('test-secret'));
    assert(!res.body.includes('completedToday'));
  }
});
