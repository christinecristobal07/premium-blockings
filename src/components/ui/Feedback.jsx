import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Button from './Button.jsx';

// App-wide confirm dialog and toasts, replacing window.confirm and inline banners.
//   const confirm = useConfirm();  if (!(await confirm({ title, message, confirmText, tone: 'danger' }))) return;
//   const toast = useToast();      toast({ kind: 'ok' | 'err' | 'info', text, action: { label: 'Undo', onClick } });
const FeedbackCtx = createContext(null);
export const useConfirm = () => useContext(FeedbackCtx).confirm;
export const useToast = () => useContext(FeedbackCtx).toast;

const TOAST_MS = { ok: 5000, info: 7000, err: 9000 };
const TONE = {
  ok: 'border-ok bg-ok-bg text-ok',
  info: 'border-info bg-info-bg text-info',
  err: 'border-bad bg-bad-bg text-bad',
};
const ICON = { ok: '✓', info: 'i', err: '!' };

function ConfirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', tone = 'primary', onClose }) {
  const okRef = useRef(null);
  const cancelRef = useRef(null);
  useEffect(() => {
    (tone === 'danger' ? cancelRef : okRef).current?.focus(); // never pre-focus a destructive action
    const onKey = (e) => { if (e.key === 'Escape') onClose(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, tone]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => onClose(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmTitle"
        aria-describedby="confirmMsg"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface text-fg shadow-2xl"
      >
        <div className="flex gap-3 px-6 pt-6">
          <span className={`grid size-9 shrink-0 place-items-center rounded-full text-base font-bold ${tone === 'danger' ? 'bg-bad-bg text-bad' : 'bg-info-bg text-info'}`} aria-hidden="true">
            {tone === 'danger' ? '!' : '?'}
          </span>
          <div className="min-w-0">
            <h2 id="confirmTitle" className="m-0 font-display text-lg font-bold">{title}</h2>
            <div id="confirmMsg" className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-muted">{message}</div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-line bg-bg/50 px-6 py-4">
          <Button ref={cancelRef} onClick={() => onClose(false)}>{cancelText}</Button>
          <Button ref={okRef} variant={tone === 'danger' ? 'dangerSolid' : 'primary'} onClick={() => onClose(true)}>{confirmText}</Button>
        </div>
      </div>
    </div>
  );
}

function Toast({ t, onDismiss }) {
  const onClose = () => onDismiss(t.id);
  useEffect(() => {
    const id = setTimeout(() => onDismiss(t.id), TOAST_MS[t.kind] || 6000);
    return () => clearTimeout(id);
  }, [t.id, t.kind, onDismiss]);
  return (
    <div role={t.kind === 'err' ? 'alert' : 'status'} className="pointer-events-auto flex w-[min(420px,calc(100vw-32px))] items-start gap-3 rounded-lg border border-line bg-surface p-3.5 text-sm text-fg shadow-lg">
      <span className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold ${TONE[t.kind] || TONE.info}`} aria-hidden="true">{ICON[t.kind] || ICON.info}</span>
      <div className="min-w-0 flex-1 pt-0.5 leading-snug">{t.text}</div>
      {t.action && <Button size="sm" className="h-7" onClick={() => { t.action.onClick(); onClose(); }}>{t.action.label}</Button>}
      <button type="button" onClick={onClose} aria-label="Dismiss" className="cursor-pointer border-0 bg-transparent p-0.5 text-lg leading-none text-muted hover:text-fg">×</button>
    </div>
  );
}

export function FeedbackProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const confirm = useCallback((opts) => new Promise((resolve) => {
    setDialog({ ...opts, resolve });
  }), []);
  const closeDialog = useCallback((ok) => {
    setDialog((d) => { d?.resolve(ok); return null; });
  }, []);

  const toast = useCallback((t) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-3), { ...t, id }]);
  }, []);
  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  return (
    <FeedbackCtx.Provider value={{ confirm, toast }}>
      {children}
      {dialog && <ConfirmDialog {...dialog} onClose={closeDialog} />}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col items-end gap-2">
        {toasts.map((t) => <Toast key={t.id} t={t} onDismiss={dismiss} />)}
      </div>
    </FeedbackCtx.Provider>
  );
}
