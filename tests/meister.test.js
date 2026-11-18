const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeMeister } = require('../lib/meister-summary');
const { createHandler } = require('../netlify/functions/meister');
const now = new Date('2026-07-07T10:00:00Z');
const live = (id, date = '2026-07-07') => ({ id, fields: { 'MEISTER Checked ?': date } });
const archived = (id, vehicle, date = '2026-07-07') => ({ id, fields: { 'MEISTER Checked ?': date, 'Vehicle Record ID': vehicle ? [vehicle] : [] } });
test('live and archived copies count once per vehicle, independent of audit date and result', () => {
  const record = archived('a', 'v1');record.fields['Date Audited'] = '2026-07-06';record.fields['Global Result'] = 'Fail';
  const result = summarizeMeister([live('v1'), live('v1'), live('old', '2026-07-06')], [record, archived('b','v1'), archived('c','v2')], now);
  assert.equal(result.completedToday, 2);assert.equal(result.missingVehicleIdentities, 0);
});
test('old checks copied into a new archive do not count; empty data is a confirmed zero', () => {
  assert.equal(summarizeMeister([], [archived('a','v1','2026-07-06')], now).completedToday, 0);
  assert.equal(summarizeMeister([], [], now).completedToday, 0);
});
test('unknown archive identities do not produce a false complete total', () => {
  const record = archived('a', null);const result = summarizeMeister([live('v1')], [record,record], now);
  assert.equal(result.completedToday, null);assert.equal(result.knownCompletedToday, 1);assert.equal(result.missingVehicleIdentities, 1);
});
test('UK midnight determines the comparison date', () => {
  assert.equal(summarizeMeister([live('v1')], [], new Date('2026-07-06T23:30:00Z')).completedToday, 1);
  assert.equal(summarizeMeister([live('v1')], [], new Date('2026-01-06T23:30:00Z')).completedToday, 0);
});
const env = { AIRTABLE_BASE_ID: 'appExample', AIRTABLE_TOKEN: 'private-token' };
test('reads all pages with only the date and archive identity fields, returns no individual records', async () => {
  const calls = [];const handler = createHandler({ env, now: () => now, fetcher: async url => {
    calls.push(url);const archive = url.pathname.endsWith('tblWGNorphd092WF3');
    return { ok: true, json: async () => archive ? { records: [archived('a','v1')] } : url.searchParams.has('offset') ? { records: [live('v2')] } : { records: [live('v1')],offset:'next' } };
  } });
  const response = await handler({httpMethod:'GET'});assert.equal(response.statusCode,200);assert.equal(JSON.parse(response.body).completedToday,2);assert.equal(calls.length,3);
  assert.deepEqual(calls[0].searchParams.getAll('fields[]'),['MEISTER Checked ?']);assert(!response.body.includes('private-token'));assert(!response.body.includes('v1'));
});
test('a failed archive read does not report a partial live count or expose upstream details', async () => {
  let calls=0;const handler=createHandler({env,now:()=>now,fetcher:async()=>++calls===1?{ok:true,json:async()=>({records:[live('v1')]})}:{ok:false,status:403,json:async()=>({error:{type:'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND',message:'private-token'}})}});
  const response=await handler({httpMethod:'GET'});assert.equal(response.statusCode,503);assert.equal(JSON.parse(response.body).code,'MEISTER_TABLE_ACCESS');assert(!response.body.includes('completedToday'));assert(!response.body.includes('private-token'));
});
