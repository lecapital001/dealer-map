const complete = value => ['completed', 'signed off', 'vonr complete'].includes(String(value || '').trim().toLowerCase());
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
  const today = londonDay(now), vehiclesField = fields.vehicles || 'Total Completed';
  let scheduled = 0, completed = 0, vehicles = 0, missingVehicles = 0, awaitingReview = 0;
  const dealers = {}, seen = new Set();
  for (const record of records) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    const f = record.fields;
    if (cancelled(f['Visit Status'])) continue;
    const scheduledToday = String(f['Audit Date'] || '').slice(0, 10) === today;
    if (!scheduledToday) continue;
    const done = complete(f['Visit Status']), completedToday = done;
    scheduled++;
    const vehicleCount = count(f[vehiclesField]);
    if (completedToday) completed++;
    if (vehicleCount === null) missingVehicles++;
    else vehicles += vehicleCount;
    if (String(f['Visit Status'] || '').trim().toLowerCase() === 'pending escalation') awaitingReview++;
    for (const id of new Set(Array.isArray(f.Dealer) ? f.Dealer : [])) {
      const entry = dealers[id] ||= { scheduled: 0, completed: 0, vehiclesCounted: 0, missingVehicleCounts: 0, status: 'not_started' };
      if (scheduledToday) entry.scheduled++;
      if (completedToday) entry.completed++;
      entry.vehiclesCounted += vehicleCount || 0; if (vehicleCount === null) entry.missingVehicleCounts++;
      entry.unfinished = (entry.unfinished || 0) + (done ? 0 : 1);
      entry.awaitingReview = (entry.awaitingReview || 0) + (String(f['Visit Status'] || '').trim().toLowerCase()==='pending escalation'?1:0);
      if (done) entry.status = 'completed';
      else if (String(f['Visit Status'] || '').trim().toLowerCase() === 'pending escalation') entry.status = 'awaiting_review';
      else if ((vehicleCount > 0 || ['opened','started'].includes(String(f['Visit Status'] || '').trim().toLowerCase())) && !['completed','awaiting_review'].includes(entry.status)) entry.status = 'in_progress';
    }
  }
  for(const entry of Object.values(dealers)){if(entry.awaitingReview)entry.status='awaiting_review';else if(entry.completed&&entry.unfinished)entry.status='in_progress';}
  return { available: true, date: today, timeZone: 'Europe/London', generatedAt: new Date(now).toISOString(),
    scheduledToday: scheduled, completedToday: completed, vehiclesCountedToday: missingVehicles ? null : vehicles,
    knownVehiclesCountedToday: vehicles, missingVehicleCounts: missingVehicles, missingCompletionTimes: 0, awaitingReviewToday: awaitingReview,
    reportingBasis: 'scheduled', basis: 'Visits scheduled for today in UK time; checked-vehicle rollups include work in progress', dealers };
}
module.exports = { summarize, londonDay };
