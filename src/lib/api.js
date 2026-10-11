import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';

const must = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

// Destinations with their departures and holds, shaped like the draft's PKGS/holds.
export async function loadAll() {
  const rows = must(
    await supabase
      .from('destinations')
      .select('*, departures(*, holds(*))')
      .is('archived_at', null)
      .order('created_at', { ascending: true })
  );
  const pkgs = [], holds = [];
  for (const d of rows) {
    const deps = [...d.departures].sort((a, b) => a.depart_on.localeCompare(b.depart_on));
    pkgs.push({
      id: d.id, tab: d.name, name: d.itinerary || d.name, code: d.code || '—', dest: d.dest,
      rooming: d.rooming_days, src: d.source_tab, raw: { name: d.name, itinerary: d.itinerary || '', code: d.code || '', dest: d.dest || '', rooming_days: d.rooming_days },
      deps: deps.map((x) => ({
        id: x.id, label: x.label, date: x.depart_on, price: Number(x.price), blocked: x.blocked, manual: x.manual,
        code: x.code, itin: x.itin, fullBy: x.full_by, remarks: x.remarks,
      })),
    });
    for (const x of deps)
      for (const h of x.holds)
        holds.push({
          id: h.id, dep: x.id, by: h.hold_by, pax: h.pax, lead: h.lead_name, agent: h.agent, status: h.status,
          held: h.held_on, released: h.released_on || '', remarks: h.remarks || '', flag: h.flag || '',
        });
  }
  return { pkgs, holds };
}

export async function reserve({ dep, pax, lead, agent, by, status }) {
  return must(
    await supabase.rpc('reserve_slots', {
      p_departure: dep, p_pax: pax, p_lead: lead, p_agent: agent, p_by: by, p_status: status,
    })
  );
}

// patch keys: hold_by, pax, lead_name, agent, status, held_on, released_on, remarks.
// The database re-checks slots when pax goes up or a released hold is restored.
export async function updateHold(id, patch) {
  return must(await supabase.rpc('update_hold', { p_id: id, p_patch: patch }));
}

export async function loadAgents() {
  return must(await supabase.from('agents').select('id, name').is('archived_at', null).order('name'));
}

// Adding a name that was deleted before brings it back.
export async function addAgent(name) {
  const { error } = await supabase.from('agents').insert({ name });
  if (error?.code !== '23505') { if (error) throw new Error(error.message); return; }
  const back = must(await supabase.from('agents').update({ archived_at: null }).eq('name', name).not('archived_at', 'is', null).select('id'));
  if (!back.length) throw new Error(`${name} is already in the list.`);
}

// Nothing is ever deleted from the database: "Delete" hides the agent from the list and is kept in History.
export async function deleteAgent(id) {
  return must(await supabase.from('agents').update({ archived_at: new Date().toISOString() }).eq('id', id));
}

export async function loadArchived() {
  return must(await supabase.from('destinations').select('id, name, code, archived_at').not('archived_at', 'is', null).order('archived_at', { ascending: false }));
}

// patch keys: name, itinerary, code, dest, rooming_days
export async function updateDestination(id, patch) {
  return must(await supabase.from('destinations').update(patch).eq('id', id));
}

// "Delete" archives the destination with its departures and holds. Restore it from History.
export async function archiveDestination(id) {
  return must(await supabase.from('destinations').update({ archived_at: new Date().toISOString() }).eq('id', id));
}

export async function restoreDestination(id) {
  return must(await supabase.from('destinations').update({ archived_at: null }).eq('id', id));
}

export async function loadHistory(limit = 300) {
  return must(await supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(limit));
}

export async function importDestination(payload) {
  return must(await supabase.rpc('import_destination', { payload }));
}

// Downloads a private Google Sheet as .xlsx through the import-sheet Edge Function.
export async function fetchSheet(url) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/import-sheet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    let msg = `Import failed (${res.status}).`;
    try { msg = (await res.json()).error || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return new Uint8Array(await res.arrayBuffer());
}
