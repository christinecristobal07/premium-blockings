-- GLADEX Blockings Portal schema. Run once in Supabase (SQL editor or migration).
-- No login for now (owner's choice): the anon key can read, add and change, but never delete.
-- Every change is kept in audit_log (see the end of this file). Add auth + stricter policies later.

create table if not exists destinations (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- tab name shown in the portal, e.g. "Bangkok 2026"
  itinerary text,
  code text,
  dest text,                          -- BKK, HK, ...
  rooming_days int not null default 0,-- rooming list due N days before departure (0 = none)
  source_tab text,                    -- tracker tab it came from (informational only)
  source_url text,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  archived_at timestamptz             -- set when replaced by an import; hidden but kept and restorable
);

create table if not exists departures (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations(id) on delete cascade,
  depart_on date not null,
  label text not null,                -- "NOV 13-16, 2026"
  price numeric not null default 0,   -- all-in per pax, PHP
  blocked int not null default 0,
  manual int not null default 0,      -- extra manual pax on top of the block ("16 + MANUAL 2PAX")
  code text,
  itin text,
  full_by text,
  remarks text,
  unique (destination_id, depart_on)
);

create table if not exists holds (
  id uuid primary key default gen_random_uuid(),
  departure_id uuid not null references departures(id) on delete cascade,
  hold_by text,
  pax int not null check (pax > 0),
  lead_name text not null,
  agent text,
  status text not null default 'HOLD' check (status in ('HOLD','PAID-DP','FULL PAYMENT','CANCEL')),
  held_on date not null default current_date,
  released_on date,
  remarks text,
  flag text,                          -- import note for staff to check
  created_at timestamptz not null default now()
);
create index if not exists holds_departure_idx on holds(departure_id);

-- Reserve slots without double booking: locks the departure row, counts live pax, then inserts.
create or replace function reserve_slots(p_departure uuid, p_pax int, p_lead text, p_agent text, p_by text, p_status text)
returns holds language plpgsql as $$
declare cap int; used int; h holds;
begin
  select blocked + manual into cap from departures where id = p_departure for update;
  if cap is null then raise exception 'Departure not found'; end if;
  select coalesce(sum(pax),0) into used from holds where departure_id = p_departure and status <> 'CANCEL';
  if p_pax > cap - used then
    raise exception 'Only % slot(s) left on this departure', greatest(cap - used, 0);
  end if;
  insert into holds(departure_id, pax, lead_name, agent, hold_by, status)
  values (p_departure, p_pax, p_lead, p_agent, p_by, coalesce(p_status,'HOLD')) returning * into h;
  return h;
end $$;

-- Edit, release or restore a hold. Re-checks slots when pax goes up or a cancelled hold is restored.
-- p_patch keys (all optional): hold_by, pax, lead_name, agent, status, held_on, released_on, remarks.
create or replace function update_hold(p_id uuid, p_patch jsonb)
returns holds language plpgsql set search_path = public as $$
declare dep_id uuid; old holds; h holds; cap int; used int; new_status text; new_pax int;
begin
  select departure_id into dep_id from holds where id = p_id;
  if dep_id is null then raise exception 'Hold not found'; end if;
  select blocked + manual into cap from departures where id = dep_id for update;
  select * into old from holds where id = p_id;
  new_status := coalesce(p_patch->>'status', old.status);
  new_pax := coalesce((p_patch->>'pax')::int, old.pax);
  if new_status <> 'CANCEL' and (old.status = 'CANCEL' or new_pax > old.pax) then
    select coalesce(sum(pax),0) into used from holds
      where departure_id = dep_id and status <> 'CANCEL' and id <> p_id;
    if new_pax > cap - used then
      raise exception 'Only % slot(s) left on this departure', greatest(cap - used, 0);
    end if;
  end if;
  update holds set
    hold_by   = case when p_patch ? 'hold_by'   then p_patch->>'hold_by'   else hold_by end,
    pax       = new_pax,
    lead_name = case when p_patch ? 'lead_name' then p_patch->>'lead_name' else lead_name end,
    agent     = case when p_patch ? 'agent'     then p_patch->>'agent'     else agent end,
    status    = new_status,
    held_on   = case when p_patch ? 'held_on'   then coalesce(nullif(p_patch->>'held_on','')::date, held_on) else held_on end,
    released_on = case
      when p_patch ? 'released_on' then nullif(p_patch->>'released_on','')::date
      when new_status = 'CANCEL' and old.status <> 'CANCEL' then current_date
      when new_status <> 'CANCEL' then null
      else released_on end,
    remarks   = case when p_patch ? 'remarks'   then nullif(p_patch->>'remarks','') else remarks end,
    flag      = null
  where id = p_id returning * into h;
  return h;
end $$;

-- Import one destination atomically. payload.replace_id (optional) = the destination to replace; it is archived, not
-- deleted. Without it a new one is added. Never matched by tab name: many downloaded files are all "Sheet1". payload = { replace_id, name, itinerary, code, dest, rooming_days,
-- source_tab, source_url, departures:[{depart_on,label,price,blocked,manual,code,itin,full_by,remarks,
-- holds:[{hold_by,pax,lead_name,agent,status,held_on,released_on,remarks,flag}]}] }
create or replace function import_destination(payload jsonb)
returns uuid language plpgsql set search_path = public as $$
declare dest_id uuid; dep jsonb; dep_id uuid; h jsonb;
begin
  if nullif(payload->>'replace_id','') is not null then
    update destinations set archived_at = now() where id = (payload->>'replace_id')::uuid and archived_at is null;
  end if;
  insert into destinations(name, itinerary, code, dest, rooming_days, source_tab, source_url)
  values (payload->>'name', payload->>'itinerary', payload->>'code', payload->>'dest',
          coalesce((payload->>'rooming_days')::int,0), payload->>'source_tab', payload->>'source_url')
  returning id into dest_id;
  for dep in select * from jsonb_array_elements(payload->'departures') loop
    insert into departures(destination_id, depart_on, label, price, blocked, manual, code, itin, full_by, remarks)
    values (dest_id, (dep->>'depart_on')::date, dep->>'label', coalesce((dep->>'price')::numeric,0),
            coalesce((dep->>'blocked')::int,0), coalesce((dep->>'manual')::int,0),
            dep->>'code', dep->>'itin', dep->>'full_by', dep->>'remarks')
    returning id into dep_id;
    for h in select * from jsonb_array_elements(coalesce(dep->'holds','[]'::jsonb)) loop
      insert into holds(departure_id, hold_by, pax, lead_name, agent, status, held_on, released_on, remarks, flag)
      values (dep_id, h->>'hold_by', (h->>'pax')::int, h->>'lead_name', h->>'agent', h->>'status',
              coalesce(nullif(h->>'held_on','')::date, current_date), nullif(h->>'released_on','')::date,
              h->>'remarks', h->>'flag');
    end loop;
  end loop;
  return dest_id;
end $$;

-- Agent list for the dropdowns. Staff add/delete in the portal; agents in imported or saved holds are added automatically.
create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name = upper(btrim(name)) and name <> ''),
  created_at timestamptz not null default now(),
  archived_at timestamptz             -- "Delete" in the portal sets this; adding the name again clears it
);
create or replace function add_agents_from_holds() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(btrim(new.agent),'') <> '' then
    insert into agents(name) values (upper(btrim(new.agent))) on conflict (name) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists holds_add_agent on holds;
create trigger holds_add_agent after insert or update of agent on holds
for each row execute function add_agents_from_holds();
-- History of every change. Written only by the trigger; the app can read it but never edit or erase it.
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  staff text,                         -- "You are" picker in the portal (x-staff header), else the database user
  table_name text not null,
  action text not null,               -- INSERT / UPDATE / DELETE
  row_id uuid,
  old_data jsonb,
  new_data jsonb
);
create index if not exists audit_log_at_idx on audit_log(at desc);
create index if not exists audit_log_row_idx on audit_log(row_id);

create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then return null; end if;
  begin
    who := nullif(current_setting('request.headers', true)::json->>'x-staff', '');
  exception when others then who := null;
  end;
  insert into audit_log(staff, table_name, action, row_id, old_data, new_data)
  values (coalesce(who, current_user), tg_table_name, tg_op,
          case when tg_op = 'DELETE' then old.id else new.id end,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;

-- Access: the app (anon key) can read, add and change. It cannot delete anything.
alter table audit_log enable row level security;
drop policy if exists "read history" on audit_log;
create policy "read history" on audit_log for select to anon, authenticated using (true);
do $$ declare t text;
begin
  foreach t in array array['destinations','departures','holds','agents'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop trigger if exists audit on %I', t);
    execute format('create trigger audit after insert or update or delete on %I for each row execute function audit_row()', t);
    execute format('drop policy if exists "open access" on %I', t);
    execute format('drop policy if exists "app read" on %I', t);
    execute format('drop policy if exists "app add" on %I', t);
    execute format('drop policy if exists "app change" on %I', t);
    execute format('create policy "app read" on %I for select to anon, authenticated using (true)', t);
    execute format('create policy "app add" on %I for insert to anon, authenticated with check (true)', t);
    execute format('create policy "app change" on %I for update to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;
revoke delete on destinations, departures, holds, agents, audit_log from anon, authenticated;
revoke insert, update on audit_log from anon, authenticated;
revoke execute on function audit_row() from public, anon, authenticated;
