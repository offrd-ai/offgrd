# OFFGRD — Coaching Suite

Offline-first football coaching apps for the Parkway West Longhorns.

- **index.html** — home / launcher
- **OFFGRD.html** — Scout & Predict (opponent run/pass, coverage, front, blitz; call sheet; live caller)
- **OFFGRD-Playbook.html** — play designer (draw, animate, tag, install)
- **OFFGRD-cloud.js / OFFGRD-account.js** — Supabase auth + program sync (Sign in / Sync ↑ / Load ↓)
- **OFFGRD-config.js** — Supabase URL + public anon key (safe to ship; RLS protects data)

## Deploy (Vercel)
Static site, no build step. Import this repo at vercel.com → New Project → Deploy.

## Setup (once)
1. Supabase → SQL Editor → run `OFFGRD-supabase-schema.sql` (kept in the parent folder).
2. Supabase → Auth → Email: turn off "Confirm email" for instant logins while testing,
   or add your `*.vercel.app` URL under Auth → URL Configuration → Redirect URLs.

_Do not commit the Supabase service_role / secret key. Only the anon key belongs in the browser._
