# OFFOPS Coaches Hub — mobile dashboard redesign (ODK Labs command center)

**What this is:** a **visual + structural** redesign of the mobile Coaches Hub dashboard (the `getoffrd.com/high-school-coach` "Team Portal Home") to the attached mockup and the token/layout spec below. **Not** a data-model or backend change. Every route, auth gate, DB query, loading/empty/error state, and event handler is preserved; all values stay wired to the existing live data (the mockup's numbers — 16 / 16 / 2, 3 ready / 13 attention — are the *current real* values, not placeholders to hardcode).

**Aesthetic:** premium football-operations command center — bold, tactical, high-contrast dark, readable under stadium lights. Less color, less clutter than today. ODK Labs blue-and-cyan brand. No purple, no green/teal spam, no colored-pill soup, no full-background gradients, no over-rounded cards, no low-contrast gray.

**Brand hierarchy in the UI:** ODK LABS (platform, primary in header) › OFFOPS (unified Coaches Hub — small module identifier only) › OFFGRD (game-plan) · OFFRD (recruiting) · OFFSZN (player-dev). Header leads with **ODK LABS**; "OFFOPS" is at most a small tag.

---

## 0. Inspect first — report before changing code

Identify and **report back the file paths + current data/prop shapes** before building. This grounds the redesign and surfaces shared-component blast radius:

- The page/component that renders the coach dashboard (the Team Portal Home).
- Shared **navigation, card, button, typography** components it uses.
- Existing **theme variables / Tailwind config** (where tokens live today).
- **Data sources + handlers** behind: `readyCount`, `attentionCount`, `totalPlayers`, `activePlayers`, `recentNotes`; the "review players needing attention" action; Add Player / Messaging Hub / Depth chart / Promote-Players routes; the bottom-nav (or side-nav) destinations and their routes; the team/season selector behavior.
- Any **desktop/tablet** versions that share these components (so the redesign doesn't break them).

If the dashboard is monolithic, extract the reusable pieces in §3 rather than editing in place.

## 1. Design tokens — add once, reuse everywhere

Add as CSS variables / Tailwind theme tokens (not scattered hex). Wire them into the existing theme system; keep the app's multi-theme behavior if present, with **this dark theme as the primary target**.

```css
--odk-bg:            #07111f;
--odk-nav:           #0b1729;
--odk-card:          #12213a;
--odk-card-selected: #192b49;
--odk-primary:       #3478f6;
--odk-cyan:          #28c7ee;
--odk-text-primary:  #f4f7fc;
--odk-text-secondary:#a9b6cb;
--odk-border:        #2a3d5d;
--odk-success:       #35d6a1;
--odk-warning:       #f6b91a;
--odk-danger:        #ff6572;
--odk-neutral:       #7f8ca3;
```

**Gradient — CTA + progress only** (never a full-page background): `linear-gradient(90deg, #3478f6 0%, #28c7ee 100%)`.

**Page background:** `#07111F`. Optional decorative play-diagram texture in the **upper** area only — CSS/low-opacity SVG X's-and-O's/arrows, **≤ 4–6% opacity**, `aria-hidden`, never touching readability. No large background gradient.

## 2. Current → target mapping (grounded in the live dashboard)

| Current (observed live) | Target |
|---|---|
| "OFFRD TEAM PORTAL" header + always-visible **Sign out** button | `ODKAppHeader` — ODK Labs shield + "ODK LABS" wordmark left, profile control right. **Sign-out moves into the profile/More menu** (remove from main header). |
| "Home · Varsity 2026 Season" pill | `SeasonSelector` — compact "Varsity · 2026 Season" + chevron on a dark slate surface, thin `#2A3D5D` border. Preserve current team/season selection behavior. No big cyan-filled pill. |
| Four equal stat cards (Total 16 / Active 16 / Needs attention 13 / Recent Notes 2) + intro copy | Split into `RosterReadinessCard` (primary) + `MetricStrip` (Total / Active / Recent Notes). Drop the intro copy. |
| "Recruiting Readiness" table (players ready / at-risk) | Keep as its own section **and** use it as the source of `readyCount` / `attentionCount` for the readiness card (that's where "3 ready / 13 attention" comes from). Don't duplicate its data model. |
| Quick Actions (Add Player / Messaging Hub / Depth chart / Promote Players) | `QuickActionCard` 2×2 grid: **Add Player / Message Team / Depth Chart / Recruiting** → wire to the existing routes (Messaging Hub→Message Team, Promote Players→Recruiting). |
| Recent Notes (count 2) | `RecentActivityList` — real activity/notes data (see §4.5). |
| Home / Roster / Depth chart / Calendar / Messages nav | `MobileBottomNav` — Home / Roster / Depth / Messages / More, existing routes preserved. |

## 3. Component architecture (reusable pieces)

Extract these (or the repo's established naming if different). Each takes live data via props/hooks — **no static mock data**.

- **`ODKAppHeader`** — shield + "ODK LABS" wordmark, profile control (avatar/menu) housing Sign out. Props: coach/profile, `onSignOut`. Logo: if no ODK Labs asset exists, **reuse the current OFFGRD shield temporarily**, implemented so it's trivially swappable — do **not** invent a new permanent logo in code.
- **`SeasonSelector`** — label + chevron, slate surface, thin border; drives the existing selection handler.
- **`RosterReadinessCard`** — see §4.2.
- **`MetricStrip`** — see §4.3.
- **`QuickActionCard`** — icon + label + chevron; `to`/`onClick`, `icon`, `label`; hover/pressed/focus states.
- **`RecentActivityList`** + **`RecentActivityItem`** — icon + description + timestamp.
- **`MobileBottomNav`** — see §4.6.

## 4. Per-section specs

### 4.1 Header
Top row: ODK Labs shield left → "ODK LABS" wordmark beside it (bold, condensed, `--odk-text-primary`); profile avatar/control right. **No Sign out in the header** (move to profile/More menu). Below: page title **"Coaches Hub"** (bold ~30–36px, subtle depth per mockup), then the `SeasonSelector`.

### 4.2 Roster Readiness card (primary)
- Label: `ROSTER READINESS` (uppercase, letter-spaced, `--odk-text-secondary`).
- Main value (live): **"[readyCount] Players Ready"** — number in `--odk-success` (#35D6A1), words in `--odk-text-primary`, bold ~28–34px.
- Supporting (live): **"[attentionCount] players need attention"** — number in `--odk-warning` (#F6B91A), rest secondary.
- **Progress**: ready ÷ total-active, filled with the blue→cyan gradient on a dark track (`--odk-border`/slate).
- **Primary button**: **"Review [attentionCount] Players"** + right arrow, full-width blue→cyan gradient — wire to the **existing** route/action for players-needing-attention. If none exists, link to the appropriate roster view via the project's routing (no fake interaction).
- Styling: bg `--odk-card`, `1px solid --odk-border`, radius ~16–20px.
- **Edge cases:** zero handled gracefully; correct singular/plural ("1 Player Ready", "1 player needs attention", "0 players need attention" → consider a "roster ready" state); if `attention===0`, the button reads/behaves sensibly (e.g., "Review Roster") rather than "Review 0 Players". Avoid red unless genuinely critical.

### 4.3 Metric strip
One horizontal panel, three live metrics with subtle vertical dividers: **Total Players / Active / Recent Notes**. Each: large numeric value (electric blue `--odk-primary`), small secondary label, optional thin-line icon (people / star / doc, per mockup). Icons/values blue — **not** a different color per metric. On ≤320px, stay readable without overflow (responsive sizing or compact grid).

### 4.4 Quick Actions
Section title "Quick Actions" (bold ~20–24px). Four `QuickActionCard`s — **Add Player, Message Team, Depth Chart, Recruiting** — wired to existing routes. Layout: 2-col grid on mobile, 1-col on very narrow, consistent heights. Each: thin blue line icon, label, small right chevron, bg `--odk-card`, border `--odk-border`, clear hover/pressed/keyboard-focus. **No large filled cyan icon squares.** If an action has no existing destination, connect it to the closest one or omit it — **no dead buttons** — and note it in the summary.

### 4.5 Recent Activity
Section "Recent Activity" beneath Quick Actions. Use **real** existing activity/note data. Each item: small icon + short description + relative/formatted timestamp (the mockup's "Player profile updated · 2 hours ago" is illustrative — bind to real data). If there's no activity feed source, **preserve the current Recent Notes** data here and build the section architecture without fabricated entries.

### 4.6 Bottom navigation
Restyle the existing nav: bg `--odk-nav` (#0B1729), top border `--odk-border`, active item `--odk-primary`, inactive `--odk-text-secondary`. Destinations + routes unchanged: **Home / Roster / Depth / Messages / More**. Thin-line icons + labels, remove heavy icon containers. Fixed/sticky per the app's existing behavior; respect iOS safe-area insets; never obscure content (pad the page bottom); tap targets ≥ 44×44px.

### 4.7 Typography & status
Family: the app's existing sans (unless an approved ODK Labs display font exists). Hierarchy: "Coaches Hub" ~30–36px bold; readiness value ~28–34px bold; section titles ~20–24px bold; card/action labels ~16–18px semibold; support ~14–16px. Primary text `--odk-text-primary`, secondary `--odk-text-secondary` (never below accessible contrast). **Status colors consistent** everywhere touched: ready `--odk-success`, attention `--odk-warning`, at-risk/not-ready `--odk-danger`, missing `--odk-neutral`. Prefer small dots / thin left-edge indicators / muted tinted badges — not large pills. Never use red and purple interchangeably (and no purple at all).

## 5. Preservation constraints (do not break)

Keep intact: all routes, authentication, DB queries, loading/empty/error states, event handlers. **No** DB-table or API-contract changes. **No** static mock data replacing live values. **No** new UI library unless absolutely necessary; use the existing icon library. No unrelated refactors. Don't modify OFFRD player-facing screens **unless** they share a component that must change — if so, call it out. Don't break the desktop/tablet layout: on desktop use a sensible centered max-width or adapt to the existing sidebar; don't stretch cards across the whole screen.

## 6. Responsiveness — verify at
320px, 390px (iPhone), 430px (large phone), tablet, and the existing desktop breakpoint.

## 7. Accessibility
WCAG-friendly contrast; visible keyboard focus; semantic `<button>`/`<a>`; icon buttons have accessible labels; **status never conveyed by color alone** (pair with dot/text/icon); tap targets ≥ 44×44px; respect `prefers-reduced-motion`; decorative play-diagram graphics `aria-hidden`.

## 8. Verification (run before reporting)
1. Formatter + linter. 2. Relevant tests. 3. Production build. 4. TypeScript errors (zero). 5. Every dashboard action routes correctly. 6. Live roster values populate (not the mockup literals). 7. Inspect at the §6 widths. 8. Content not hidden behind bottom nav. 9. Loading / empty / error states. 10. Compare mobile screen to the attached mockup. Capture a ~390px mobile screenshot.

## 9. Report back
- Concise list of files changed.
- Summary of visual changes.
- Any mockup action that couldn't be connected to existing functionality (and what you did instead).
- Test / lint / build results.
- The 390px screenshot.

---

## Then — Claude runs the render-proof
Once it's on a preview I'll verify live, signed in as hscoach: the redesign renders at **320 / 390 / 430 / tablet / desktop**; **live values** still populate (16 / 16 / 2, ready/attention from Recruiting Readiness — not hardcoded); **every action routes** (Review Players, the 4 Quick Actions, bottom nav); **no regression** on the shared desktop/sidebar layout; content clears the bottom nav; and the mobile screen matches the **attached mockup**. Same verify-before-ship discipline as the Focus Today arc — preview → signed-in render-proof → fast-forward cutover.
