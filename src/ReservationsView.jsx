import { useState } from 'react';
import { reserve } from './lib/api.js';
import { fmtD, isoStr } from './lib/parseTracker.js';
import { HOLD_BY, HOLD_DAYS, STATUSES, addDays, stats, visibleReservations } from './lib/slots.js';

// Reservations view: make a reservation, and see the reservations list.
// Phase 2: the list goes through visibleReservations() so agents only see their own.
export default function ReservationsView({ today, allDeps, holds, agentOptions, startDep, onReserved }) {
  const [form, setForm] = useState({ dep: startDep || '', pax: 2, lead: '', agent: '', by: 'TINE', status: 'HOLD' });
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);
  const [flAgent, setFlAgent] = useState('');
  const [flSt, setFlSt] = useState('');
  const [q, setQ] = useState('');
  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const depById = (id) => allDeps.find((d) => d.id === id);
  const formDep = form.dep || allDeps[0]?.id || '';

  async function onReserve(e) {
    e.preventDefault();
    const d = depById(formDep), pax = +form.pax, lead = form.lead.trim();
    if (!d) return setMsg({ kind: 'err', text: 'Choose a departure.' });
    if (!lead) return setMsg({ kind: 'err', text: 'Enter the lead name.' });
    if (!(pax >= 1)) return setMsg({ kind: 'err', text: 'Pax must be at least 1.' });
    const s = stats(d, holds);
    if (pax > s.avail) return setMsg({ kind: 'err', text: `Only ${s.avail} slot(s) left on ${d.label}. Reduce pax or pick another date.` });
    setBusy(true);
    try {
      await reserve({ dep: d.id, pax, lead, agent: form.agent.trim().toUpperCase(), by: form.by, status: form.status });
      setForm((f) => ({ ...f, lead: '' }));
      await onReserved(d.pkg.id);
      setMsg({ kind: 'ok', text: `Reserved ${pax} pax for ${lead} on ${d.pkg.tab} · ${d.label}.` });
    } catch (err) {
      setMsg({ kind: 'err', text: err.message });
      await onReserved();
    } finally {
      setBusy(false);
    }
  }

  const sel = depById(formDep);
  const selStats = sel && stats(sel, holds);
  const needle = q.trim().toLowerCase();
  const list = visibleReservations(holds)
    .filter((h) => depById(h.dep))
    .filter((h) => (!flAgent || h.agent === flAgent) && (!flSt || h.status === flSt))
    .filter((h) => !needle || [h.lead, h.agent, h.by, h.remarks].join(' ').toLowerCase().includes(needle))
    .sort((a, b) => b.held.localeCompare(a.held));
  const listAgents = [...new Set(holds.map((h) => h.agent).filter(Boolean))].sort();

  return (
    <section className="main">
      <div className="panel">
        <h3>New reservation</h3>
        <form id="f" onSubmit={onReserve}>
          <label className="wide">Departure
            <select id="fDep" value={formDep} onChange={upd('dep')}>
              {allDeps.map((d) => <option key={d.id} value={d.id}>{d.pkg.tab} · {d.label}{d.code ? ` · CODE ${d.code}` : ''} ({stats(d, holds).avail} left)</option>)}
            </select>
          </label>
          <label>Number of pax<input id="fPax" type="number" min="1" value={form.pax} onChange={upd('pax')} /></label>
          <label className="wide">Lead name<input id="fLead" placeholder="e.g. Juan Dela Cruz" value={form.lead} onChange={upd('lead')} /></label>
          <label>Agent
            <select id="fAgent" value={form.agent} onChange={upd('agent')}>
              <option value="">— Choose agent —</option>
              {agentOptions(form.agent).map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label>Hold by<select id="fBy" value={form.by} onChange={upd('by')}>{HOLD_BY.map((b) => <option key={b}>{b}</option>)}</select></label>
          <label>Status<select id="fStatus" value={form.status} onChange={upd('status')}>{STATUSES.slice(0, 3).map((s) => <option key={s}>{s}</option>)}</select></label>
          <button className="btn" disabled={busy || !allDeps.length}>{busy ? 'Saving…' : 'Reserve slots'}</button>
          {sel && (
            <div className="note">
              {sel.code && <><span className="codebadge">CODE: {sel.code}</span>{' '}</>}{sel.pkg.tab} · {sel.label}: {selStats.avail} of {selStats.cap} slot(s) available · ₱{sel.price.toLocaleString()} / pax
            </div>
          )}
          <div className={`msg ${msg.kind}`} role="status">{msg.text}</div>
          <div className="note">Holds without DP are released after {HOLD_DAYS} days.</div>
        </form>
      </div>

      <div className="panel">
        <h3>Reservations</h3>
        <div className="filters">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Agent
            <select value={flAgent} onChange={(e) => setFlAgent(e.target.value)}>
              <option value="">All</option>{listAgents.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Status
            <select value={flSt} onChange={(e) => setFlSt(e.target.value)}>
              <option value="">All</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Search
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lead name, remarks…" />
          </label>
          <span className="note">{list.length} reservation(s) · edit them in Dashboard → Holds &amp; bookings</span>
        </div>
        <div className="tbl">
          <table>
            <thead><tr><th>Destination</th><th>Code</th><th>Travel date</th><th>Pax</th><th>Lead name</th><th>Agent</th><th>Status</th><th>Date of hold</th><th>Hold expires</th></tr></thead>
            <tbody>
              {list.length ? list.map((h) => {
                const d = depById(h.dep);
                const due = h.status === 'HOLD' ? addDays(h.held, HOLD_DAYS) : '';
                const sc = h.status === 'FULL PAYMENT' ? 's-FULL' : `s-${h.status}`;
                return (
                  <tr key={h.id} className={h.status === 'CANCEL' ? 'cancel' : ''}>
                    <td>{d.pkg.tab}</td><td>{d.code ? <span className="codebadge">{d.code}</span> : '—'}</td><td>{d.label}</td><td>{h.pax} PAX</td><td>{h.lead}</td><td>{h.agent || '—'}</td>
                    <td className="st"><span className={`pill ${sc}`}>{h.status}</span></td>
                    <td>{fmtD(h.held)}</td>
                    <td>{!due ? '—' : due < isoStr(today) ? <span className="pill s-CANCEL">EXPIRED {fmtD(due)}</span> : <span className="due">{fmtD(due)}</span>}</td>
                  </tr>
                );
              }) : <tr><td colSpan={9} className="note">No reservations match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
