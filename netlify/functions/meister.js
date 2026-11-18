const { londonDay } = require('../../lib/audit-summary');
const { summarizeMeister } = require('../../lib/meister-summary');
const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,OPTIONS', 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
function createHandler({ env = process.env, fetcher = fetch, now = () => new Date() } = {}) {
  return async event => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'GET') return response(405, { available: false, error: 'Read-only endpoint' });
    const base = env.AIRTABLE_BASE_ID, token = env.AIRTABLE_TOKEN;
    if (!base || !token) return response(503, { available: false, error: 'MEISTER reporting is not configured' });
    const time = now(), today = londonDay(time), signal = AbortSignal.timeout(18000);
    async function list(table, fields) {
      const records = [], offsets = new Set(); let offset;
      do {
        const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}`);
        fields.forEach(field => url.searchParams.append('fields[]', field));
        url.searchParams.set('pageSize', '100');
        url.searchParams.set('filterByFormula', `IS_SAME({MEISTER Checked ?},DATETIME_PARSE("${today}"),'day')`);
        if (offset) url.searchParams.set('offset', offset);
        const res = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, signal });
        if (!res.ok) {
          const upstream = await res.json().catch(() => ({}));
          const code = res.status === 401 ? 'AIRTABLE_AUTH' : [403, 404].includes(res.status) ? 'MEISTER_TABLE_ACCESS' : upstream?.error?.type === 'UNKNOWN_FIELD_NAME' ? 'MEISTER_FIELDS_MISSING' : 'MEISTER_READ_FAILED';
          throw Object.assign(new Error('MEISTER read failed'), { code });
        }
        const data = await res.json();
        if (!Array.isArray(data.records) || data.records.some(r => !r?.id || !r.fields)) throw new Error('Invalid response');
        records.push(...data.records); offset = data.offset;
        if (records.length > 20000 || offset && (typeof offset !== 'string' || offsets.has(offset))) throw new Error('Invalid pagination');
        if (offset) { offsets.add(offset); await new Promise(resolve => setTimeout(resolve, 250)); }
      } while (offset);
      return records;
    }
    try {
      const live = await list(env.AIRTABLE_VEHICLES_TABLE || 'tbl94CHYOKqCxgqLc', ['MEISTER Checked ?']);
      const archived = await list(env.AIRTABLE_AUDITED_VEHICLES_TABLE || 'tblWGNorphd092WF3', ['MEISTER Checked ?', 'Vehicle Record ID']);
      return response(200, summarizeMeister(live, archived, time));
    } catch (error) {
      return response(503, { available: false, code: error.code || 'MEISTER_READ_FAILED', error: 'MEISTER checks could not be refreshed. Check read access to Vehicles and Audited Vehicles and their MEISTER date fields.' });
    }
  };
}
exports.handler = createHandler();
exports.createHandler = createHandler;
