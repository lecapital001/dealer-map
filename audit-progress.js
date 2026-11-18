(function () {
  'use strict';
  const root = document.querySelector('[data-audit-dashboard]');
  if (!root) return;
  const number = new Intl.NumberFormat('en-GB');
  let snapshot = null, busy = false;
  const day = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value])); return `${p.year}-${p.month}-${p.day}`; };
  function render(failed) {
    const current = snapshot?.date === day();
    for (const [key, field] of [['completed', 'completedToday'], ['vehicles', 'vehiclesCountedToday'], ['scheduled', 'scheduledToday']]) {
      const value = current ? snapshot[field] : null;
      root.querySelector(`[data-audit-value="${key}"]`).textContent = Number.isSafeInteger(value) && value >= 0 ? number.format(value) : '—';
    }
    const note = root.querySelector('[data-audit-note]');
    if (!current) note.textContent = failed ? 'Audit reporting unavailable · setup or connection required' : 'Connecting to audit reporting…';
    else if (failed) note.textContent = 'Saved audit figures · retrying';
    else if (snapshot.vehicleCountError) note.textContent = 'Vehicle archive unavailable · audit progress is current';
    else if (snapshot.missingVehicleCounts || snapshot.missingCompletionTimes) note.textContent = `${snapshot.missingVehicleCounts || 0} vehicle counts · ${snapshot.missingCompletionTimes || 0} completion times missing`;
    else if(snapshot.awaitingReviewToday) note.textContent = snapshot.awaitingReviewToday+' awaiting review · audits scheduled today · UK time';
    else note.textContent = 'Audits scheduled today · UK time · updated ' + new Date(snapshot.generatedAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
    window.DealerAuditData = current ? snapshot : null;
    document.dispatchEvent(new CustomEvent('dealer-audits-updated'));
  }
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const res = await fetch(root.dataset.auditDashboard || '/.netlify/functions/audits', { cache: 'no-store', signal: AbortSignal.timeout(18000) });
      if (!res.ok) throw new Error('Unavailable');
      const data = await res.json();
      if (!data.available || data.date !== day() || !data.dealers || !['completedToday', 'scheduledToday'].every(key => Number.isSafeInteger(data[key]) && data[key] >= 0) || !(data.vehiclesCountedToday === null || Number.isSafeInteger(data.vehiclesCountedToday) && data.vehiclesCountedToday >= 0)) throw new Error('Invalid audit snapshot');
      snapshot = data; render(false);
    } catch { render(true); }
    finally { busy = false; }
  }
  render(false); refresh();
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(false); refresh(); } });
})();
