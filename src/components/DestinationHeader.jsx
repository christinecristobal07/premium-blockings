import { useState } from 'react';
import { archiveDestination, updateDestination } from '../lib/api.js';
import { stats } from '../lib/slots.js';
import Button from './ui/Button.jsx';
import Field from './ui/Field.jsx';
import Menu from './ui/Menu.jsx';
import Modal from './ui/Modal.jsx';
import { useConfirm, useToast } from './ui/Feedback.jsx';
import { EditIcon, MoreIcon, TrashIcon } from './ui/icons.jsx';

function Summary({ label, value, tone = 'text-fg' }) {
  return (
    <div className="flex flex-col px-5 first:pl-0">
      <span className={`text-xl leading-tight font-bold tabular-nums ${tone}`}>{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

// Summary bar of the open destination: name, code, slot totals, Edit (modal) and More > Delete.
// Delete archives it with its departures and holds; it can be restored from History.
export default function DestinationHeader({ pkg, holds, onChanged, onDeleted }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [draft, setDraft] = useState(null); // open Edit modal when set
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const totals = pkg.deps.reduce((t, d) => {
    const s = stats(d, holds);
    return { cap: t.cap + s.cap, paid: t.paid + s.paid, held: t.held + s.held, avail: t.avail + s.avail };
  }, { cap: 0, paid: 0, held: 0, avail: 0 });
  const holdCount = holds.filter((h) => pkg.deps.some((d) => d.id === h.dep)).length;

  async function save(e) {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) return setErr('Name cannot be empty.');
    const rooming = Number(draft.rooming_days);
    if (!Number.isInteger(rooming) || rooming < 0) return setErr('Rooming list days must be 0 or more.');
    setBusy(true);
    try {
      await updateDestination(pkg.id, {
        name, itinerary: draft.itinerary.trim() || null, code: draft.code.trim().toUpperCase() || null,
        dest: draft.dest.trim().toUpperCase() || null, rooming_days: rooming,
      });
      setDraft(null);
      toast({ kind: 'ok', text: `Saved ${name}.` });
      await onChanged();
    } catch (ex) { setErr(`Could not save: ${ex.message}`); }
    finally { setBusy(false); }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete ${pkg.tab}?`,
      message: `Its ${pkg.deps.length} departure(s) and ${holdCount} hold(s) will be hidden from the portal.\nNothing is erased: you can restore it anytime from History.`,
      confirmText: 'Delete destination',
      tone: 'danger',
    });
    if (!ok) return;
    try { await archiveDestination(pkg.id); await onDeleted(pkg.tab); }
    catch (ex) { toast({ kind: 'err', text: `Could not delete: ${ex.message}` }); }
  }

  const openEdit = () => { setErr(''); setDraft({ ...pkg.raw }); };

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">
            {pkg.tab}{pkg.dest ? ` · ${pkg.dest}` : ''}
          </div>
          <h2 className="m-0 mt-0.5 font-display text-xl font-bold text-fg">{pkg.name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted">
            <span className="codebadge">CODE: {pkg.code}</span>
            <span>{pkg.rooming ? `Rooming list due ${pkg.rooming} days before departure` : 'No rooming list deadline'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openEdit}><EditIcon />Edit</Button>
          <Menu
            trigger={(p) => <Button size="icon" aria-label="More actions" title="More actions" {...p}><MoreIcon /></Button>}
            items={[{ label: 'Delete destination', icon: <TrashIcon />, danger: true, onClick: remove }]}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-y-3 divide-x divide-line border-t border-line pt-4">
        <Summary label="Departures" value={pkg.deps.length} />
        <Summary label="Blocked slots" value={totals.cap} />
        <Summary label="Paid" value={totals.paid} tone="text-info" />
        <Summary label="On hold" value={totals.held} tone="text-warn" />
        <Summary label="Available" value={totals.avail} tone={totals.avail ? 'text-ok' : 'text-bad'} />
      </div>

      {draft && (
        <Modal
          title="Edit destination"
          description="Changes apply to every departure under this destination."
          onClose={() => setDraft(null)}
          busy={busy}
          footer={<>
            <Button onClick={() => setDraft(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" type="submit" form="destForm" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
          </>}
        >
          <form id="destForm" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2" label="Name (tab)" value={draft.name} onChange={set('name')} autoFocus />
            <Field className="sm:col-span-2" label="Itinerary" value={draft.itinerary} onChange={set('itinerary')} placeholder="e.g. 4D3N BANGKOK FREE AND EASY" />
            <Field label="Package code" value={draft.code} onChange={set('code')} placeholder="e.g. SBBK2B1" />
            <Field label="Destination" value={draft.dest} onChange={set('dest')} placeholder="e.g. BKK" />
            <Field className="sm:col-span-2" label="Rooming list due" hint="Days before departure. 0 = no deadline." type="number" min="0" value={draft.rooming_days} onChange={set('rooming_days')} />
            {err && <p role="alert" className="m-0 rounded-md bg-bad-bg px-3 py-2 text-[13px] text-bad sm:col-span-2">{err}</p>}
          </form>
        </Modal>
      )}
    </section>
  );
}
