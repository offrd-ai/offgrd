# Security Incident — committed `.env` keys (checklist)

**Date:** Aug 2026 · **Status:** open until all boxes checked

## What happened
Tracked `.env` files in the `offrd/` repo (remote `github.com/offrd-ai/offrd`) contain live third-party API secrets committed to git history. Independent of the McClure alias apply (that used a gitignored key, was not committed). Reconciled with Cursor: agreed severity.

**Files:** `offrd/.env`, `offrd/offrd/.env`, `offrd/offrd/offrd/.env` (git-tracked)

## Not compromised (do NOT panic-rotate)
- **Publishable / anon Supabase key** (`sb_publishable_…` in `OFFGRD-config.js`, transcripts) — public by design; RLS is the security. No action.
- **Live `sb_secret_…` used for tonight's alias apply** — lived only in gitignored `.env.vercel.tmp` + agent process; not committed/printed. Optional belt-and-suspenders rotate after agent use.
- **Committed `VITE_SUPABASE_SERVICE_ROLE_KEY`** — legacy JWT (`eyJ…`, 219 chars). Supabase legacy keys are **disabled** → inert. Keep them disabled; treat the key as burned; purge the file.

## ROTATE — the live exposure (5 keys)
Identify each key's live consumer first. If the `offrd` app is retired → just **revoke**. If still deployed → rotate **and** update its env, or it breaks.

- [ ] **OpenAI** (`OPENAI_API_KEY`, `sk-p…`) — platform.openai.com → API keys → revoke + reissue
- [ ] **Anthropic** (`VITE_ANTHROPIC_API_KEY`, `sk-a…`) — console.anthropic.com → revoke this key (separate from `OFFGRD_MODEL` / `OFFGRD_AUTOSCOUT_RUNNER`; was `VITE_` = client-exposed)
- [ ] **SendGrid** (`SENDGRID_API_KEY`, `SG.r…`) — SendGrid → Settings → API Keys → delete + create
- [ ] **Google** (`GOOGLE_API_KEY`, `AIza…`) — Google Cloud Console → Credentials → regenerate (and check API restrictions)
- [ ] **Cloudinary** (`CLOUDINARY_API_SECRET`) — Cloudinary → Settings → Security → regenerate API secret

## REPO — stop the bleeding (Cursor)
- [ ] `git rm --cached` the three tracked `offrd/**/.env` files
- [ ] Add `.env*` (keep `!.env.example`) to the nested `offrd/` and `offrd-1/` `.gitignore`s
- [ ] Commit the stop-bleed change
- [ ] Confirm `git ls-files | grep -i '\.env'` returns only `.env.example` files

## History + verification
- [ ] **Confirm remote share scope** of `github.com/offrd-ai/offrd` (public? / who has access?). Public → assume every key was scraped; rotations above are mandatory, not optional.
- [ ] **History scrub** (only if shared beyond a tiny trusted set): BFG or `git filter-repo` to purge `.env` from history → force-push. Rotation neutralizes; scrub is cleanup.
- [ ] **Verify Supabase legacy keys stay disabled** (Settings → API). If ever re-enabled, the committed JWT goes live — so treat as burned regardless.

## Optional
- [ ] Rotate tonight's `sb_secret_…` (belt-and-suspenders after agent use) → update Vercel / Railway / local.

## Process fix (adopt)
- One-off DB applies go through the **Supabase SQL editor** or a script that **never echoes values and never gets committed** — not by handing full `.env` files to a chat/terminal agent.
- No secret ever gets a `VITE_` prefix (that ships it to the browser). Client holds the anon key only.
