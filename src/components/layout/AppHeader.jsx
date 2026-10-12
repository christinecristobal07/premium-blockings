import Button from '../ui/Button.jsx';
import { DownloadIcon, HistoryIcon, MoonIcon, PlusIcon, SunIcon, UserIcon, UsersIcon } from '../ui/icons.jsx';

// Sticky top bar: brand (goes to the dashboard) and app-wide actions.
export default function AppHeader({ onHome, theme, onToggleTheme, staff, staffOptions, onStaffChange, exporting, onExport, onHistory, onAgents, onImport }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-6 gap-y-2 px-[clamp(16px,2.5vw,40px)] py-2.5">
        <button type="button" onClick={onHome} title="Go to dashboard" className="flex cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left">
          <span className="grid size-8 place-items-center rounded-md bg-accent font-display text-sm font-bold text-accent-ink">G</span>
          <div className="leading-tight">
            <div className="font-display text-[15px] font-bold text-fg">Premium Blockings</div>
            <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">Gladex Portal</div>
          </div>
        </button>


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
