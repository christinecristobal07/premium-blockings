import * as XLSX from 'xlsx';
import { supabase } from './supabase.js';
import { isoStr } from './parseTracker.js';

// Reads every row of a table, 1000 at a time (Supabase returns at most 1000 per request).
async function all(table, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(order).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const sheet = (rows, widths) => {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ '(empty)': '' }]);
  if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
  return ws;
};
const dt = (v) => (v ? new Date(v).toLocaleString('en-PH') : '');

// Full backup of the portal: everything, including archived destinations, deleted agents and the full History.
// Readable columns first; the ID columns at the end keep the file usable for a restore.
export async function exportBackup() {
  const [dests, deps, holds, agents, log] = await Promise.all([
    all('destinations', 'created_at'), all('departures', 'depart_on'), all('holds', 'held_on'),
    all('agents', 'name'), all('audit_log', 'id'),
  ]);
  const destById = new Map(dests.map((d) => [d.id, d]));
  const depById = new Map(deps.map((d) => [d.id, d]));
  const live = (h) => h.status !== 'CANCEL';
  const paidSt = (h) => h.status === 'PAID-DP' || h.status === 'FULL PAYMENT';

  const holdRows = holds.map((h) => {
    const dp = depById.get(h.departure_id), ds = destById.get(dp?.destination_id);
    return {
      Destination: ds?.name, Archived: ds?.archived_at ? 'YES' : '', Deleted: h.archived_at ? 'YES' : '', Departure: dp?.label, 'Travel date': dp?.depart_on,
      'Hold by': h.hold_by, Pax: h.pax, 'Lead name': h.lead_name, Agent: h.agent, Status: h.status,
      'Date of hold': h.held_on, Released: h.released_on, Remarks: h.remarks, 'Import note': h.flag,
      'Hold ID': h.id, 'Departure ID': h.departure_id,
    };
  });

  const depRows = deps.map((d) => {
    const ds = destById.get(d.destination_id), mine = holds.filter((h) => h.departure_id === d.id && live(h) && !h.archived_at);
    const paid = mine.filter(paidSt).reduce((a, h) => a + h.pax, 0);
    const held = mine.filter((h) => h.status === 'HOLD').reduce((a, h) => a + h.pax, 0);
    const cap = d.blocked + (d.manual || 0);
    return {
      Destination: ds?.name, Archived: ds?.archived_at ? 'YES' : '', Departure: d.label, 'Travel date': d.depart_on,
      'Price / pax': Number(d.price), Blocked: d.blocked, Manual: d.manual, 'Paid pax (DP + Full)': paid, 'On hold pax': held,
      Available: Math.max(0, cap - paid - held), Code: d.code, Itinerary: d.itin, 'Full slot': d.full_by, Remarks: d.remarks,
      'Departure ID': d.id, 'Destination ID': d.destination_id,
    };
  });

  const destRows = dests.map((d) => ({
    Name: d.name, Code: d.code, Dest: d.dest, Itinerary: d.itinerary, 'Rooming list (days before)': d.rooming_days,
    'Imported from': [d.source_url, d.source_tab].filter(Boolean).join(' · '), Added: dt(d.created_at),
    Archived: dt(d.archived_at), 'Destination ID': d.id,
  }));

  const agentRows = agents.map((a) => ({ Agent: a.name, Status: a.archived_at ? 'Deleted from list' : 'Active', Added: dt(a.created_at), Deleted: dt(a.archived_at), 'Agent ID': a.id }));

  const logRows = log.map((r) => ({
    When: dt(r.at), By: r.staff, Action: r.action, Table: r.table_name, 'Record ID': r.row_id,
    Before: r.old_data ? JSON.stringify(r.old_data) : '', After: r.new_data ? JSON.stringify(r.new_data) : '',
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(holdRows, [18, 9, 18, 12, 8, 6, 28, 18, 14, 12, 12, 24, 24, 38, 38]), 'Holds');
  XLSX.utils.book_append_sheet(wb, sheet(depRows, [18, 9, 18, 12, 11, 8, 8, 12, 11, 10, 12, 28, 16, 24, 38, 38]), 'Departures');
  XLSX.utils.book_append_sheet(wb, sheet(destRows, [20, 18, 8, 30, 12, 30, 20, 20, 38]), 'Destinations');
  XLSX.utils.book_append_sheet(wb, sheet(agentRows, [22, 18, 20, 20, 38]), 'Agents');
  XLSX.utils.book_append_sheet(wb, sheet(logRows, [20, 10, 9, 13, 38, 60, 60]), 'Change Log'); // "History" is a reserved sheet name in Excel

  const now = new Date();
  const stamp = `${isoStr(now)}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const file = `GLADEX-Blockings-Backup-${stamp}.xlsx`;
  XLSX.writeFile(wb, file);
  return { file, holds: holds.length, departures: deps.length, destinations: dests.length, agents: agents.length, history: log.length };
}
