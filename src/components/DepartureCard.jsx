import Button from './ui/Button.jsx';
import { fmtD } from '../lib/parseTracker.js';
import { addDays, daysLeft, stats } from '../lib/slots.js';

function Stat({ label, value, dot }) {
  return (
    <div className="flex flex-col">
      <span className="text-xl leading-tight font-bold text-fg">{value}</span>
      <span className="flex items-center gap-1 text-xs text-muted">{dot && <i className={`inline-block size-2 rounded-full ${dot}`} />}{label}</span>
    </div>
  );
}

// Labeled detail row: label on the left, value on the right.
function Detail({ label, children }) {
  return (
    <>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="m-0 font-medium text-fg">{children}</dd>
    </>
  );
}

// One departure: slot numbers, fill bar, details, and Reserve / Edit actions.
export default function DepartureCard({ dep: d, pkg, holds, today, selected, onSelect, onReserve, onEdit }) {
  const s = stats(d, holds);
  const status = s.avail === 0 ? ['Sold out', 'bg-bad-bg text-bad'] : s.avail <= 4 ? [`${s.avail} left`, 'bg-warn-bg text-warn'] : ['Open', 'bg-ok-bg text-ok'];
  const pct = (v) => `${s.cap ? (v / s.cap) * 100 : 0}%`;

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border bg-surface transition-shadow hover:shadow-md ${selected ? 'border-accent ring-1 ring-accent' : 'border-line'}`}>
      <button
        type="button"
        aria-pressed={selected}
        title={selected ? 'Show holds for all departures' : "Show only this departure's holds"}
        onClick={onSelect}
        className="flex flex-1 cursor-pointer flex-col gap-4 border-0 bg-transparent p-5 text-left font-body text-fg"
      >
        <div className="flex w-full items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">Travel dates</div>
            <div className="font-display text-[17px] font-bold">{d.label}</div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide whitespace-nowrap uppercase ${status[1]}`}>{status[0]}</span>
        </div>

        <div className="flex h-2 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
          <i className="block h-full bg-info" style={{ width: pct(s.paid) }} />
          <i className="block h-full bg-warn" style={{ width: pct(s.held) }} />
        </div>

        <div className="grid w-full grid-cols-4 items-end gap-2 tabular-nums">
          <Stat label="Blocked" value={`${d.blocked}${d.manual ? `+${d.manual}` : ''}`} />
          <Stat label="Paid" value={s.paid} dot="bg-info" />
          <Stat label="On hold" value={s.held} dot="bg-warn" />
          <div className={`flex flex-col rounded-lg border px-2 py-1 ${s.avail ? 'border-warn bg-warn-bg text-warn' : 'border-bad bg-bad-bg text-bad'}`}>
            <span className="text-xl leading-tight font-bold">{s.avail || 'FULL'}</span>
            <span className="text-xs font-semibold">{s.avail ? 'Available' : 'No slots left'}</span>
          </div>
        </div>

        <dl className="m-0 grid w-full grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 border-t border-line pt-3 text-[13px]">
          <Detail label="Price">₱{d.price.toLocaleString()} / pax</Detail>
          <Detail label="Days to go">{daysLeft(d.date, today)} days</Detail>
          {d.code && <Detail label="Package code"><span className="codebadge">{d.code}</span></Detail>}
          {d.itin && <Detail label="Itinerary">{d.itin}</Detail>}
          {!!pkg.rooming && <Detail label="Rooming list due">{fmtD(addDays(d.date, -pkg.rooming))}</Detail>}
          {d.fullBy && <Detail label="Full slot">{d.fullBy}</Detail>}
          {d.remarks && <Detail label="Remarks">{d.remarks}</Detail>}
        </dl>
      </button>

      <div className="flex gap-2 border-t border-line bg-bg/50 px-5 py-3">
        <Button variant="primary" size="sm" className="flex-1" disabled={!s.avail} title={s.avail ? 'Reserve slots on this departure' : 'Fully booked'} onClick={onReserve}>
          {s.avail ? 'Reserve' : 'Fully booked'}
        </Button>
        <Button variant="secondary" size="sm" onClick={onEdit}>Edit</Button>
      </div>
    </div>
  );
}
