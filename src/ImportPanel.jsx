import { useState } from 'react';
import * as XLSX from 'xlsx';
import { parseTracker } from './lib/parseTracker.js';
import { fetchSheet, importDestination } from './lib/api.js';

const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// Existing destination this import most likely updates: same name, or shares a package code.
function findMatch(existing, name, res) {
  const n = name.trim().toLowerCase();
  const codes = new Set((res?.deps || []).map((d) => d.code).filter(Boolean));
  return existing.find((p) => p.tab.trim().toLowerCase() === n)
    || existing.find((p) => p.deps.some((d) => codes.has(d.code)));
}

export default function ImportPanel({ today, existing, onClose, onImported }) {
  const [url, setUrl] = useState('');
  const [wb, setWb] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [tab, setTab] = useState('');
  const [name, setName] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [replaceId, setReplaceId] = useState(''); // '' = add as a new destination

  function openWorkbook(bytes, src) {
    const book = XLSX.read(bytes, { type: 'array' });
    setWb(book);
    setSourceUrl(src);
    const guess = book.SheetNames.find((n) => /TRACKER/i.test(n)) || book.SheetNames[0];
    pickTab(book, guess, src);
  }

  function pickTab(book, t, src = sourceUrl) {
    setTab(t);
    // A generic tab like "Sheet1" says nothing; use the file name ("HONGKONG 2027.xlsx") instead.
    const base = /^sheets*d*$/i.test(t.trim()) && src && !/^https?:/i.test(src)
      ? src.replace(/.xlsx?$/i, '').replace(/s*(d+)$/, '')
      : t.replace(/TRACKER/i, '');
    const nm = titleCase(base.trim()) || t.trim();
    setName(nm);
    const rows = XLSX.utils.sheet_to_json(book.Sheets[t], { header: 1, raw: true, defval: '' });
    const r = parseTracker(rows, today);
    setRes(r);
    setReplaceId(findMatch(existing, nm, r)?.id || '');
  }

  async function fromLink() {
    setErr(''); setBusy('Opening the sheet…');
    try { openWorkbook(await fetchSheet(url.trim()), url.trim()); }
    catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  }

  function fromFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setErr('');
    const rd = new FileReader();
    rd.onload = () => {
      try { openWorkbook(new Uint8Array(rd.result), f.name); }
      catch { setErr('Could not read this file. Download it again from Google Sheets as .xlsx and retry.'); }
    };
    rd.readAsArrayBuffer(f);
  }

  async function add() {
    const r = res;
    const codes = [...new Set(r.deps.map((d) => d.code).filter(Boolean))];
    const payload = {
      replace_id: replaceId || null,
      name: name.trim() || tab.trim(),
      itinerary: r.deps[0].itin,
      code: codes.join(' / ') || r.code,
      dest: r.deps[0].dest,
      rooming_days: r.rooming,
      source_tab: tab.trim(),
      source_url: sourceUrl,
      departures: r.deps.map((d) => ({
        depart_on: d.date, label: d.label, price: d.price, blocked: d.blocked, manual: d.manual,
        code: d.code, itin: d.itin, full_by: d.fullBy, remarks: d.remarks,
        holds: r.holds.filter((h) => h.travel === d.date).map((h) => ({
          hold_by: h.by, pax: h.pax, lead_name: h.lead, agent: h.agent, status: h.status,
          held_on: h.held, released_on: h.released, remarks: h.remarks, flag: h.flag,
        })),
      })),
    };
    setBusy('Saving…'); setErr('');
    try {
      const id = await importDestination(payload);
      onImported(id, `${replaceId ? 'Updated' : 'Added'} ${payload.name}: ${r.deps.length} departure(s), ${r.holds.length} hold(s).`);
    } catch (e) {
      setErr(`Could not save to Supabase: ${e.message}`);
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="panel">
      <h3>Import a destination from Google Sheets</h3>
      <p className="note" style={{ margin: '0 0 12px' }}>
        Paste the Google Sheet link, or upload a downloaded .xlsx. Pick the tracker tab. The portal reads the departure table
        (DEPARTURE DATE, SLOTS BLOCKED…) and the manual hold list (HOLD BY, LEAD NAME…). Departed groups are skipped.
        Each import is added as a new destination unless you choose to replace one under "Save as".
      </p>
      <div className="iform">
        <label>Google Sheet link<input id="iUrl" placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        <button className="btn" type="button" style={{ alignSelf: 'end' }} disabled={!url.trim() || !!busy} onClick={fromLink}>Open sheet</button>
        <label>Or upload .xlsx<input id="iFile" type="file" accept=".xlsx,.xls" onChange={fromFile} /></label>
      </div>
      {wb && (
        <div className="iform" style={{ marginTop: 10 }}>
          <label>Tracker tab
            <select id="iTab" value={tab} onChange={(e) => pickTab(wb, e.target.value)}>
              {wb.SheetNames.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label>Name in portal<input id="iName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Singapore 2027" /></label>
          <label>Save as
            <select id="iReplace" value={replaceId} onChange={(e) => setReplaceId(e.target.value)}>
              <option value="">New destination (keep all others)</option>
              {existing.map((p) => <option key={p.id} value={p.id}>Replace {p.tab}</option>)}
            </select>
          </label>
        </div>
      )}
      {wb && replaceId && (
        <p className="msg" style={{ color: 'var(--warn)' }}>
          This will replace <b>{existing.find((p) => p.id === replaceId)?.tab}</b>. The old version, with its holds and edits, is
          archived (not deleted) and can be restored from History. Pick "New destination" to keep both visible.
        </p>
      )}
      {busy && <p className="msg">{busy}</p>}
      {err && <p className="msg err">{err}</p>}
      {res && !res.ok && (
        <ul className="warns" style={{ background: 'var(--bad-bg)', color: 'var(--bad)' }}>
          {res.errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      {res?.ok && (
        <>
          <div className="prevh">
            Found {res.deps.length} upcoming departure(s) and {res.holds.length} hold(s)
            {res.departed ? ` · ${res.departed} departed group(s) skipped` : ''}
            {res.rooming ? ` · rooming list due ${res.rooming} days before departure` : ''}
          </div>
          <div className="tbl">
            <table>
              <thead><tr><th>Departure</th><th>Code</th><th>Itinerary</th><th>Price / pax</th><th>Blocked</th><th>Paid (sheet)</th><th>Paid (hold list)</th></tr></thead>
              <tbody>
                {res.deps.map((d) => {
                  const has = res.holds.some((h) => h.travel === d.date);
                  return (
                    <tr key={d.date}>
                      <td>{d.label}</td><td>{d.code || '—'}</td><td>{d.itin}</td><td>₱{d.price.toLocaleString()}</td>
                      <td>{d.blocked}{d.manual ? `+${d.manual}` : ''}</td><td>{d.sheetPaid ?? '—'}</td>
                      <td>{has ? d.holdPaid : 'no holds'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {res.warns.length ? <ul className="warns">{res.warns.map((w) => <li key={w}>{w}</li>)}</ul> : <p className="msg ok">No problems found.</p>}
        </>
      )}
      <div className="act" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn" type="button" disabled={!res?.ok || !!busy} onClick={add}>{replaceId ? 'Replace destination' : 'Add destination'}</button>
        <button className="mini" type="button" onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}
