# GLADEX Premium Blockings Portal

Agents reserve or hold slots on fixed-departure blocking packages. Destinations are imported from the Google Sheets trackers (BANGKOK TRACKER, HONGKONG TRACKER…). React + Vite, Supabase backend. No login yet.

## Run

```
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key
npm run dev
```

## Supabase setup (once)

1. Run `supabase/schema.sql` in the Supabase SQL editor (tables, `reserve_slots`, `import_destination`).
2. Deploy the Edge Function `supabase/functions/import-sheet` (with JWT verification off, since there is no login yet).
3. Add the secret `GOOGLE_SERVICE_ACCOUNT_JSON` = the Google service account key file contents.
4. Share each tracker Google Sheet with the service account email as **Viewer**.

## Test the import on a real file

```
npm run test:import -- "C:/Users/jmsgl/Downloads/TOP DESTINATION COLLECTIVES  2026 (2).xlsx"
```

Checks the Bangkok and Hong Kong numbers and prints what the portal would say for every other tab.

## Rules built in

- Hold without DP expires after 3 days (shown as EXPIRED; staff release it).
- `reserve_slots` locks the departure, so two agents cannot book the last slot at the same time.
- Each import adds a new destination. It replaces one only when "Save as → Replace …" is chosen (pre-selected when the name or package code matches). The old one is archived, not deleted, and can be restored from History.
- Nothing is ever deleted: the app's key has no DELETE rights. "Delete agent" hides the agent; replaced destinations are archived.
- Every add/change is recorded in `audit_log` with who did it (the "You are" picker) and the before/after values. See it under History.
