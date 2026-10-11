// Reads a GLADEX blockings tracker tab (rows from XLSX.utils.sheet_to_json with header:1, raw:true)
// into departures + holds. Pure function: no DOM, no Supabase, so it runs in the browser and in node tests.
// Trackers differ per destination (Bangkok, Hong Kong, Korea…), so headers are matched loosely:
// "DEPARTURE DATE" or "DEPARTURE DATE 2027", "SLOTS BLOCKED" or "SLOT BLOCKED", "TRAVEL DATE" or "DEPARTURE", etc.

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
const blank = (v) => norm(v) === '';

// "NOV 13-16,2026", "SEPT 16,2026", "January 19,2027", "9-24-2026", or an Excel date serial
export function textDate(v) {
  if (typeof v === 'number') return serialISO(v);
  const s = norm(v);
  let m = s.match(/([A-Z]{3})[A-Z]*\.?\s*(\d{1,2}).*?(\d{4})/);
  if (m && m[1] in MON) return isoStr(new Date(+m[3], MON[m[1]], +m[2]));
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return isoStr(new Date(+m[3], +m[1] - 1, +m[2]));
  return '';
}

// Month and day without a year, e.g. "JAN 19-24" -> "01-19". Used to match hold rows that leave out the year.
function monthDay(v) {
  const m = norm(v).match(/^([A-Z]{3})[A-Z]*\.?\s*(\d{1,2})/);
  return m && m[1] in MON ? `${String(MON[m[1]] + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
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

const isDepHeader = (c) => c.startsWith('DEPARTURE DATE');
const isSlotHeader = (c) => c === 'SLOT' || c === 'SLOTS' || (/\bSLOTS?\b/.test(c) && c.includes('BLOCKED'));
const isTravelHeader = (c) => c === 'TRAVEL DATE' || c === 'DEPARTURE' || c === 'DEPARTURE DATE' || c === 'TRAVEL DATES';

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

    // ---- Departure table ----
    const dI = cells.findIndex(isDepHeader);
    if (dI >= 0 && norm((rows[i] || [])[0]) !== 'HOLD BY') {
      sawDepHeader = true;
      const sub = (rows[i + 1] || []).map(norm);
      const find = (test) => cells.findIndex(test);
      const c = {
        dep: dI,
        arr: find((x) => x.startsWith('ARRIVAL DATE')),
        itin: find((x) => x.startsWith('ITINERARY')),
        code: cells.indexOf('CODE'),
        dest: cells.indexOf('DESTINATION'),
        price: find((x) => x.includes('PER PAX') || x.includes('/ PAX') || x.startsWith('PRICE')),
        blocked: find(isSlotHeader),
        full: find((x) => x.startsWith('DATE OF FULL SLOT')),
        rem: find((x) => x.startsWith('REMARKS')),
        total: find((x) => x.startsWith('TOTAL PAX')),
      };
      // The slot count sits under "SLOTS BLOCKED" (header row) or under "SLOT" / "SLOT BLOCKED" (row below it).
      const subSlot = sub.findIndex(isSlotHeader);
      const slotI = subSlot >= 0 ? subSlot : c.blocked;
      const paidI = sub.indexOf('PAID');
      if (slotI < 0) {
        errors.push(`Row ${i + 1}: found "DEPARTURE DATE" but no "SLOTS BLOCKED" / "SLOT BLOCKED" column.`);
        continue;
      }

      let last = null; // last departure read from this table
      for (let j = i + 1; j < rows.length; j++) {
        const r = rows[j] || [];
        const rc = r.map(norm);
        if (rc.some(isDepHeader) || norm(r[0]) === 'HOLD BY') break;
        const dv = r[c.dep];
        // A typed date must start the cell ("January 19,2027"), so labels like "DATE OF HOLD: AUG 20, 2026" are not read as departures.
        const dn = norm(dv), startsDate = /^\d/.test(dn) || dn.slice(0, 3) in MON;
        const date = typeof dv === 'number' ? serialISO(dv) : startsDate ? textDate(dv) : '';
        if (!date) {
          if (!r.some((x) => !blank(x))) { if (deps.length) break; continue; }
          // An undated row under a departure with its own slot count and pax count is a second block for that date
          // (Korea: 31 + 31 slots). Undated rows without a pax count are subtotals and are skipped.
          const extra = firstNum(r[slotI]);
          if (last && typeof r[slotI] === 'number' && extra && c.total >= 0 && !blank(r[c.total])) {
            last.blocked += extra;
            if (paidI >= 0 && last.sheetPaid != null) last.sheetPaid += firstNum(r[paidI]) || 0;
            warns.push(`Row ${j + 1}: extra block of ${extra} slot(s) with no date, added to ${last.label} (now ${last.blocked}).`);
          }
          continue;
        }
        const itin = norm(r[c.itin]);
        const rowCode = (c.code >= 0 && norm(r[c.code])) || (itin.match(/CODE\s+([A-Z0-9]+)/) || [])[1] || code;
        const slotTxt = norm(r[slotI]);
        const blocked = firstNum(slotTxt) || 0;
        const manual = +((slotTxt.match(/MANUAL\s*(\d+)/) || [])[1] || 0);
        const priceRaw = r[c.price];
        const arr = r[c.arr];
        const d = {
          date,
          label: depLabel(date, typeof arr === 'number' ? serialISO(arr) : textDate(arr)),
          price: firstNum(priceRaw) || 0,
          blocked,
          manual,
          code: rowCode,
          itin: String(r[c.itin] ?? '').trim(),
          dest: norm(r[c.dest]),
          sheetPaid: paidI >= 0 ? firstNum(r[paidI]) : null,
          fullBy:
            c.full >= 0 && !blank(r[c.full])
              ? typeof r[c.full] === 'number' ? fmtD(serialISO(r[c.full])) : String(r[c.full]).trim()
              : '',
          remarks: c.rem >= 0 ? String(r[c.rem] ?? '').trim() : '',
          departed: date < todayISO,
        };
        if (typeof priceRaw === 'string' && priceRaw.trim() && !/^\s*(PHP|₱)?\s*[\d,.]+\s*$/i.test(priceRaw))
          d.remarks = [d.remarks, 'Price note: ' + priceRaw.trim()].filter(Boolean).join(' · ');
        if (!blocked && !d.departed) warns.push(`${d.label}: could not read the slot count ("${slotTxt || 'blank'}").`);
        deps.push(d);
        last = d;
      }
    }

    // ---- Manual hold list ----
    if (norm((rows[i] || [])[0]) === 'HOLD BY') {
      sawHoldHeader = true;
      const c = {
        by: 0,
        travel: cells.findIndex(isTravelHeader),
        pax: cells.findIndex((x) => x === 'NUMBER OF PAX' || x === 'PAX' || x === 'NO. OF PAX'),
        lead: cells.findIndex((x) => x === 'LEAD NAME' || x === 'LEAD GUEST'),
        agent: cells.indexOf('AGENT'),
        status: cells.indexOf('STATUS'),
        held: cells.indexOf('DATE OF HOLD'),
        rel: cells.findIndex((x) => x === 'RELEASED' || x === 'MANUAL CANCEL' || x === 'DATE CANCELLED'),
        relDue: cells.indexOf('DATE OF RELEASE'), // hold deadline in some trackers; used as release date only for CANCEL rows
        rem: cells.indexOf('REMARKS'),
      };
      const missing = [
        c.travel < 0 && 'TRAVEL DATE (or DEPARTURE)', c.pax < 0 && 'NUMBER OF PAX', c.lead < 0 && 'LEAD NAME', c.status < 0 && 'STATUS',
      ].filter(Boolean);
      if (missing.length) {
        warns.push(`Row ${i + 1}: hold list is missing column(s): ${missing.join(', ')}. Holds were not imported; add them in the portal.`);
        continue;
      }
      for (let j = i + 1; j < rows.length; j++) {
        const r = rows[j] || [];
        if (norm(r[0]) === 'HOLD BY' || r.map(norm).some(isDepHeader)) break;
        const pax = firstNum(r[c.pax]);
        let lead = String(r[c.lead] ?? '').trim();
        if (!pax && !lead) continue; // empty row
        if (!pax) { warns.push(`Row ${j + 1}: no number of pax for ${lead}. Skipped.`); continue; }
        let flag = '';
        if (!lead) { lead = '(no lead name)'; flag = 'No lead name in the tracker'; }
        const travel = textDate(r[c.travel]);
        const md = travel ? '' : monthDay(r[c.travel]);
        if (!travel && !md) {
          warns.push(`Row ${j + 1}: could not read travel date "${r[c.travel]}" for ${lead}. Skipped.`);
          continue;
        }
        const st = norm(r[c.status]);
        const status = st.includes('CANCEL') ? 'CANCEL' : st.includes('FULL') ? 'FULL PAYMENT' : st.includes('DP') ? 'PAID-DP' : 'HOLD';
        const released = (c.rel >= 0 && textDate(r[c.rel])) || (status === 'CANCEL' && c.relDue >= 0 ? textDate(r[c.relDue]) : '');
        if (st && !['CANCEL', 'FULL PAYMENT', 'PAID-DP', 'HOLD'].includes(st)) flag = `Unknown status "${st}", imported as HOLD`;
        if (c.rel >= 0 && textDate(r[c.rel]) && status !== 'CANCEL') flag = `Status is ${status} but has a release date`;
        hs.push({
          row: j + 1,
          travel,
          md,
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
    const hint = flat.some((c) => /^TRAVEL DATE:?$/.test(c)) && !flat.some(isSlotHeader)
      ? ' It has a "TRAVEL DATE" list but no slot counts, so it looks like a costing or booking sheet.'
      : flat.includes('TIMESTAMP') ? ' It looks like Google Form responses.' : '';
    errors.push(
      `No departure table found.${hint} The portal needs a tracker tab with a "DEPARTURE DATE" column and a slot count ("SLOTS BLOCKED" or "SLOT BLOCKED"), like the Bangkok, Hong Kong and Korea trackers.`
    );
  }

  // Match holds to departures: by full date, or by month + day when the tracker leaves out the year ("JAN 19-24").
  const live = deps.filter((d) => !d.departed);
  const departed = deps.length - live.length;
  const kept = [];
  hs.forEach((h) => {
    let d = h.travel && deps.find((x) => x.date === h.travel);
    if (!d && h.md) {
      const same = deps.filter((x) => x.date.slice(5) === h.md);
      d = same.find((x) => !x.departed) || same[0];
    }
    if (!d) warns.push(`Row ${h.row}: hold for ${h.lead} (${h.rawTravel}) does not match any departure date. Skipped.`);
    else if (!d.departed) { h.travel = d.date; kept.push(h); }
  });

  live.forEach((d) => {
    const mine = kept.filter((h) => h.travel === d.date);
    d.holdPaid = mine.filter((h) => h.status === 'PAID-DP' || h.status === 'FULL PAYMENT').reduce((a, h) => a + h.pax, 0);
    d.holdHeld = mine.filter((h) => h.status === 'HOLD').reduce((a, h) => a + h.pax, 0);
    if (d.sheetPaid == null) return;
    // The tracker counts more paid pax than the hold list names. Keep those seats taken so the portal never
    // shows them as available (no overbooking); staff replace this row with the real bookings later.
    const missing = d.sheetPaid - d.holdPaid - d.holdHeld;
    if (missing > 0) {
      kept.push({
        travel: d.date, rawTravel: d.label, by: '', pax: missing, lead: 'PAID PER TRACKER (no names)', agent: '',
        status: 'PAID-DP', held: '', released: '',
        remarks: `Tracker PAID column says ${d.sheetPaid}; the hold list names only ${d.holdPaid + d.holdHeld}.`,
        flag: 'Added at import to match the tracker. Replace with the real bookings.',
      });
      warns.push(`${d.label}: tracker says ${d.sheetPaid} paid but the hold list names ${d.holdPaid + d.holdHeld}. Added ${missing} pax as "PAID PER TRACKER (no names)" so those seats stay taken.`);
    } else if (mine.length && d.sheetPaid !== d.holdPaid && d.sheetPaid !== d.holdPaid + d.holdHeld) {
      warns.push(`${d.label}: sheet says ${d.sheetPaid} paid, hold list adds up to ${d.holdPaid}.`);
    }
  });

  if (sawDepHeader && !live.length && !errors.length)
    errors.push(departed ? `All ${departed} departure(s) in this tab have already departed. Nothing to import.` : 'The departure table has no dated rows.');
  if (sawDepHeader && !sawHoldHeader) warns.push('No "HOLD BY" list found. Departures will import with no holds.');

  return { ok: errors.length === 0 && live.length > 0, errors, warns, deps: live, holds: kept, departed, rooming, code };
}
