import Button from '../ui/Button.jsx';
import { DownloadIcon, HistoryIcon, MoonIcon, PlusIcon, SunIcon, UserIcon, UsersIcon } from '../ui/icons.jsx';

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'reservations', label: 'Reservations' },
];

// Sticky top bar: brand, main nav, and app-wide actions.
export default function AppHeader({ view, onNavigate, theme, onToggleTheme, staff, staffOptions, onStaffChange, exporting, onExport, onHistory, onAgents, onImport }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-6 gap-y-2 px-[clamp(16px,2.5vw,40px)] py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-accent font-display text-sm font-bold text-accent-ink">G</span>
          <div className="leading-tight">
            <div className="font-display text-[15px] font-bold text-fg">Premium Blockings</div>
            <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">Gladex Portal</div>
          </div>
        </div>

        <nav aria-label="Main" className="flex items-center gap-1">
          {NAV.map((n) => {
            const active = view === n.id;
            return (
              <button
                key={n.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(n.id)}
                className={`h-9 cursor-pointer rounded-md border-0 px-3 text-sm font-semibold transition-colors ${active ? 'bg-accent/10 text-accent' : 'bg-transparent text-muted hover:bg-bg hover:text-fg'}`}
              >
                {n.label}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onHistory}><HistoryIcon />History</Button>
          <Button variant="ghost" size="sm" onClick={onAgents}><UsersIcon />Agents</Button>
          <Button variant="ghost" size="sm" onClick={onExport} disabled={exporting}><DownloadIcon />{exporting ? 'Exporting…' : 'Export'}</Button>
          <Button variant="primary" size="sm" onClick={onImport}><PlusIcon />Import destination</Button>

          <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />

          <Button variant="ghost" size="icon" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </Button>

          <div className={`flex h-8 items-center gap-1.5 rounded-md border pl-2 ${staff ? 'border-line' : 'border-warn bg-warn-bg'}`}>
            <span className={staff ? 'text-muted' : 'text-warn'}><UserIcon /></span>
            <select
              value={staff}
              onChange={onStaffChange}
              aria-label="You are"
              aria-invalid={!staff}
              className="h-full cursor-pointer border-0 bg-transparent py-0 pr-2 pl-0 text-[13px] font-semibold text-fg focus-visible:outline-none"
            >
              <option value="">Who are you?</option>
              {staffOptions.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}
