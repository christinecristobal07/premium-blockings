// Reads a GLADEX blockings tracker tab (rows from XLSX.utils.sheet_to_json with header:1, raw:true)
// into departures + holds. Pure function: no DOM, no Supabase, so it runs in the browser and in node tests.

const MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

export const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
export const isoStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const serialISO = (s) => new Date(Math.round((s - 25569) * 864e5)).toISOString().slice(0, 10);
export const fmtD = (s) =>
  s ? new Date(s + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

const firstNum = (v) => {
  if (typeof v === 'number') return v;
  const m = String(v ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? +m[0] : null;
};

// "NOV 13-16,2026", "SEPT 16,2026", "9-24-2026", or an Excel date serial
export function textDate(v) {
  if (typeof v === 'number') return serialISO(v);
  const s = norm(v);
  let m = s.match(/([A-Z]{3})[A-Z]*\.?\s*(\d{1,2}).*?(\d{4})/);
  if (m && m[1] in MON) return isoStr(new Date(+m[3], MON[m[1]], +m[2]));
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return isoStr(new Date(+m[3], +m[1] - 1, +m[2]));
  return '';
}

export function depLabel(a, b) {
  const A = new Date(a + 'T00:00');
  const B = b ? new Date(b + 'T00:00') : null;
  const M = (d) => d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  if (!B) return `${M(A)} ${A.getDate()}, ${A.getFullYear()}`;
  return M(A) === M(B)
    ? `${M(A)} ${A.getDate()}-${B.getDate()}, ${A.getFullYear()}`
    : `${M(A)} ${A.getDate()}-${M(B)} ${B.getDate()}, ${B.getFullYear()}`;
}

const REQUIRED_DEP_COLS = ['DEPARTURE DATE', 'SLOTS BLOCKED'];
const REQUIRED_HOLD_COLS = ['TRAVEL DATE', 'NUMBER OF PAX', 'LEAD NAME', 'STATUS'];

/**
 * @returns {{ok:boolean, errors:string[], warns:string[], deps:object[], holds:object[], departed:number, rooming:number}}
 * ok=false means the tab does not look like a tracker; errors say why in plain words.
 */
export function parseTracker(rows, today = new Date()) {
  const todayISO = isoStr(today);
  const deps = [], hs = [], warns = [], errors = [];
  let code = '', rooming = 0, sawDepHeader = false, sawHoldHeader = false;

  for (let i = 0; i < rows.length; i++) {
    const cells = (rows[i] || []).map(norm);
    cells.forEach((c) => {
      const m = c.match(/CODE:\s*(?:GDX-\s*)?([A-Z0-9]+)/);
      if (m) code = m[1];
      if (/21 DAYS/.test(c)) rooming = 21;
    });

    const dI = cells.indexOf('DEPARTURE DATE');
    if (dI >= 0) {
      sawDepHeader = true;
      const sub = (rows[i + 1] || []).map(norm);
      const find = (test) => cells.findIndex(test);
      const c = {
        dep: dI,
        arr: cells.indexOf('ARRIVAL DATE'),
        itin: find((x) => x.startsWith('ITINERARY')),
        code: cells.indexOf('CODE'),
        dest: cells.indexOf('DESTINATION'),
        price: find((x) => x.includes('PER PAX')),
        blocked: find((x) => x.includes('SLOTS BLOCKED')),
        full: cells.indexOf('DATE OF FULL SLOT'),
        rem: find((x) => x.startsWith('REMARKS')),
      };
      if (c.blocked < 0) {
        errors.push(`Row ${i + 1}: found "DEPARTURE DATE" but no "SLOTS BLOCKED" column.`);
        continue;
      }
      const slotI = sub.indexOf('SLOT') >= 0 ? sub.indexOf('SLOT') : c.blocked;
      const paidI = sub.indexOf('PAID');

      for (let j = i + 1; j < rows.length; j++) {
        const r = rows[j] || [];
        const dv = r[c.dep];
        if (norm(dv) === 'DEPARTURE DATE' || norm(r[0]) === 'HOLD BY') break;
        if (typeof dv !== 'number') {
          if (deps.length && !r.some((x) => norm(x))) break;
          if (norm(dv) && !/DEPART|TOTAL/.test(norm(dv)) && textDate(dv))
            warns.push(`Row ${j + 1}: departure date "${dv}" is typed as text, not a date. Skipped.`);
          continue;
        }
        const date = serialISO(dv);
        const itin = norm(r[c.itin]);
        const rowCode = (c.code >= 0 && norm(r[c.code])) || (itin.match(/CODE\s+([A-Z0-9]+)/) || [])[1] || code;
        const slotTxt = norm(r[slotI]);
        const blocked = firstNum(slotTxt) || 0;
        const manual = +((slotTxt.match(/MANUAL\s*(\d+)/) || [])[1] || 0);
        const priceRaw = r[c.price];
        const d = {
          date,
          label: depLabel(date, typeof r[c.arr] === 'number' ? serialISO(r[c.arr]) : ''),
          price: firstNum(priceRaw) || 0,
          blocked,
          manual,
          code: rowCode,
          itin: String(r[c.itin] ?? '').trim(),
          dest: norm(r[c.dest]),
          sheetPaid: paidI >= 0 ? firstNum(r[paidI]) : null,
          fullBy:
            c.full >= 0 && r[c.full] !== '' && r[c.full] != null
              ? typeof r[c.full] === 'number' ? fmtD(serialISO(r[c.full])) : String(r[c.full]).trim()
              : '',
          remarks: c.rem >= 0 ? String(r[c.rem] ?? '').trim() : '',
          departed: date < todayISO,
        };
        if (typeof priceRaw === 'string' && priceRaw.trim() && !/^\s*[\d,.]+\s*$/.test(priceRaw))
          d.remarks = [d.remarks, 'Price note: ' + priceRaw.trim()].filter(Boolean).join(' · ');
        if (!blocked && !d.departed) warns.push(`${d.label}: could not read SLOTS BLOCKED ("${slotTxt || 'blank'}").`);
        deps.push(d);
      }
    }

    if (norm((rows[i] || [])[0]) === 'HOLD BY') {
      sawHoldHeader = true;
      const missing = REQUIRED_HOLD_COLS.filter((h) => !cells.includes(h));
      if (missing.length) {
        errors.push(`Row ${i + 1}: hold list is missing column(s): ${missing.join(', ')}.`);
        continue;
      }
      const c = {
        by: 0,
        travel: cells.indexOf('TRAVEL DATE'),
        pax: cells.indexOf('NUMBER OF PAX'),
        lead: cells.indexOf('LEAD NAME'),
        agent: cells.indexOf('AGENT'),
        status: cells.indexOf('STATUS'),
        held: cells.indexOf('DATE OF HOLD'),
        rel: cells.indexOf('RELEASED'),
        rem: cells.indexOf('REMARKS'),
      };
      for (let j = i + 1; j < rows.length; j++) {
        const r = rows[j] || [];
        if (norm(r[0]) === 'HOLD BY' || (r || []).map(norm).includes('DEPARTURE DATE')) break;
        const pax = firstNum(r[c.pax]);
        const lead = String(r[c.lead] ?? '').trim();
        const travel = textDate(r[c.travel]);
        if (!pax || !lead) continue;
        if (!travel) {
          warns.push(`Row ${j + 1}: could not read travel date "${r[c.travel]}" for ${lead}. Skipped.`);
          continue;
        }
        const st = norm(r[c.status]);
        const status = st.includes('CANCEL') ? 'CANCEL' : st.includes('FULL') ? 'FULL PAYMENT' : st.includes('DP') ? 'PAID-DP' : 'HOLD';
        const released = c.rel >= 0 ? textDate(r[c.rel]) : '';
        let flag = st && !['CANCEL', 'FULL PAYMENT', 'PAID-DP', 'HOLD'].includes(st) ? `Unknown status "${st}", imported as HOLD` : '';
        if (released && status !== 'CANCEL') flag = `Status is ${status} but has a release date`;
        hs.push({
          travel,
          rawTravel: String(r[c.travel]),
          by: norm(r[c.by]),
          pax,
          lead,
          agent: c.agent >= 0 ? norm(r[c.agent]) : '',
          status,
          held: c.held >= 0 ? textDate(r[c.held]) : '',
          released,
          remarks: c.rem >= 0 ? String(r[c.rem] ?? '').trim() : '',
          flag,
        });
      }
    }
  }

  if (!sawDepHeader) {
    const flat = rows.slice(0, 15).flat().map(norm);
    const hint = flat.some((c) => /^TRAVEL DATE:?$/.test(c)) && !flat.includes('SLOTS BLOCKED')
      ? ' It has a "TRAVEL DATE" list but no slot counts, so it looks like a costing or booking sheet.'
      : flat.includes('TIMESTAMP') ? ' It looks like Google Form responses.' : '';
    errors.push(
      `No departure table found.${hint} The portal needs a tracker tab with ${REQUIRED_DEP_COLS.map((h) => `"${h}"`).join(' and ')} columns, like the Bangkok and Hong Kong trackers.`
    );
  }

  const live = deps.filter((d) => !d.departed);
  const departed = deps.length - live.length;
  const kept = [];
  hs.forEach((h) => {
    const d = deps.find((x) => x.date === h.travel);
    if (!d) warns.push(`Hold for ${h.lead} (${h.rawTravel}) does not match any departure date. Skipped.`);
    else if (!d.departed) kept.push(h);
  });
  live.forEach((d) => {
    const mine = kept.filter((h) => h.travel === d.date);
    d.holdPaid = mine.filter((h) => h.status === 'PAID-DP' || h.status === 'FULL PAYMENT').reduce((a, h) => a + h.pax, 0);
    d.holdHeld = mine.filter((h) => h.status === 'HOLD').reduce((a, h) => a + h.pax, 0);
    if (d.sheetPaid != null && mine.length && d.sheetPaid !== d.holdPaid && d.sheetPaid !== d.holdPaid + d.holdHeld)
      warns.push(`${d.label}: sheet says ${d.sheetPaid} paid, hold list adds up to ${d.holdPaid}.`);
  });

  if (sawDepHeader && !live.length && !errors.length)
    errors.push(departed ? `All ${departed} departure(s) in this tab have already departed. Nothing to import.` : 'The departure table has no dated rows.');
  if (sawDepHeader && !sawHoldHeader) warns.push('No "HOLD BY" list found. Departures will import with no holds.');

  return { ok: errors.length === 0 && live.length > 0, errors, warns, deps: live, holds: kept, departed, rooming, code };
}
