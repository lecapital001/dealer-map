const { londonDay } = require('./audit-summary');
// Matches LEAPS ArchiveService.CountAuditedVehiclesAsync: archive rows by UK Date Audited.
async function countArchivedVehicles({ base, token, table = 'tblWGNorphd092WF3', time, fetcher, signal }) {
  const today = londonDay(time), records = new Set(), offsets = new Set();let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}`);
    url.searchParams.append('fields[]', 'Date Audited');
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('filterByFormula', `AND({Date Audited} != BLANK(), DATETIME_FORMAT(SET_TIMEZONE({Date Audited}, 'Europe/London'), 'YYYY-MM-DD') = '${today}')`);
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!res.ok) throw new Error('Vehicle archive read failed');
    const data = await res.json();
    if (!Array.isArray(data.records) || data.records.some(r => !r?.id || !r.fields)) throw new Error('Invalid archive data');
    for (const record of data.records) if (record.fields['Date Audited'] && londonDay(record.fields['Date Audited']) === today) records.add(record.id);
    offset = data.offset;
    if (records.size > 20000 || offset && (typeof offset !== 'string' || offsets.has(offset))) throw new Error('Invalid archive pagination');
    if (offset) { offsets.add(offset);await new Promise(resolve => setTimeout(resolve, 250)); }
  } while (offset);
  return records.size;
}
module.exports = { countArchivedVehicles };
