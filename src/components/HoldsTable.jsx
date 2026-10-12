import { useState } from 'react';
import Button from './ui/Button.jsx';
import StatusBadge from './ui/StatusBadge.jsx';
import { PlusIcon } from './ui/icons.jsx';
import { deleteHold, restoreHold, updateHold } from '../lib/api.js';
import { fmtD, isoStr } from '../lib/parseTracker.js';
import { HOLD_BY, HOLD_DAYS, STATUSES, addDays } from '../lib/slots.js';

const field = 'h-8 rounded-md border border-line bg-surface px-2 py-0 text-[13px] text-fg focus-visible:outline-2 focus-visible:outline-accent';
const editField = 'h-8 w-full rounded-md border border-line bg-surface px-2 py-0 text-[13px] text-fg';
const th = 'sticky top-0 z-10 border-b border-line bg-surface px-4 py-3 text-left text-[11px] font-semibold tracking-wider whitespace-nowrap text-muted uppercase';
const td = 'border-b border-line px-4 py-3 align-middle whitespace-nowrap';
const edge = 'border-l border-line'; // separates the pinned actions column
const actTd = `${td} ${edge} sticky right-0 bg-surface group-hover:bg-bg text-right`;
// Fixed column widths (px) so every row, including the edit row, lines up.
const COLS = [
  ['Travel date', 150], ['Lead name', 230], ['Pax', 80, 'right'], ['Agent', 160], ['Hold by', 150],
  ['Status', 150], ['Date of hold', 150], ['Hold expires', 160], ['Released', 150], ['Remarks', 300],
];
const ACT_W = 200;
const TABLE_W = COLS.reduce((a, c) => a + c[1], ACT_W);
const foot = 'sticky bottom-0 border-t border-line bg-bg px-4 py-3';

// Holds & bookings for the selected destination: filters, inline row editing, status actions.
export default function HoldsTable({ pkg, holds, today, selDep, onSelDep, depById, agentOptions, refresh, onNewReservation }) {
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [flSt, setFlSt] = useState('');

  async function saveHold(id, patch) {
    try { await updateHold(id, patch); await refresh(); return true; }
    catch (err) { setMsg({ kind: 'err', text: `Could not update the hold: ${err.message}` }); await refresh(); return false; }
  }

  async function onStatus(h, status) {
    const prev = h.status;
    if (!(await saveHold(h.id, { status }))) return;
    const what = status === 'CANCEL' ? 'Released' : `Marked ${status}`;
    setMsg({ kind: 'ok', text: `${what}: ${h.lead} (${h.pax} pax).`, undo: () => onUndo(h, prev) });
  }

  async function onUndo(h, prev) {
    if (await saveHold(h.id, { status: prev })) setMsg({ kind: 'ok', text: `Undone: ${h.lead} is back to ${prev}.` });
  }

  async function onDelete(h) {
    if (!window.confirm(`Delete ${h.lead} (${h.pax} pax)?

It will be removed from this list. You can restore it from History.`)) return;
    try {
      await deleteHold(h.id);
      await refresh();
      setMsg({ kind: 'ok', text: `Deleted: ${h.lead}.`, undo: async () => { await restoreHold(h.id); await refresh(); setMsg({ kind: 'ok', text: `Restored: ${h.lead}.` }); } });
    } catch (err) { setMsg({ kind: 'err', text: `Could not delete: ${err.message}` }); }
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
    if (!lead) return setMsg({ kind: 'err', text: 'Lead name cannot be empty.' });
    if (!(pax >= 1)) return setMsg({ kind: 'err', text: 'Pax must be at least 1.' });
    const patch = { ...draft, pax, lead_name: lead, agent: draft.agent.trim().toUpperCase(), remarks: draft.remarks.trim() };
    if (await saveHold(editId, patch)) { setEditId(null); setMsg({ kind: 'ok', text: `Saved changes for ${lead}.` }); }
  }

  const rows = holds
    .filter((h) => pkg.deps.some((d) => d.id === h.dep) && (!selDep || h.dep === selDep) && (!flSt || h.status === flSt))
    .sort((a, b) => b.held.localeCompare(a.held));
  // Paid only: PAID-DP + FULL PAYMENT. HOLD and CANCEL are not counted.
  const paidRows = rows.filter((h) => h.status === 'PAID-DP' || h.status === 'FULL PAYMENT');
  const paidPax = paidRows.reduce((a, h) => a + h.pax, 0);
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="m-0 font-display text-base font-bold text-fg">Holds &amp; bookings</h2>
          <p className="m-0 mt-0.5 text-[13px] text-muted">
            {rows.length} record(s) · {selDep ? depById(selDep)?.label : 'all departures'} · <b className="font-semibold text-fg">{paidPax} paid pax</b>
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={onNewReservation}><PlusIcon />New reservation</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <label className="flex items-center gap-2 text-[13px] text-muted">Departure
          <select className={field} value={selDep || ''} onChange={(e) => onSelDep(e.target.value || null)}>
            <option value="">All</option>
            {pkg.deps.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13px] text-muted">Status
          <select className={field} value={flSt} onChange={(e) => setFlSt(e.target.value)}>
            <option value="">All</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        {(selDep || flSt) && <Button variant="ghost" size="sm" onClick={() => { onSelDep(null); setFlSt(''); }}>Clear filters</Button>}
        <div role="status" className={`ml-auto flex items-center gap-2 text-[13px] ${msg.kind === 'err' ? 'text-bad' : msg.kind === 'ok' ? 'text-ok' : 'text-muted'}`}>
          {msg.text || 'Click a row to edit it.'}
          {msg.undo && <Button size="sm" className="h-7" onClick={msg.undo}>Undo</Button>}
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full table-fixed border-separate border-spacing-0 text-[13px] tabular-nums" style={{ minWidth: TABLE_W }}>
          <colgroup>
            {COLS.map(([label, w]) => <col key={label} style={{ width: w }} />)}
            <col style={{ width: ACT_W }} />
          </colgroup>
          <thead>
            <tr>
              {COLS.map(([label, , align]) => <th key={label} className={`${th} ${align === 'right' ? 'text-right' : ''}`}>{label}</th>)}
              <th className={`${th} ${edge} right-0 z-20`}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((h) => {
              const d = depById(h.dep);
              const exp = h.status === 'HOLD' ? addDays(h.held, HOLD_DAYS) : '';
              const expired = exp && exp < isoStr(today);
              if (editId === h.id)
                return (
                  <tr key={h.id} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null); }}>
                    <td className={`${td} bg-info-bg font-medium`}>{d?.label}</td>
                    <td className={`${td} bg-info-bg`}><input className={editField} value={draft.lead_name} onChange={dset('lead_name')} autoFocus /></td>
                    <td className={`${td} bg-info-bg`}><input className={`${editField} text-right`} type="number" min="1" value={draft.pax} onChange={dset('pax')} /></td>
                    <td className={`${td} bg-info-bg`}><select className={editField} value={draft.agent} onChange={dset('agent')}>
                      <option value="">—</option>
                      {agentOptions(draft.agent).map((a) => <option key={a}>{a}</option>)}
                    </select></td>
                    <td className={`${td} bg-info-bg`}><select className={editField} value={draft.hold_by} onChange={dset('hold_by')}>{[...new Set(['', ...HOLD_BY, draft.hold_by])].map((b) => <option key={b} value={b}>{b || 'Agent (self)'}</option>)}</select></td>
                    <td className={`${td} bg-info-bg`}><select className={editField} value={draft.status} onChange={dset('status')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></td>
                    <td className={`${td} bg-info-bg`}><input className={editField} type="date" value={draft.held_on} onChange={dset('held_on')} /></td>
                    <td className={`${td} bg-info-bg text-muted`}>—</td>
                    <td className={`${td} bg-info-bg`}><input className={editField} type="date" value={draft.released_on} onChange={dset('released_on')} disabled={draft.status !== 'CANCEL'} /></td>
                    <td className={`${td} bg-info-bg`}><input className={editField} value={draft.remarks} onChange={dset('remarks')} /></td>
                    <td className={`${td} ${edge} sticky right-0 bg-info-bg`}>
                      <div className="flex justify-end gap-1.5">
                        <Button variant="primary" size="sm" className="h-7" onClick={saveEdit}>Save</Button>
                        <Button size="sm" className="h-7" onClick={() => setEditId(null)}>Cancel</Button>
                      </div>
                    </td>
                  </tr>
                );
              const cancelled = h.status === 'CANCEL';
              const data = `${td} group-hover:bg-bg ${cancelled ? 'text-muted line-through' : 'text-fg'}`;
              const plain = `${td} group-hover:bg-bg`;
              return (
                <tr key={h.id} className="group cursor-pointer" title="Click to edit" onClick={() => startEdit(h)}>
                  <td className={`${data} font-medium`}>{d?.label}</td>
                  <td className={`${data} truncate`} title={h.lead}>{h.lead}</td>
                  <td className={`${data} text-right`}>{h.pax}</td>
                  <td className={data}>{h.agent || '—'}</td>
                  <td className={data}>{h.by || <span className="text-xs text-muted">Agent</span>}</td>
                  <td className={plain}><StatusBadge status={h.status} /></td>
                  <td className={data}>{fmtD(h.held)}</td>
                  <td className={plain}>{!exp ? <span className="text-muted">—</span> : expired ? <StatusBadge status="CANCEL">Expired {fmtD(exp)}</StatusBadge> : <span className="font-semibold text-warn">{fmtD(exp)}</span>}</td>
                  <td className={data}>{h.released ? fmtD(h.released) : '—'}</td>
                  <td className={`${plain} text-xs whitespace-normal ${cancelled ? 'text-muted' : 'text-fg'}`}>
                    {h.remarks || (!h.flag && <span className="text-muted">—</span>)}
                    {h.flag && <span className="mt-0.5 block text-warn">⚠ Check: {h.flag}</span>}
                  </td>
                  <td className={actTd}>
                    <div className="flex justify-end gap-1.5">
                      {h.status === 'HOLD' && <Button size="sm" className="h-7" onClick={stop(() => onStatus(h, 'PAID-DP'))}>Mark DP</Button>}
                      {h.status === 'PAID-DP' && <Button size="sm" className="h-7" onClick={stop(() => onStatus(h, 'FULL PAYMENT'))}>Full paid</Button>}
                      {cancelled
                        ? <><Button size="sm" className="h-7" onClick={stop(() => onStatus(h, 'HOLD'))}>Restore</Button><Button variant="danger" size="sm" className="h-7" onClick={stop(() => onDelete(h))}>Delete</Button></>
                        : <Button variant="ghost" size="sm" className="h-7" onClick={stop(() => onStatus(h, 'CANCEL'))}>Release</Button>}
                    </div>
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={11} className="px-5 py-10 text-center text-[13px] text-muted">No holds match these filters.</td></tr>
            )}
          </tbody>
          {!!rows.length && (
            <tfoot>
              <tr>
                <td colSpan={2} className={`${foot} font-semibold`}>Total paid pax (Paid DP + Full Payment)</td>
                <td className={`${foot} text-right font-bold`}>{paidPax}</td>
                <td colSpan={8} className={`${foot} text-xs text-muted`}>{paidRows.length} booking(s) · Hold and Cancel not counted</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
