// Colored pill for a hold status (HOLD, PAID-DP, FULL PAYMENT, CANCEL). children overrides the text.
const tones = {
  HOLD: 'bg-warn-bg text-warn',
  'PAID-DP': 'bg-info-bg text-info',
  'FULL PAYMENT': 'bg-ok-bg text-ok',
  CANCEL: 'bg-bad-bg text-bad',
};

export default function StatusBadge({ status, children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide whitespace-nowrap ${tones[status] || 'bg-bg text-muted'} ${className}`}>
      {children ?? status}
    </span>
  );
}
