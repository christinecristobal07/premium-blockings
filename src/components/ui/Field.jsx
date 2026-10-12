// Labeled form field. Pass input props straight through; hint shows under the input.
export const inputCls =
  'h-9 w-full rounded-md border border-line bg-surface px-3 py-0 font-body text-sm text-fg placeholder:text-muted/70 ' +
  'focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30';

export default function Field({ label, hint, className = '', ...input }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[13px] font-semibold text-fg">{label}</span>
      <input className={inputCls} {...input} />
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}
