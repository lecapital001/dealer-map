const { summarize, londonDay } = require('../../lib/audit-summary');
const { countArchivedVehicles } = require('../../lib/archived-vehicle-count');
const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,OPTIONS', 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
function createHandler({ env = process.env, fetcher = fetch, now = () => new Date() } = {}) {
  return async event => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'GET') return response(405, { available: false, error: 'Read-only endpoint' });
    const { AIRTABLE_BASE_ID: base, AIRTABLE_TOKEN: token, AIRTABLE_AUDIT_VISITS_TABLE: table } = env;
    if (!base || !token || !table) return response(503, { available: false, error: 'Audit reporting is not configured' });
    const fields = { vehicles: env.AIRTABLE_AUDIT_VEHICLES_FIELD || 'Total Completed' };
    if ([fields.vehicles].some(f => /[{}]/.test(f))) return response(503, { available: false, error: 'Invalid audit field configuration' });
    const time = now(), today = londonDay(time), records = [], offsets = new Set();
    let offset;
    try {
      const signal = AbortSignal.timeout(18000);
      do {
        const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}`);
        for (const field of ['Dealer', 'Audit Date', 'Visit Status', fields.vehicles]) url.searchParams.append('fields[]', field);
        url.searchParams.set('pageSize', '100');
        url.searchParams.set('filterByFormula', `IS_SAME({Audit Date},DATETIME_PARSE("${today}"),'day')`);
        if (offset) url.searchParams.set('offset', offset);
        const res = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, signal });
        if (!res.ok) {
          // Classify known upstream failures without forwarding bodies or credentials.
          const upstream = await res.json().catch(() => ({}));
          const type = upstream?.error?.type;
          let code = 'AIRTABLE_UNAVAILABLE', message = 'Airtable could not refresh audit data.';
          if (res.status === 401) { code = 'AIRTABLE_AUTH'; message = 'The existing Airtable token was not accepted.'; }
          else if (res.status === 403 || res.status === 404) { code = 'AUDIT_TABLE_ACCESS'; message = 'Check the Audit Visits table ID and the existing token permission to read that table in this base.'; }
          else if (type === 'UNKNOWN_FIELD_NAME') { code = 'AUDIT_FIELDS_MISSING'; message = 'A reporting field is missing. Check Dealer, Audit Date, Visit Status and Total Completed, including a configured vehicle-field override.'; }
          else if (type === 'INVALID_FILTER_BY_FORMULA') { code = 'AUDIT_FILTER_REJECTED'; message = 'Airtable rejected the date filter. Check that Audit Date returns a date and that its field name is unchanged.'; }
          else if (res.status === 429) { code = 'AIRTABLE_RATE_LIMIT'; message = 'Airtable is rate limiting requests. The display will retry.'; }
          return response(503, { available: false, code, error: message });
        }
        const data = await res.json();
        if (!Array.isArray(data.records) || data.records.some(r => !r?.id || !r.fields)) throw new Error('Invalid data');
        records.push(...data.records);
        offset = data.offset;
        if (offset && (typeof offset !== 'string' || offsets.has(offset))) throw new Error('Invalid pagination');
        if (records.length > 20000) throw new Error('Too many rows');
        if (offset) { offsets.add(offset); await new Promise(resolve => setTimeout(resolve, 250)); }
      } while (offset);
      const summary = summarize(records, time, fields);
      // Preserve visit rollups for dealer-level context, but use the LEAPS archive
      // calculation for the dashboard's Vehicles checked KPI.
      summary.scheduledVehiclesCountedToday = summary.vehiclesCountedToday;
      summary.scheduledMissingVehicleCounts = summary.missingVehicleCounts;
      summary.vehiclesCountedToday = null;
      summary.knownVehiclesCountedToday = null;
      summary.missingVehicleCounts = 0;
      summary.vehicleCountBasis = 'Audited Vehicles records with Date Audited today in Europe/London';
      try {
        const count = await countArchivedVehicles({ base, token, table: env.AIRTABLE_AUDITED_VEHICLES_TABLE || 'tblWGNorphd092WF3', time, fetcher, signal });
        summary.vehiclesCountedToday = count;
        summary.knownVehiclesCountedToday = count;
      } catch {
        summary.vehicleCountError = 'VEHICLE_ARCHIVE_UNAVAILABLE';
      }
      return response(200, summary);
    } catch {
      return response(503, { available: false, error: 'Audit data could not be refreshed. Check the reporting fields and read access.' });
    }
  };
}
exports.handler = createHandler();
exports.createHandler = createHandler;
