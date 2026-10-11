import { useEffect, useState } from 'react';
import { loadArchived, loadDeletedHolds, loadHistory, restoreDestination, restoreHold } from './lib/api.js';

const TABLE = { destinations: 'Destination', departures: 'Departure', holds: 'Hold', agents: 'Agent' };
const SKIP = new Set(['id', 'created_at', 'imported_at', 'departure_id', 'destination_id', 'flag']);

const what = (r) => {
  const d = r.new_data || r.old_data || {};
  if (r.table_name === 'holds') return `${d.lead_name} (${d.pax} pax${d.agent ? `, ${d.agent}` : ''})`;
  return d.name || d.label || '';
};

function action(r) {
  if (r.action === 'INSERT') return 'Added';
  if (r.action === 'DELETE') return 'Deleted';
  const was = r.old_data?.archived_at, now = r.new_data?.archived_at;
  if (!was && now) return r.table_name === 'destinations' ? 'Archived' : 'Deleted';
  if (was && !now) return 'Restored';
  return 'Changed';
}

const show = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const changes = (r) =>
  r.action !== 'UPDATE' ? '' :
  Object.keys(r.new_data || {})
    .filter((k) => !SKIP.has(k) && k !== 'archived_at' && JSON.stringify(r.old_data?.[k]) !== JSON.stringify(r.new_data[k]))
    .map((k) => `${k.replace(/_/g, ' ')}: ${show(r.old_data?.[k])} → ${show(r.new_data[k])}`)
    .join(' · ');

// Every add, change and archive in the database, newest first, plus archived destinations that can be restored.
export default function HistoryPanel({ onClose, onRestored }) {
  const [rows, setRows] = useState([]);
  const [archived, setArchived] = useState([]);
  const [delHolds, setDelHolds] = useState([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  async function load() {
    try {
      const [h, a, dh] = await Promise.all([loadHistory(), loadArchived(), loadDeletedHolds()]);
      setRows(h); setArchived(a); setDelHolds(dh); setErr('');
    } catch (e) { setErr(`Could not load history: ${e.message}`); }
  }
  useEffect(() => { load(); }, []);

  async function restore(d) {
    if (!window.confirm(`Restore ${d.name}? It will show again as a destination tab.`)) return;
    try { await restoreDestination(d.id); await load(); await onRestored(); }
    catch (e) { setErr(`Could not restore: ${e.message}`); }
  }

  async function restoreH(h) {
    try { await restoreHold(h.id); await load(); await onRestored(); }
    catch (e) { setErr(`Could not restore: ${e.message}`); }
  }

  const needle = q.trim().toLowerCase();
  const shown = rows
    .map((r) => ({ ...r, _what: what(r), _act: action(r), _chg: changes(r) }))
    .filter((r) => !needle || [r.staff, r._what, r._act, r._chg, TABLE[r.table_name]].join(' ').toLowerCase().includes(needle));

  return (
    <section className="panel">
      <h3>History</h3>
      {err && <p className="msg err">{err}</p>}

      {!!archived.length && (
        <>
          <div className="prevh">Archived destinations (replaced by an import; nothing was deleted)</div>
          <div className="tbl" style={{ marginBottom: 14 }}>
            <table>
              <thead><tr><th>Destination</th><th>Code</th><th>Archived</th><th></th></tr></thead>
              <tbody>
                {archived.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td><td>{d.code || '—'}</td><td>{new Date(d.archived_at).toLocaleString()}</td>
                    <td><button className="mini" onClick={() => restore(d)}>Restore</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!!delHolds.length && (
        <>
          <div className="prevh">Deleted holds (hidden; restore brings them back as CANCEL)</div>
          <div className="tbl" style={{ marginBottom: 14 }}>
            <table>
              <thead><tr><th>Lead name</th><th>Pax</th><th>Agent</th><th>Departure</th><th>Deleted</th><th></th></tr></thead>
              <tbody>
                {delHolds.map((h) => (
                  <tr key={h.id}>
                    <td>{h.lead_name}</td><td>{h.pax}</td><td>{h.agent || '—'}</td>
                    <td>{h.departures?.destinations?.name} · {h.departures?.label}</td>
                    <td>{new Date(h.archived_at).toLocaleString()}</td>
                    <td><button className="mini" onClick={() => restoreH(h)}>Restore</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="filters">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Search
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, agent, staff, status…" />
        </label>
        <span className="note">Latest {rows.length} changes</span>
      </div>
      <div className="tbl" style={{ maxHeight: 480, overflowY: 'auto' }}>
        <table>
          <thead><tr><th>When</th><th>By</th><th>Action</th><th>Type</th><th>Record</th><th>What changed</th></tr></thead>
          <tbody>
            {shown.length ? shown.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.at).toLocaleString()}</td>
                <td>{r.staff}</td>
                <td>{r._act}</td>
                <td>{TABLE[r.table_name] || r.table_name}</td>
                <td>{r._what}</td>
                <td className="rem">{r._chg || '—'}</td>
              </tr>
            )) : <tr><td colSpan={6} className="note">No changes found.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="act" style={{ marginTop: 12 }}>
        <button className="mini" type="button" onClick={onClose}>Close</button>
      </div>
    </section>
  );
}
