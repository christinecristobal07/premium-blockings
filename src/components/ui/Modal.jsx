import { useEffect } from 'react';

// Centered dialog. Closes on Esc and backdrop click unless busy. footer = action buttons row.
export default function Modal({ title, description, onClose, busy = false, footer, width = 'max-w-lg', children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modalTitle"
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[calc(100vh-32px)] w-full ${width} flex-col overflow-hidden rounded-xl border border-line bg-surface text-fg shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 id="modalTitle" className="m-0 font-display text-lg font-bold">{title}</h2>
            {description && <p className="m-0 mt-1 text-[13px] text-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="cursor-pointer border-0 bg-transparent p-1 text-xl leading-none text-muted hover:text-fg">×</button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-bg/50 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
