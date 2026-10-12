import { useState } from 'react';
import { addDeparture, updateDeparture } from '../lib/api.js';
import { depLabel } from '../lib/parseTracker.js';

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Return date read back from a label made by depLabel: "JAN 19-24, 2027" or "NOV 27-DEC 1, 2026".
function returnFromLabel(label) {
  const m = String(label || '').match(/^([A-Z]{3}) \d{1,2}-(?:([A-Z]{3}) )?(\d{1,2}), (\d{4})$/);
  const mi = m ? MON.indexOf(m[2] || m[1]) : -1;
  return mi < 0 ? '' : `${m[4]}-${String(mi + 1).padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

// Add or edit one departure by hand: for trackers the importer reads wrong, or new dates.
// dep = existing departure to edit, or null to add one to destinationId. used = live pax already on it.
export default function DepartureEditor({ dep, destinationId, used = 0, defaults = {}, onSaved, onCancel }) {
  const [f, setF] = useState(() => ({
    depart_on: dep?.date || '',
    return_on: dep ? returnFromLabel(dep.label) : '',
    price: dep?.price ?? defaults.price ?? '',
    blocked: dep?.blocked ?? defaults.blocked ?? '',
    manual: dep?.manual ?? 0,
    code: dep?.code ?? defaults.code ?? '',
    itin: dep?.itin ?? defaults.itin ?? '',
    full_by: dep?.fullBy ?? '',
    remarks: dep?.remarks ?? '',
  }));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    if (!f.depart_on) return setErr('Enter the departure date.');
    if (f.return_on && f.return_on < f.depart_on) return setErr('Return date is before the departure date.');
    const blocked = Number(f.blocked), manual = Number(f.manual || 0), price = Number(f.price || 0);
    if (!Number.isInteger(blocked) || blocked < 0) return setErr('Slots blocked must be a whole number.');
    if (!Number.isInteger(manual) || manual < 0) return setErr('Manual pax must be a whole number.');
    if (blocked + manual < used) return setErr(`${used} pax are already booked or on hold here. Slots cannot go below that.`);
    const fields = {
      depart_on: f.depart_on, label: depLabel(f.depart_on, f.return_on || ''), price, blocked, manual,
      code: f.code.trim().toUpperCase() || null, itin: f.itin.trim() || null,
      full_by: f.full_by.trim() || null, remarks: f.remarks.trim() || null,
    };
    // A typed note is kept as is; the database only auto-fills or clears dates it filled itself.
    if (f.full_by.trim() !== (dep?.fullBy || '').trim()) fields.full_auto = false;
    setBusy(true); setErr('');
    try {
      if (dep) await updateDeparture(dep.id, fields); else await addDeparture(destinationId, fields);
      await onSaved(fields.label);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }

  return (
    <form className="panel iform dep-edit" onSubmit={save}>
      <h3 style={{ gridColumn: '1/-1', margin: 0 }}>{dep ? `Edit departure · ${dep.label}` : 'Add departure'}</h3>
      <label>Departure date<input type="date" value={f.depart_on} onChange={set('depart_on')} autoFocus /></label>
      <label>Return date<input type="date" value={f.return_on} onChange={set('return_on')} /></label>
      <label>Price / pax (PHP)<input type="number" min="0" value={f.price} onChange={set('price')} /></label>
      <label>Slots blocked<input type="number" min="0" value={f.blocked} onChange={set('blocked')} /></label>
      <label>Manual pax (extra)<input type="number" min="0" value={f.manual} onChange={set('manual')} /></label>
      <label>Package code<input value={f.code} onChange={set('code')} placeholder="e.g. UKR13B1" /></label>
      <label>Itinerary<input value={f.itin} onChange={set('itin')} placeholder="e.g. 6D4N KOREA NAMI ISLAND" /></label>
      <label>Full slot (auto-fills when paid pax reach the slots)<input value={f.full_by} onChange={set('full_by')} placeholder="Filled automatically" /></label>
      <label>Remarks<input value={f.remarks} onChange={set('remarks')} /></label>
      <div className="act" style={{ alignSelf: 'end', gap: 8 }}>
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button className="mini" type="button" onClick={onCancel}>Cancel</button>
      </div>
      {used > 0 && <div className="note" style={{ gridColumn: '1/-1' }}>{used} pax already booked or on hold on this departure.</div>}
      {err && <div className="msg err" role="status" style={{ gridColumn: '1/-1' }}>{err}</div>}
    </form>
  );
}
