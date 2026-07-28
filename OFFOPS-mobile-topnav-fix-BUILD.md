# Mobile top-nav fixes — odklabs.com hero + gameday shell

Found on a real iPhone (Safari) and confirmed by live DOM/CSS inspection. Two surfaces, both **top-of-screen chrome**, both hit before a coach sees any content. These are the first things a design partner will see, so they ship before the calls.

---

## A. odklabs.com — hero header

**Observed on device:** the **"Open app"** button is clipped by the top edge of the screen; **Open app / Dashboard / Sign out** render as three stacked full-width buttons over the hero; a hamburger ("Menu") is present *at the same time*.

### Confirmed by inspection

| # | Finding | Evidence |
|---|---|---|
| **A1** | `<header>` is `position: fixed` and the site has **zero safe-area CSS** — no `env(safe-area-inset-*)` rule anywhere in any stylesheet | `headerPosition: "fixed"`, `hasSafeAreaCSS: false` |
| **A2** | The three auth buttons are `display: block` and live **inside the header**, so on narrow widths they stack vertically instead of collapsing into the hamburger that already exists | `Open app / Dashboard / Sign out` → `display:"block"`, `inHeader:true`; `hamburger:"Menu"` present |
| **A3** | **Sign out** is a top-level button on a *marketing* page | Same |
| **A4** | Brand mismatch — the ODK Labs domain serves an OFFGRD-titled page: *"OFFGRD — Never off guard. Scout, predict, teach & call."* | `document.title` on `odklabs.com` |

### Fix

1. **Add safe-area support site-wide** (A1). The fixed header needs `padding-top: env(safe-area-inset-top)` (with a `constant()` fallback) and the page needs `viewport-fit=cover` in the viewport meta. This is a **site-wide gap**, not just the header — check any other fixed/sticky element and the footer for `safe-area-inset-bottom`.
2. **Collapse auth into the existing hamburger on mobile** (A2/A3). At mobile widths the header shows: logo (left) + hamburger (right). Everything else — Features / Pricing / FAQ / Open app / Dashboard / Sign out — lives in the menu. Desktop keeps the current inline layout.
3. **Signed-in vs signed-out states.** Signed out → primary CTA is **"Start free — no card"**; `Dashboard` and `Sign out` don't render at all. Signed in → **"Open app"** is the single visible primary action; `Dashboard` and `Sign out` move into the menu. **Never show three competing auth buttons at once.**
4. **Brand** (A4). Per the hierarchy — **ODK LABS** is the platform, OFFGRD is the game-planning module — the `odklabs.com` title/meta and header wordmark should lead with ODK Labs. *(Flagging as a decision, not silently changing marketing copy — confirm with Matt before editing.)*
5. Tap targets ≥ 44×44px; visible keyboard focus; menu toggle has an accessible label (it already does).

---

## B. gameday (`getoffrd.com/gameday`) — top chrome

**Observed on device:** top bar reads `OFFOPS UNIFIED | Gamed | hsc… | Sign out` — the **Gameday/Team Portal switcher is truncated** ("Gamed", "Team Portal" pushed off), the **email is truncated** ("hsc…"), and the tab strip below is cut off mid-word ("Scout car…"). Three rows of chrome sit above any content.

### Confirmed by inspection

| # | Finding | Evidence |
|---|---|---|
| **B1** | Fixed-width chrome overflows a phone: `OFFOPS/UNIFIED` 109px + `Gameday` 77 + `Team Portal` 91 + `Sign out` 69 ≈ **346px** before the email — on a 390px viewport it cannot fit | measured `getBoundingClientRect().width` |
| **B2** | Email + **Sign out** sit in the top bar instead of a profile menu — the exact pattern we just removed in the ODK portal redesign | screenshot + DOM |
| **B3** | Three stacked chrome rows before content: OFFOPS bar → OFFGRD + team chip + `SYNCED` + `⚙ Setup` → tab strip | screenshot |
| **B4** | Tab strip (`Predict / Tendencies / Report / Scout cards`) overflows with no scroll affordance | screenshot |
| **B5** | **11 literal ASCII `?` (charCode 63)** in UI strings where a `·` separator belongs | `"MOST LIKELY COVERAGE ? 1ST & 10+ ? VS…"`, `"reps rank higher ? widened"` — char codes `[32, 63, 32]` |

*(Note: gameday **does** have safe-area CSS — `hasSafeAreaCSS: true`. That gap is odklabs.com-specific.)*

### Fix

1. **Profile menu** (B2). Collapse the email + **Sign out** into a single avatar/profile control at the right of the OFFOPS bar. Matches the ODK portal pattern — one consistent place to sign out across the whole product.
2. **Protect the switcher** (B1). `Gameday | Team Portal` is the primary navigation between products and must **never truncate**. Give it layout priority; shrink or collapse `OFFOPS UNIFIED` to a mark-only logo on narrow widths, and let the profile control be an icon rather than text + email.
3. **Collapse chrome rows on mobile** (B3). Target **two rows maximum** above content on a phone: (row 1) logo + switcher + profile; (row 2) team/context chip with `SYNCED` and `Setup` reduced to icons. Consider making the context row collapsible once scrolled.
4. **Scrollable tab strip** (B4). Horizontal scroll with momentum, a visible edge fade or chevron affordance, and the **active tab scrolled into view** on load. No truncated words.
5. **Fix the `?` characters** (B5). These are **literal question marks in source strings**, not encoding or font-fallback — a `·` was lost to an ASCII round-trip at some point. Grep the gameday source for ` ? ` in UI copy and restore the intended separator. 11 occurrences; verify none are legitimate question marks before replacing.
6. Tap targets ≥ 44×44px throughout the chrome.

---

## Guardrails

- **Chrome/layout only.** No routing, auth, data, or business-logic changes. Sign-out *behavior* is unchanged — only where the control lives.
- Preserve the existing Gameday ↔ Team Portal switch behavior and SSO hand-off.
- Don't regress desktop: these are mobile-width fixes; desktop layouts stay as-is.
- Don't touch the Predict/Tendencies/Report/Scout-cards content — only the strip that contains them.
- Gameday is the v-numbered app with mirrors (`offgrd-web`, `_offgrd-deploy-v93`, `_offgrd-git`) — **bump the version and sync all mirrors**, same as every gameday change.

## Acceptance

1. **odklabs.com** at 390px: nothing clipped by the status bar/notch; header shows logo + hamburger only; auth actions live in the menu; signed-out and signed-in states each show exactly **one** primary action.
2. **gameday** at 390px: `Gameday | Team Portal` fully readable and never truncated; email/Sign out behind a profile control; **≤ 2 chrome rows** above content; tab strip scrolls horizontally with the active tab in view; no truncated words.
3. Zero literal `?` separators remaining in gameday UI copy.
4. Tap targets ≥ 44×44px; visible focus states; safe-area respected on both surfaces (top and bottom).
5. Desktop unchanged on both; sign-out, switching, and SSO all still work.

## Verification

Real-device check at 390px (and 320px), both surfaces, **signed in and signed out** — the signed-out hero state is the one a prospective coach hits first and is currently untested. Then desktop regression. Verify by the rendered result on a phone, not a desktop browser narrowed down.

---

## Worth flagging separately — a good find

The gameday **Predict** tab already ships exactly the credibility pattern I specced for prediction in `OFFOPS-postgame-to-monday-focus-BUILD.md` §8.4:

> **Cover 4 — 54%**, then Cover 3 33% · **MEDIUM CONFIDENCE** · *based on 28 snaps · recency-weighted*

Confidence label **and** sample size **and** recency weighting, already live. That's further along than I assumed when I wrote that ticket — it means the Phase 2 prediction work is less greenfield than scoped, and the shadow-mode validation can likely reuse this existing computation rather than build a new one. Worth a follow-up inspect of where that math lives.
