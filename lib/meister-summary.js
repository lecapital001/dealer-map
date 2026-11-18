const { londonDay } = require('./audit-summary');
function summarizeMeister(live, archived, now = new Date()) {
  const today = londonDay(now), vehicles = new Set(), archiveRows = new Set();
  let missingVehicleIdentities = 0;
  const checkedToday = record => String(record.fields['MEISTER Checked ?'] || '').slice(0, 10) === today;
  for (const record of live) if (checkedToday(record)) vehicles.add(record.id);
  for (const record of archived) {
    if (archiveRows.has(record.id) || !checkedToday(record)) continue;
    archiveRows.add(record.id);
    const ids = record.fields['Vehicle Record ID'];
    if (!Array.isArray(ids) || ids.length !== 1 || typeof ids[0] !== 'string' || !ids[0]) missingVehicleIdentities++;
    else vehicles.add(ids[0]);
  }
  return { available: true, date: today, timeZone: 'Europe/London', generatedAt: new Date(now).toISOString(),
    completedToday: missingVehicleIdentities ? null : vehicles.size, knownCompletedToday: vehicles.size, missingVehicleIdentities,
    basis: 'Distinct vehicles whose recorded MEISTER Checked ? date is today; live and archived records combined, regardless of outcome or scheduled audit date' };
}
module.exports = { summarizeMeister };
