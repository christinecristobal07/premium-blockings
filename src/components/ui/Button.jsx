// Shared button. variant: primary | secondary | ghost | danger. size: sm | md | icon.
const base =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-semibold whitespace-nowrap cursor-pointer transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed';
const variants = {
  primary: 'bg-accent text-accent-ink border border-accent hover:brightness-110',
  secondary: 'bg-surface text-fg border border-line hover:bg-bg',
  ghost: 'bg-transparent text-muted border border-transparent hover:bg-bg hover:text-fg',
  danger: 'bg-surface text-bad border border-bad hover:bg-bad-bg',
};
const sizes = { sm: 'h-8 px-3 text-[13px]', md: 'h-9 px-4 text-sm', icon: 'size-8 p-0' };

export default function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...props }) {
  return <button type={type} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}
