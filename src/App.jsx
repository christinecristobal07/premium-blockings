import { useCallback, useEffect, useMemo, useState } from 'react';
import { configured, getStaff, setStaff } from './lib/supabase.js';
import { deleteHold, loadAll, loadAgents, restoreHold, updateHold } from './lib/api.js';
import { fmtD, isoStr } from './lib/parseTracker.js';
import ImportPanel from './ImportPanel.jsx';
import AgentsPanel from './AgentsPanel.jsx';
import HistoryPanel from './HistoryPanel.jsx';
import DestinationHeader from './DestinationHeader.jsx';
import DepartureEditor from './DepartureEditor.jsx';
import { exportBackup } from './lib/exportBackup.js';
import ReservationsView from './ReservationsView.jsx';
import { HOLD_BY, HOLD_DAYS, STATUSES, addDays, daysLeft, stats } from './lib/slots.js';

export default function App() {
  const today = useMemo(() => new Date(), []);
  const [pkgs, setPkgs] = useState([]);
  const [holds, setHolds] = useState([]);
  const [cur, setCur] = useState(null);
  const [selDep, setSelDep] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'reservations'
  const [depEdit, setDepEdit] = useState(null); // null | { dep } to edit | { dep: null } to add
  const [resDep, setResDep] = useState(''); // departure pre-selected when opening Reservations
  const [showImport, setShowImport] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [exp, setExp] = useState({ busy: false, kind: '', text: '' });
  async function onExport() {
    setExp({ busy: true, kind: 'info', text: 'Preparing the Excel backup…' });
    try {
      const r = await exportBackup();
      setExp({ busy: false, kind: 'info', text: `Downloaded ${r.file}: ${r.destinations} destination(s), ${r.departures} departure(s), ${r.holds} hold(s), ${r.agents} agent(s), ${r.history} history row(s). Save it somewhere safe, e.g. Google Drive.` });
    } catch (e) {
      setExp({ busy: false, kind: 'err', text: `Export failed: ${e.message}` });
    }
  }
  const [staff, setStaffState] = useState(getStaff());
  const pickStaff = (e) => { setStaff(e.target.value); setStaffState(e.target.value); };
  const [agentRows, setAgentRows] = useState([]);
  const [hMsg, setHMsg] = useState({ kind: '', text: '' }); // messages for the Holds table
  const [flSt, setFlSt] = useState('');

  const refresh = useCallback(async (focusId) => {
    try {
      const [d, ag] = await Promise.all([loadAll(), loadAgents()]);
      setPkgs(d.pkgs);
      setHolds(d.holds);
      setAgentRows(ag);
      setCur((c) => focusId || (d.pkgs.some((p) => p.id === c) ? c : d.pkgs[0]?.id ?? null));
      setLoadErr('');
    } catch (e) {
      setLoadErr(`Could not load data from Supabase: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (configured) refresh(); else setLoading(false); }, [refresh]);

  const pkg = pkgs.find((p) => p.id === cur);
  const allDeps = pkgs.flatMap((p) => p.deps.map((d) => ({ ...d, pkg: p })));
  const depById = (id) => allDeps.find((d) => d.id === id);
  const agents = agentRows.map((a) => a.name);
  // Agent dropdown options; keeps a value that is no longer in the list so it is not silently lost.
  const agentOptions = (current) => (current && !agents.includes(current) ? [current, ...agents] : agents);

  async function saveHold(id, patch) {
    try { await updateHold(id, patch); await refresh(); return true; }
    catch (err) { setHMsg({ kind: 'err', text: `Could not update the hold: ${err.message}` }); await refresh(); return false; }
  }

  async function onStatus(h, status) {
    const prev = h.status;
    if (!(await saveHold(h.id, { status }))) return;
    const what = status === 'CANCEL' ? 'Released' : `Marked ${status}`;
    setHMsg({ kind: 'ok', text: `${what}: ${h.lead} (${h.pax} pax).`, undo: () => onUndo(h, prev) });
  }

  async function onUndo(h, prev) {
    if (await saveHold(h.id, { status: prev })) setHMsg({ kind: 'ok', text: `Undone: ${h.lead} is back to ${prev}.` });
  }

  async function onDelete(h) {
    if (!window.confirm(`Delete ${h.lead} (${h.pax} pax)?

It will be removed from this list. You can restore it from History.`)) return;
    try {
      await deleteHold(h.id);
      await refresh();
      setHMsg({ kind: 'ok', text: `Deleted: ${h.lead}.`, undo: async () => { await restoreHold(h.id); await refresh(); setHMsg({ kind: 'ok', text: `Restored: ${h.lead}.` }); } });
    } catch (err) { setHMsg({ kind: 'err', text: `Could not delete: ${err.message}` }); }
  }

  // Inline edit of one hold row
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const dset = (k) => (e) => setDraft((x) => ({ ...x, [k]: e.target.value }));
  const startEdit = (h) => {
    setEditId(h.id);
    setDraft({ hold_by: h.by || '', pax: h.pax, lead_name: h.lead, agent: h.agent || '', status: h.status, held_on: h.held, released_on: h.released, remarks: h.remarks });
  };
  async function saveEdit() {
    const lead = draft.lead_name.trim(), pax = +draft.pax;
    if (!lead) return setHMsg({ kind: 'err', text: 'Lead name cannot be empty.' });
    if (!(pax >= 1)) return setHMsg({ kind: 'err', text: 'Pax must be at least 1.' });
    const patch = { ...draft, pax, lead_name: lead, agent: draft.agent.trim().toUpperCase(), remarks: draft.remarks.trim() };
    if (await saveHold(editId, patch)) { setEditId(null); setHMsg({ kind: 'ok', text: `Saved changes for ${lead}.` }); }
  }

  if (!configured)
    return (
      <div className="wrap">
        <h1>Premium Blockings Portal</h1>
        <div className="banner err">Supabase is not connected yet. Copy <b>.env.example</b> to <b>.env.local</b>, add the Project URL and anon key, then restart <code>npm run dev</code>.</div>
      </div>
    );

  const rows = pkg
    ? holds
        .filter((h) => pkg.deps.some((d) => d.id === h.dep) && (!selDep || h.dep === selDep) && (!flSt || h.status === flSt))
        .sort((a, b) => b.held.localeCompare(a.held))
    : [];

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>Premium Blockings Portal</h1>
          <div className="sub">Live slot availability and holds for fixed-departure packages. Today is {fmtD(isoStr(today))}.</div>
        </div>
        <div className="act" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>You are
            <select value={staff} onChange={pickStaff} aria-invalid={!staff}>
              <option value="">— Choose —</option>
              {HOLD_BY.map((b) => <option key={b}>{b}</option>)}
            </select>
          </label>
          <button className="btn ghost" type="button" onClick={onExport} disabled={exp.busy}>{exp.busy ? 'Exporting…' : 'Export to Excel'}</button>
          <button className="btn ghost" type="button" onClick={() => setShowHistory((v) => !v)}>History</button>
          <button className="btn ghost" type="button" onClick={() => setShowAgents((v) => !v)}>Agents</button>
          <button className="btn" type="button" onClick={() => setShowImport(true)}>+ Import destination</button>
        </div>
      </header>

      <nav className="tabs views" aria-label="Views">
        <button className="tab" aria-current={view === 'dashboard' ? 'page' : undefined} onClick={() => setView('dashboard')}>Dashboard</button>
        <button className="tab" aria-current={view === 'reservations' ? 'page' : undefined} onClick={() => { setResDep(selDep || ''); setView('reservations'); }}>Reservations</button>
      </nav>

      {loadErr && <div className="banner err">{loadErr}</div>}

      {exp.text && <div className={`banner ${exp.kind}`} role="status">{exp.text}</div>}

      {!staff && <div className="banner info">Choose your name under <b>You are</b> (top right) so the History log shows who made each change.</div>}

      {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} onRestored={() => refresh()} />}

      {showAgents && <AgentsPanel agents={agentRows} holds={holds} onClose={() => setShowAgents(false)} onChanged={() => refresh()} />}

      {showImport && (
        <ImportPanel
          today={today}
          existing={pkgs}
          onClose={() => setShowImport(false)}
          onImported={async (id, text) => { setShowImport(false); setSelDep(null); setView('dashboard'); await refresh(id); setExp({ busy: false, kind: 'info', text }); }}
        />
      )}

      {!loading && !pkgs.length && !loadErr && (
        <div className="banner info">No destinations yet. Click <b>+ Import destination</b> and paste the Google Sheet link of a tracker (for example BANGKOK TRACKER).</div>
      )}

      {!!pkgs.length && view === 'reservations' && (
        <ReservationsView
          key={resDep}
          today={today}
          allDeps={allDeps}
          holds={holds}
          agentOptions={agentOptions}
          startDep={resDep}
          onReserved={(focusId) => refresh(focusId)}
        />
      )}

      {!!pkgs.length && view === 'dashboard' && (
        <>
          <nav className="tabs" role="tablist">
            {pkgs.map((p) => (
              <button key={p.id} className="tab" role="tab" aria-selected={p.id === cur} onClick={() => { setCur(p.id); setSelDep(null); setDepEdit(null); }}>
                {p.tab}
              </button>
            ))}
          </nav>

          {pkg && (
            <section style={{ display: 'grid', gap: 12 }}>
              <DestinationHeader
                key={pkg.id}
                pkg={pkg}
                holdCount={holds.filter((h) => pkg.deps.some((d) => d.id === h.dep)).length}
                onChanged={() => refresh()}
                onDeleted={async (n) => { setSelDep(null); await refresh(); setExp({ busy: false, kind: 'info', text: `Deleted ${n}. You can restore it from History.` }); }}
              />
              {depEdit && (
                <DepartureEditor
                  key={depEdit.dep?.id || 'new'}
                  dep={depEdit.dep}
                  destinationId={pkg.id}
                  used={depEdit.dep ? (() => { const s = stats(depEdit.dep, holds); return s.paid + s.held; })() : 0}
                  defaults={(() => { const l = pkg.deps[pkg.deps.length - 1]; return l ? { price: l.price, blocked: l.blocked, code: l.code, itin: l.itin } : {}; })()}
                  onCancel={() => setDepEdit(null)}
                  onSaved={async (label) => { setDepEdit(null); await refresh(pkg.id); setExp({ busy: false, kind: 'info', text: `Saved departure ${label}.` }); }}
                />
              )}
              <div className="deps">
                {pkg.deps.map((d) => {
                  const s = stats(d, holds);
                  const pill = s.avail === 0 ? ['p-full', 'SOLD OUT'] : s.avail <= 4 ? ['p-low', `${s.avail} LEFT`] : ['p-open', 'OPEN'];
                  const w = (v) => `${s.cap ? (v / s.cap) * 100 : 0}%`;
                  return (
                    <div key={d.id} className="depwrap">
                    <button className="dep" aria-pressed={selDep === d.id} onClick={() => setSelDep(selDep === d.id ? null : d.id)}>
                      <div className="row"><span className="date">{d.label}</span><span className={`pill ${pill[0]}`}>{pill[1]}</span></div>
                      <div className="row"><span className="left">{daysLeft(d.date, today)} days before departure</span><span className="left">₱{d.price.toLocaleString()} / pax</span></div>
                      <div className="bar" aria-hidden="true"><i style={{ width: w(s.paid), background: 'var(--info)' }} /><i style={{ width: w(s.held), background: 'var(--warn)' }} /></div>
                      <div className="nums">
                        <div><b>{d.blocked}{d.manual ? `+${d.manual}` : ''}</b>Blocked</div>
                        <div><b>{s.paid}</b>Paid</div><div><b>{s.held}</b>On hold</div><div><b>{s.avail}</b>Available</div>
                      </div>
                      <div style={{ display: 'grid', gap: 2 }}>
                        {d.code && <span><span className="codebadge">CODE: {d.code}</span>{d.itin && <span className="left"> {d.itin}</span>}</span>}
                        {!!pkg.rooming && <span className="left">Rooming list due {fmtD(addDays(d.date, -pkg.rooming))}</span>}
                        {d.fullBy && <span className="left">Full slot: {d.fullBy}</span>}
                        {d.remarks && <span className="left">{d.remarks}</span>}
                      </div>
                    </button>
                    <button className="mini depedit" onClick={() => setDepEdit({ dep: d })}>Edit departure</button>
                    </div>
                  );
                })}
                <button className="dep dep-add" onClick={() => setDepEdit({ dep: null })}>+ Add departure</button>
              </div>
            </section>
          )}

          <section className="main">
            <div className="panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <h3>Holds &amp; bookings</h3>
                <button className="btn" type="button" onClick={() => { setResDep(selDep || pkg?.deps[0]?.id || ''); setView('reservations'); }}>+ New reservation</button>
              </div>
              <div className="filters">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Departure
                  <select value={selDep || ''} onChange={(e) => setSelDep(e.target.value || null)}>
                    <option value="">All</option>
                    {pkg?.deps.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Status
                  <select value={flSt} onChange={(e) => setFlSt(e.target.value)}>
                    <option value="">All</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
              </div>
              <div className={`msg ${hMsg.kind}`} role="status" style={{ marginBottom: 8 }}>
                {hMsg.text || 'Click a row to edit it.'}
                {hMsg.undo && <> <button type="button" className="mini" onClick={hMsg.undo}>Undo</button></>}
              </div>
              <div className="tbl">
                <table>
                  <thead><tr><th></th><th>Hold by</th><th>Travel date</th><th>Pax</th><th>Lead name</th><th>Agent</th><th>Status</th><th>Date of hold</th><th>Hold expires</th><th>Released</th><th>Remarks</th></tr></thead>
                  <tbody>
                    {rows.length ? rows.map((h) => {
                      const d = depById(h.dep);
                      const exp = h.status === 'HOLD' ? addDays(h.held, HOLD_DAYS) : '';
                      const expired = exp && exp < isoStr(today);
                      const sc = h.status === 'FULL PAYMENT' ? 's-FULL' : `s-${h.status}`;
                      if (editId === h.id)
                        return (
                          <tr key={h.id} className="editing" onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null); }}>
                            <td><div className="act">
                              <button className="mini primary" onClick={saveEdit}>Save</button>
                              <button className="mini" onClick={() => setEditId(null)}>Cancel</button>
                            </div></td>
                            <td><select value={draft.hold_by} onChange={dset('hold_by')}>{[...new Set([...HOLD_BY, draft.hold_by])].map((b) => <option key={b} value={b}>{b || '—'}</option>)}</select></td>
                            <td>{d?.label}</td>
                            <td><input type="number" min="1" value={draft.pax} onChange={dset('pax')} style={{ width: 56 }} /></td>
                            <td><input value={draft.lead_name} onChange={dset('lead_name')} autoFocus /></td>
                            <td><select value={draft.agent} onChange={dset('agent')}>
                              <option value="">—</option>
                              {agentOptions(draft.agent).map((a) => <option key={a}>{a}</option>)}
                            </select></td>
                            <td><select value={draft.status} onChange={dset('status')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></td>
                            <td><input type="date" value={draft.held_on} onChange={dset('held_on')} /></td>
                            <td>—</td>
                            <td><input type="date" value={draft.released_on} onChange={dset('released_on')} disabled={draft.status !== 'CANCEL'} /></td>
                            <td><input value={draft.remarks} onChange={dset('remarks')} /></td>
                          </tr>
                        );
                      const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
                      return (
                        <tr key={h.id} className={`clickable ${h.status === 'CANCEL' ? 'cancel' : ''}`} title="Click to edit" onClick={() => startEdit(h)}>
                          <td>
                            <div className="act">
                              <button className="mini" onClick={stop(() => startEdit(h))}>Edit</button>
                              {h.status === 'HOLD' && <button className="mini" onClick={stop(() => onStatus(h, 'PAID-DP'))}>Mark DP</button>}
                              {h.status === 'PAID-DP' && <button className="mini" onClick={stop(() => onStatus(h, 'FULL PAYMENT'))}>Full paid</button>}
                              {h.status === 'CANCEL'
                                ? <><button className="mini" onClick={stop(() => onStatus(h, 'HOLD'))}>Restore</button><button className="mini danger" onClick={stop(() => onDelete(h))}>Delete</button></>
                                : <button className="mini" onClick={stop(() => onStatus(h, 'CANCEL'))}>Release</button>}
                            </div>
                          </td>
                          <td>{h.by}</td><td>{d?.label}</td><td>{h.pax} PAX</td><td>{h.lead}</td><td>{h.agent}</td>
                          <td className="st"><span className={`pill ${sc}`}>{h.status}</span></td>
                          <td>{fmtD(h.held)}</td>
                          <td>{!exp ? '—' : expired ? <span className="pill s-CANCEL">EXPIRED {fmtD(exp)}</span> : <span className="due">{fmtD(exp)}</span>}</td>
                          <td>{h.released ? fmtD(h.released) : '—'}</td>
                          <td className="rem">{h.remarks || (!h.flag && '—')}{h.flag && <span className="flag">⚠ Check: {h.flag}</span>}</td>
                        </tr>
                      );
                    }) : <tr><td colSpan={11} className="note">No holds match these filters.</td></tr>}
                  </tbody>
                  {!!rows.length && (() => {
                    // Paid only: PAID-DP + FULL PAYMENT. HOLD and CANCEL are not counted.
                    const paidRows = rows.filter((h) => h.status === 'PAID-DP' || h.status === 'FULL PAYMENT');
                    const total = paidRows.reduce((a, h) => a + h.pax, 0);
                    return (
                      <tfoot>
                        <tr className="total">
                          <td colSpan={3}>Total pax (Paid DP + Full Payment)</td>
                          <td>{total} PAX</td>
                          <td colSpan={7} className="note">{paidRows.length} booking(s) · Hold and Cancel not counted</td>
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
