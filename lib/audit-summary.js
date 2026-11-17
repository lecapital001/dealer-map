const complete = value => ['completed', 'submitted', 'signed off'].includes(String(value || '').trim().toLowerCase());
const cancelled = value => ['cancelled', 'canceled'].includes(String(value || '').trim().toLowerCase());
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
function londonDay(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(dayFormat.formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function count(value) {
  if (value === null || value === undefined || value === '' || Array.isArray(value) || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
function summarize(records, now = new Date(), fields = {}) {
  const today = londonDay(now), completionField = fields.completedAt || 'Completed At', vehiclesField = fields.vehicles || 'Vehicles Counted';
  let scheduled = 0, completed = 0, vehicles = 0, missingVehicles = 0, missingCompletion = 0;
  const dealers = {}, seen = new Set();
  for (const record of records) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    const f = record.fields;
    if (cancelled(f['Visit Status'])) continue;
    const scheduledToday = String(f['Audit Date'] || '').slice(0, 10) === today;
    const timestamp = f[completionField];
    // Require a timestamp, not a date-only value, to avoid ambiguous UK day boundaries.
    const completedAt = typeof timestamp === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ? londonDay(timestamp) : null;
    const done = complete(f['Visit Status']), completedToday = done && completedAt === today;
    if (scheduledToday) scheduled++;
    if (scheduledToday && done && !completedAt) missingCompletion++;
    const vehicleCount = count(f[vehiclesField]);
    if (completedToday) {
      completed++;
      if (vehicleCount === null) missingVehicles++;
      else vehicles += vehicleCount;
    }
    if (!scheduledToday && !completedToday) continue;
    for (const id of new Set(Array.isArray(f.Dealer) ? f.Dealer : [])) {
      const entry = dealers[id] ||= { scheduled: 0, completed: 0, vehiclesCounted: 0, missingVehicleCounts: 0, status: 'not_started' };
      if (scheduledToday) entry.scheduled++;
      if (completedToday) { entry.completed++; entry.vehiclesCounted += vehicleCount || 0; if (vehicleCount === null) entry.missingVehicleCounts++; }
      if (done) entry.status = 'completed';
      else if (String(f['Visit Status'] || '').toLowerCase().includes('progress') && entry.status !== 'completed') entry.status = 'in_progress';
    }
  }
  return { available: true, date: today, timeZone: 'Europe/London', generatedAt: new Date(now).toISOString(),
    scheduledToday: scheduled, completedToday: completed, vehiclesCountedToday: missingVehicles ? null : vehicles,
    knownVehiclesCountedToday: vehicles, missingVehicleCounts: missingVehicles, missingCompletionTimes: missingCompletion,
    basis: 'Completion timestamp; vehicle counts from audits completed today', dealers };
}
module.exports = { summarize, londonDay };
