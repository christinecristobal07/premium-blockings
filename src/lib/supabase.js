import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Who is using the portal (no login yet). Sent with every request so the History log shows who made each change.
const STAFF_KEY = 'gladex-staff';
let staff = '';
try { staff = localStorage.getItem(STAFF_KEY) || ''; } catch { /* storage blocked */ }
export const getStaff = () => staff;
export function setStaff(name) {
  staff = name;
  try { localStorage.setItem(STAFF_KEY, name); } catch { /* storage blocked */ }
}

const withStaff = (url, opts = {}) => {
  const headers = new Headers(opts.headers);
  if (staff) headers.set('x-staff', staff);
  return fetch(url, { ...opts, headers });
};

export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: withStaff } })
  : null;
