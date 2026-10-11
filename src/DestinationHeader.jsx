import { useState } from 'react';
import { archiveDestination, updateDestination } from './lib/api.js';

// Title row of the open destination, with Edit (name, itinerary, code, destination, rooming list) and Delete.
// Delete archives it with its departures and holds; it can be restored from History.
export default function DestinationHeader({ pkg, holdCount, onChanged, onDeleted }) {
  const [draft, setDraft] = useState(null);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) return setMsg({ kind: 'err', text: 'Name cannot be empty.' });
    const rooming = Number(draft.rooming_days);
    if (!Number.isInteger(rooming) || rooming < 0) return setMsg({ kind: 'err', text: 'Rooming list days must be 0 or more.' });
    try {
      await updateDestination(pkg.id, {
        name, itinerary: draft.itinerary.trim() || null, code: draft.code.trim().toUpperCase() || null,
        dest: draft.dest.trim().toUpperCase() || null, rooming_days: rooming,
      });
      setDraft(null);
      setMsg({ kind: 'ok', text: 'Saved.' });
      await onChanged();
    } catch (err) { setMsg({ kind: 'err', text: `Could not save: ${err.message}` }); }
  }

  async function remove() {
    const ok = window.confirm(
      `Delete ${pkg.tab}?\n\nIts ${pkg.deps.length} departure(s) and ${holdCount} hold(s) will be hidden from the portal. ` +
      'Nothing is erased: you can restore it anytime from History.'
    );
    if (!ok) return;
    try { await archiveDestination(pkg.id); await onDeleted(pkg.tab); }
    catch (err) { setMsg({ kind: 'err', text: `Could not delete: ${err.message}` }); }
  }

  if (draft)
    return (
      <form className="panel iform" onSubmit={save}>
        <label>Name (tab)<input value={draft.name} onChange={set('name')} autoFocus /></label>
        <label>Itinerary<input value={draft.itinerary} onChange={set('itinerary')} placeholder="e.g. 4D3N BANGKOK FREE AND EASY" /></label>
        <label>Package code<input value={draft.code} onChange={set('code')} placeholder="e.g. SBBK2B1" /></label>
        <label>Destination<input value={draft.dest} onChange={set('dest')} placeholder="e.g. BKK" /></label>
        <label>Rooming list due (days before departure, 0 = none)<input type="number" min="0" value={draft.rooming_days} onChange={set('rooming_days')} /></label>
        <div className="act" style={{ alignSelf: 'end', gap: 8 }}>
          <button className="btn">Save</button>
          <button className="mini" type="button" onClick={() => { setDraft(null); setMsg({ kind: '', text: '' }); }}>Cancel</button>
        </div>
        {msg.text && <div className={`msg ${msg.kind}`} role="status" style={{ gridColumn: '1/-1' }}>{msg.text}</div>}
      </form>
    );

  return (
    <div className="pkg">
      <h2>{pkg.name}</h2><span className="codebadge">CODE: {pkg.code}</span>
      <span className="act">
        <button className="mini" onClick={() => { setMsg({ kind: '', text: '' }); setDraft({ ...pkg.raw }); }}>Edit destination</button>
        <button className="mini" onClick={remove}>Delete destination</button>
      </span>
      {msg.text && <span className={`msg ${msg.kind}`} role="status">{msg.text}</span>}
    </div>
  );
}
