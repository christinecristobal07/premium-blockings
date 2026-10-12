import { useCallback, useEffect, useMemo, useState } from 'react';
import { configured, getStaff, setStaff } from './lib/supabase.js';
import { loadAll, loadAgents } from './lib/api.js';
import { fmtD, isoStr } from './lib/parseTracker.js';
import ImportPanel from './pages/ImportPanel.jsx';
import AgentsPanel from './pages/AgentsPanel.jsx';
import HistoryPanel from './pages/HistoryPanel.jsx';
import DestinationHeader from './components/DestinationHeader.jsx';
import DepartureEditor from './components/DepartureEditor.jsx';
import { exportBackup } from './lib/exportBackup.js';
import ReservationsView from './pages/ReservationsView.jsx';
import AppHeader from './components/layout/AppHeader.jsx';
import Button from './components/ui/Button.jsx';
import { PlusIcon } from './components/ui/icons.jsx';
import DepartureCard from './components/DepartureCard.jsx';
import HoldsTable from './components/HoldsTable.jsx';
import { HOLD_BY, stats } from './lib/slots.js';

const DEP_PREVIEW = 4; // departure cards shown before "View more"

export default function App() {
  const today = useMemo(() => new Date(), []);
  const [pkgs, setPkgs] = useState([]);
  const [holds, setHolds] = useState([]);
  const [cur, setCur] = useState(null);
  const [selDep, setSelDep] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'reservations'
  const [depEdit, setDepEdit] = useState(null); // null | { dep } to edit | { dep: null } to add
  const [showAllDeps, setShowAllDeps] = useState(false); // false = show only the first DEP_PREVIEW departure cards
  const [resDep, setResDep] = useState(''); // departure pre-selected when opening Reservations
  const [showImport, setShowImport] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [exp, setExp] = useState({ busy: false, kind: '', text: '' });
  async function onExport() {
    setExp({ busy: true, kind: 'info', text: 'Preparing the Excel backup…' });
    try {
      const r = await exportBackup();
      setExp({ busy: false, kind: 'info', text: `Downloaded ${r.file}: ${r.destinations} destination(s), ${r.departures} departure(s), ${r.holds} hold(s), ${r.agents} agent(s), ${r.history} history row(s). Save it somewhere safe, e.g. Google Drive.` });
    } catch (e) {
      setExp({ busy: false, kind: 'err', text: `Export failed: ${e.message}` });
    }
  }
  // Theme: Light (default, warm cream) or Dark, saved in this browser.
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('gladex-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } });
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    try { localStorage.setItem('gladex-theme', theme); } catch { /* storage blocked */ }
  }, [theme]);
  const [staff, setStaffState] = useState(getStaff());
  const pickStaff = (e) => { setStaff(e.target.value); setStaffState(e.target.value); };
  const [agentRows, setAgentRows] = useState([]);

  const refresh = useCallback(async (focusId) => {
    try {
      const [d, ag] = await Promise.all([loadAll(), loadAgents()]);
      setPkgs(d.pkgs);
      setHolds(d.holds);
      setAgentRows(ag);
      setCur((c) => focusId || (d.pkgs.some((p) => p.id === c) ? c : d.pkgs[0]?.id ?? null));
      setLoadErr('');
    } catch (e) {
      setLoadErr(`Could not load data from Supabase: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (configured) refresh(); else setLoading(false); }, [refresh]);

  const pkg = pkgs.find((p) => p.id === cur);
  const allDeps = pkgs.flatMap((p) => p.deps.map((d) => ({ ...d, pkg: p })));
  const depById = (id) => allDeps.find((d) => d.id === id);
  const agents = agentRows.map((a) => a.name);
  // Agent dropdown options; keeps a value that is no longer in the list so it is not silently lost.
  const agentOptions = (current) => (current && !agents.includes(current) ? [current, ...agents] : agents);


  if (!configured)
    return (
      <div className="wrap">
        <h1>Premium Blockings Portal</h1>
        <div className="banner err">Supabase is not connected yet. Copy <b>.env.example</b> to <b>.env.local</b>, add the Project URL and anon key, then restart <code>npm run dev</code>.</div>
      </div>
    );

  const openReserve = (depId) => { setResDep(depId || ''); setView('reservations'); window.scrollTo(0, 0); };

  return (
    <>
    <AppHeader
      onHome={() => setView('dashboard')}
      theme={theme}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      staff={staff}
      staffOptions={HOLD_BY}
      onStaffChange={pickStaff}
      exporting={exp.busy}
      onExport={onExport}
      onHistory={() => setShowHistory((v) => !v)}
      onAgents={() => setShowAgents((v) => !v)}
      onImport={() => setShowImport(true)}
    />
    <main className="wrap">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-3">
          {view === 'reservations' && <Button variant="secondary" size="sm" onClick={() => setView('dashboard')}>← Dashboard</Button>}
          <h1 className="m-0 font-display text-[22px] font-bold text-fg">{view === 'reservations' ? 'Reservations' : 'Dashboard'}</h1>
        </div>
        <span className="text-[13px] text-muted">Today is {fmtD(isoStr(today))}</span>
      </div>

      {loadErr && <div className="banner err">{loadErr}</div>}

      {exp.text && <div className={`banner ${exp.kind}`} role="status">{exp.text}</div>}

      {!staff && <div className="banner info">Choose your name in <b>Who are you?</b> (top right) so the History log shows who made each change.</div>}

      {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} onRestored={() => refresh()} />}

      {showAgents && <AgentsPanel agents={agentRows} holds={holds} onClose={() => setShowAgents(false)} onChanged={() => refresh()} />}

      {showImport && (
        <ImportPanel
          today={today}
          existing={pkgs}
          onClose={() => setShowImport(false)}
          onImported={async (id, text) => { setShowImport(false); setSelDep(null); setView('dashboard'); await refresh(id); setExp({ busy: false, kind: 'info', text }); }}
        />
      )}

      {!loading && !pkgs.length && !loadErr && (
        <div className="banner info">No destinations yet. Click <b>+ Import destination</b> and paste the Google Sheet link of a tracker (for example BANGKOK TRACKER).</div>
      )}

      {!!pkgs.length && view === 'reservations' && (
        <ReservationsView
          key={resDep}
          today={today}
          allDeps={allDeps}
          holds={holds}
          agentOptions={agentOptions}
          startDep={resDep}
          staff={staff}
          onReserved={(focusId) => refresh(focusId)}
        />
      )}

      {!!pkgs.length && view === 'dashboard' && (
        <>
          <nav className="tabs" role="tablist">
            {pkgs.map((p) => (
              <button key={p.id} className="tab" role="tab" aria-selected={p.id === cur} onClick={() => { setCur(p.id); setSelDep(null); setDepEdit(null); setShowAllDeps(false); }}>
                {p.tab}
              </button>
            ))}
          </nav>

          {pkg && (
            <section style={{ display: 'grid', gap: 12 }}>
              <DestinationHeader
                key={pkg.id}
                pkg={pkg}
                holdCount={holds.filter((h) => pkg.deps.some((d) => d.id === h.dep)).length}
                onChanged={() => refresh()}
                onDeleted={async (n) => { setSelDep(null); await refresh(); setExp({ busy: false, kind: 'info', text: `Deleted ${n}. You can restore it from History.` }); }}
              />
              {depEdit && (
                <DepartureEditor
                  key={depEdit.dep?.id || 'new'}
                  dep={depEdit.dep}
                  destinationId={pkg.id}
                  used={depEdit.dep ? (() => { const s = stats(depEdit.dep, holds); return s.paid + s.held; })() : 0}
                  defaults={(() => { const l = pkg.deps[pkg.deps.length - 1]; return l ? { price: l.price, blocked: l.blocked, code: l.code, itin: l.itin } : {}; })()}
                  onCancel={() => setDepEdit(null)}
                  onSaved={async (label) => { setDepEdit(null); await refresh(pkg.id); setExp({ busy: false, kind: 'info', text: `Saved departure ${label}.` }); }}
                />
              )}
              <div className="deps">
                {(showAllDeps ? pkg.deps : pkg.deps.slice(0, DEP_PREVIEW)).map((d) => (
                  <DepartureCard
                    key={d.id}
                    dep={d}
                    pkg={pkg}
                    holds={holds}
                    today={today}
                    selected={selDep === d.id}
                    onSelect={() => setSelDep(selDep === d.id ? null : d.id)}
                    onReserve={() => openReserve(d.id)}
                    onEdit={() => setDepEdit({ dep: d })}
                  />
                ))}
                {(showAllDeps || pkg.deps.length <= DEP_PREVIEW) && (
                <button
                  type="button"
                  onClick={() => setDepEdit({ dep: null })}
                  className="flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-transparent font-body text-sm font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  <span className="grid size-10 place-items-center rounded-full bg-surface text-accent"><PlusIcon /></span>
                  Add departure
                </button>
                )}
              </div>
              {pkg.deps.length > DEP_PREVIEW && (
                <div className="flex justify-center">
                  <Button variant="secondary" size="sm" onClick={() => setShowAllDeps((v) => !v)} aria-expanded={showAllDeps}>
                    {showAllDeps ? 'Show less' : `View more (${pkg.deps.length - DEP_PREVIEW} more departure${pkg.deps.length - DEP_PREVIEW > 1 ? 's' : ''})`}
                  </Button>
                </div>
              )}
            </section>
          )}

          {pkg && (
            <HoldsTable
              pkg={pkg}
              holds={holds}
              today={today}
              selDep={selDep}
              onSelDep={setSelDep}
              depById={depById}
              agentOptions={agentOptions}
              refresh={refresh}
              onNewReservation={() => openReserve(selDep || pkg.deps[0]?.id)}
            />
          )}
        </>
      )}
    </main>
    </>
  );
}
