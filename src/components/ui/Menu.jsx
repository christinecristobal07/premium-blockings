import { useEffect, useRef, useState } from 'react';

// Dropdown menu. trigger: (props) => <button {...props} />. items: [{ label, icon, onClick, danger }].
export default function Menu({ trigger, items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ onClick: () => setOpen((v) => !v), 'aria-haspopup': 'menu', 'aria-expanded': open })}
      {open && (
        <div role="menu" className={`absolute top-full z-30 mt-1 min-w-48 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); it.onClick(); }}
              className={`flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left font-body text-[13px] font-medium hover:bg-bg ${it.danger ? 'text-bad' : 'text-fg'}`}
            >
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
