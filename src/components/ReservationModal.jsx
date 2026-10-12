import { useEffect } from 'react';

// Pop-up box for a reservation. mode 'review' = check before submit; mode 'done' = saved.
// r: { destination, code, departure, pax, lead, agent, by, status, price, holdExpires, remarks }
export default function ReservationModal({ mode, r, busy, error, onEdit, onConfirm, onDone }) {
  const close = mode === 'done' ? onDone : onEdit;
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, busy]);

  const rows = [
    ['Destination', r.destination],
    ['Package code', r.code ? <span className="codebadge">{r.code}</span> : '—'],
    ['Departure', r.departure],
    ['Number of pax', `${r.pax} PAX`],
    ['Lead name', r.lead],
    ['Agent', r.agent || '—'],
    r.by ? ['Hold by', `${r.by} (admin, for the agent)`] : ['Filled out by', 'Agent (self)'],
    ['Status', r.status],
    ['Price / pax', `₱${r.price.toLocaleString()}`],
    ['Total', `₱${(r.price * r.pax).toLocaleString()}`],
    ...(r.holdExpires ? [['Hold expires', `${r.holdExpires} (no DP = released)`]] : []),
    ...(r.remarks ? [['Remarks', r.remarks]] : []),
  ];

  return (
    <div className="modal-back" onClick={() => !busy && close()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="resTitle" onClick={(e) => e.stopPropagation()}>
        {mode === 'done' ? (
          <div className="modal-head ok">
            <span className="modal-icon" aria-hidden="true">✓</span>
            <h2 id="resTitle">Reservation complete</h2>
          </div>
        ) : (
          <div className="modal-head">
            <h2 id="resTitle">Review your reservation</h2>
          </div>
        )}

        {mode === 'review' && (
          <p className="modal-note"><b>Note:</b> Please check your information before you submit.</p>
        )}

        <dl className="modal-dl">
          {rows.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
        </dl>

        {error && <p className="msg err" role="alert">{error}</p>}

        <div className="modal-actions">
          {mode === 'review' ? (
            <>
              <button className="mini" type="button" onClick={onEdit} disabled={busy}>Edit</button>
              <button className="btn" type="button" onClick={onConfirm} disabled={busy} autoFocus>
                {busy ? 'Submitting…' : 'Confirm & submit'}
              </button>
            </>
          ) : (
            <button className="btn" type="button" onClick={onDone} autoFocus>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}
