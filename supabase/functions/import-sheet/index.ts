// Supabase Edge Function: downloads a private Google Sheet as .xlsx using a Google service account.
// The sheet must be shared (Viewer) with the service account email.
// Secret required: GOOGLE_SERVICE_ACCOUNT_JSON = the full JSON key file contents.
// Request: POST { url: "https://docs.google.com/spreadsheets/d/<id>/edit..." } -> responds with the .xlsx bytes.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const b64url = (bytes: Uint8Array | string) => {
  const s = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function accessToken(sa: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`)));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claim}.${b64url(sig)}` }),
  });
  if (!res.ok) throw new Error('Google sign-in for the service account failed. Check the GOOGLE_SERVICE_ACCOUNT_JSON secret.');
  return (await res.json()).access_token as string;
}

const fail = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { url } = await req.json();
    const id = String(url ?? '').match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
    if (!id) return fail(400, 'That is not a Google Sheets link. Copy the link from the browser address bar.');
    const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!raw) return fail(500, 'Google access is not set up yet (missing GOOGLE_SERVICE_ACCOUNT_JSON).');
    const sa = JSON.parse(raw);
    const token = await accessToken(sa);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404 || res.status === 403)
      return fail(403, `The portal cannot open this sheet. Share it (Viewer) with ${sa.client_email}, then try again.`);
    if (!res.ok) return fail(502, `Google returned an error (${res.status}). Try again in a minute.`);
    return new Response(await res.arrayBuffer(), { headers: { ...cors, 'Content-Type': XLSX_MIME } });
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Import failed.');
  }
});
