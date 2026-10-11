// Runs the tracker parser on a real downloaded workbook and checks known numbers.
// Usage: npm run test:import -- "C:/path/to/TOP DESTINATION COLLECTIVES 2026.xlsx"
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { parseTracker } from '../src/lib/parseTracker.js';

const file = process.argv[2];
if (!file) { console.error('Pass the .xlsx path.'); process.exit(1); }
const wb = XLSX.read(readFileSync(file), { type: 'buffer' });
const TODAY = new Date(2026, 9, 9); // date of the sample file (UPDATE: OCT 09, 2026)
const rowsOf = (tab) => XLSX.utils.sheet_to_json(wb.Sheets[tab], { header: 1, raw: true, defval: '' });
const tabName = (re) => wb.SheetNames.find((n) => re.test(n.trim()));

let fails = 0;
const check = (label, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  (' + detail + ')' : ''}`); if (!cond) fails++; };
const avail = (d, r) => d.blocked + d.manual - r.holds.filter((h) => h.travel === d.date && h.status !== 'CANCEL').reduce((a, h) => a + h.pax, 0);

// Bangkok
const bkk = parseTracker(rowsOf(tabName(/^BANGKOK TRACKER$/i)), TODAY);
check('Bangkok parses', bkk.ok, bkk.errors.join('; '));
check('Bangkok has 3 upcoming departures', bkk.deps.length === 3, bkk.deps.map((d) => d.label).join(', '));
check('Bangkok has 19 holds', bkk.holds.length === 19, String(bkk.holds.length));
const exp = { '2026-11-13': [16, 2, 0], '2026-11-19': [16, 0, 0], '2026-12-11': [16, 0, 4] };
for (const d of bkk.deps) {
  const [b, m, a] = exp[d.date] || [];
  check(`Bangkok ${d.label}: blocked ${b}+${m}, ${a} left`, d.blocked === b && d.manual === m && avail(d, bkk) === a, `${d.blocked}+${d.manual}, ${avail(d, bkk)} left`);
}
check('Bangkok code SBBK2B1', bkk.deps.every((d) => d.code === 'SBBK2B1'), bkk.deps.map((d) => d.code).join(','));
check('Bangkok 2 flagged holds', bkk.holds.filter((h) => h.flag).length === 2);
console.log('      warnings:', bkk.warns.length ? '\n        - ' + bkk.warns.join('\n        - ') : 'none');

// Hong Kong 2027
const hk = parseTracker(rowsOf(tabName(/^HONGKONG TRACKER$/i)), TODAY);
check('Hong Kong parses', hk.ok, hk.errors.join('; '));
check('Hong Kong has 4 departures', hk.deps.length === 4, hk.deps.map((d) => d.label).join(', '));
check('Hong Kong prices', hk.deps.map((d) => d.price).join() === '27999,30599,26499,26499', hk.deps.map((d) => d.price).join());
check('Hong Kong codes', hk.deps.map((d) => d.code).join() === 'CNHK2B1,SLHK1B1,CNHK2B1,CNHK2B1', hk.deps.map((d) => d.code).join());
check('Hong Kong rooming list 21 days', hk.rooming === 21);
check('Hong Kong has no holds yet', hk.holds.length === 0);

// Hong Kong 2026: everything departed, must refuse with a clear reason
const hk26 = parseTracker(rowsOf(tabName(/^HONGKONG TRACKER 2026$/i)), TODAY);
check('Hong Kong 2026 refused (all departed)', !hk26.ok && /departed/.test(hk26.errors.join()), hk26.errors.join('; '));

// Every other tab: report what the portal would say
console.log('\nOther tabs:');
for (const n of wb.SheetNames) {
  if ([/^BANGKOK TRACKER$/i, /^HONGKONG TRACKER$/i, /^HONGKONG TRACKER 2026$/i].some((re) => re.test(n.trim()))) continue;
  const r = parseTracker(rowsOf(n), TODAY);
  console.log(`  ${r.ok ? 'OK  ' : 'STOP'}  ${n.trim()}: ${r.ok ? `${r.deps.length} departure(s), ${r.holds.length} hold(s), ${r.warns.length} warning(s)` : r.errors.join(' ')}`);
  if (r.ok && r.warns.length) r.warns.forEach((w) => console.log('          - ' + w));
}
console.log(fails ? `\n${fails} check(s) failed.` : '\nAll checks passed.');
process.exit(fails ? 1 : 0);
