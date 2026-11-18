(function () {
  'use strict';
  const root = document.querySelector('[data-meister-dashboard]');
  if (!root) return;
  const value = root.querySelector('[data-meister-value]'), note = root.querySelector('[data-meister-note]');
  let snapshot = null, busy = false;
  const day = () => { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value])); return `${parts.year}-${parts.month}-${parts.day}`; };
  function render(failed) {
    const current = snapshot?.date === day();
    value.textContent = current && Number.isSafeInteger(snapshot.completedToday) ? new Intl.NumberFormat('en-GB').format(snapshot.completedToday) : '—';
    note.textContent = !current ? failed ? 'Connection unavailable' : 'Connecting…' : failed ? 'Saved figure · retrying' : snapshot.missingVehicleIdentities ? 'Archived checks need vehicle links' : 'Recorded check date · today';
  }
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const res = await fetch(root.dataset.meisterDashboard || '/.netlify/functions/meister', { cache: 'no-store', signal: AbortSignal.timeout(18000) });
      if (!res.ok) throw new Error('Unavailable');
      const data = await res.json();
      if (!data.available || data.date !== day() || !(data.completedToday === null || Number.isSafeInteger(data.completedToday) && data.completedToday >= 0)) throw new Error('Invalid snapshot');
      snapshot = data; render(false);
    } catch { render(true); }
    finally { busy = false; }
  }
  render(false); refresh();setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(false);refresh(); } });
})();
