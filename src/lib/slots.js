import { isoStr } from './parseTracker.js';

export const HOLD_DAYS = 3; // no DP within 3 days = released
export const HOLD_BY = ['TINE', 'PAT', 'KC']; // admins who can hold for an agent (same names as the trackers)
export const STATUSES = ['HOLD', 'PAID-DP', 'FULL PAYMENT', 'CANCEL'];

export const addDays = (s, d) => { const x = new Date(s + 'T00:00'); x.setDate(x.getDate() + d); return isoStr(x); };
export const daysLeft = (s, today) => Math.round((new Date(s + 'T00:00') - new Date(isoStr(today) + 'T00:00')) / 864e5);

export function stats(dep, holds) {
  const live = holds.filter((h) => h.dep === dep.id && h.status !== 'CANCEL');
  const paid = live.filter((h) => h.status !== 'HOLD').reduce((a, h) => a + h.pax, 0);
  const held = live.filter((h) => h.status === 'HOLD').reduce((a, h) => a + h.pax, 0);
  const cap = dep.blocked + (dep.manual || 0);
  return { paid, held, cap, avail: Math.max(0, cap - paid - held) };
}

// Phase 2 hook: once users log in, an agent sees only their own reservations and an admin sees all.
// Until then everyone is treated as an admin.
export function visibleReservations(holds, user = { role: 'admin' }) {
  if (user.role === 'agent') return holds.filter((h) => h.agent === user.agent);
  return holds;
}
