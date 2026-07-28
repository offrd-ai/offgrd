# Coaches Hub — F1/F2 fix: unify roster scope + deep-link the Review CTA

**Found in the ODK redesign render-proof** (preview `offrd-9d7hldg3c`, signed in as hscoach). Neither is caused by the redesign — both are pre-existing — but the redesign **promotes Roster Readiness to the hero position**, which makes them visible in a way they weren't before. Fix both before a design partner sees the dashboard.

| | Observed |
|---|---|
| **F1** | Dashboard: **"16 Total Players"**, **"Review 13 Players"**. Roster page it links to: **"12 athletes."** Same coach, same "Varsity · 2026 Season" selection. |
| **F2** | The Review CTA links to plain `/high-school-coach/players` — no attention filter — so the coach lands on the full roster and has to find the 13 himself. |

---

## F1 — one roster population, resolved from the active selection

### Root cause (confirm in inspect)

Two different population definitions are in play on the same screen:

- **Dashboard stats** read `players` by **`school_id`** (per Cursor's §0 inspect: *"Supabase players by school_id; active = updated/created in last 30d"*, and *"roster load still keys off coach's **first** `school_id`"*). → **16**
- **Roster page** reads **team-season roster membership** (the Program → Team → Season → Person → Membership model). → **12** for Varsity 2026.

The header says **"Varsity · 2026 Season."** If a team and season are selected, every number on the page must mean *that* team and season. School-wide counts under a team-season selector are simply wrong labels.

### The fix

1. **One resolver, one population.** The dashboard's metric strip, Roster Readiness card, **and** the Recruiting Readiness list must all read from the **same** roster query the Roster page uses, scoped to the **selected team + season**. Do not add a parallel query — reuse the existing roster resolver.
2. **Honor the switcher, not "first `school_id`."** Resolve from the active hub team/season selection (`resolveActiveTeam` / `setActiveHubTeam`). A coach with more than one program must never see another program's numbers. *(This is the Phase 0 team-resolution item; this ticket delivers it for the dashboard surface.)*
3. **Re-base every derived number** on that population: `totalPlayers`, `activePlayers`, `readyCount`, `attentionCount` (= At Risk + Needs Work — **keep the computation identical**, only the input set changes).
4. **Define the edge rule and state it in the PR:** a player in `players` with no team-season membership is **not** on this roster. If that produces orphans worth surfacing, that's a separate roster-hygiene ticket — **do not** silently fold them back into the count.

### Expect the numbers to change — that's the fix working

After this, the dashboard will show **12**, not 16, and ready/attention will re-base accordingly. **That is correct, not a regression.** The mockup's `3 / 13` will no longer match — live data wins over the mockup, per the redesign ticket.

---

## F2 — deep-link Review to the needs-attention subset

**Reuse what already exists.** The Messages compose screen has a **"Needs attention (readiness)"** audience chip — so a readiness/attention predicate is already implemented somewhere. Find it and reuse it; do **not** write a second definition of "needs attention."

1. **Check first:** does the Roster page already accept a filter/sort param? If yes, use it. If not, add a small additive param (e.g. `?readiness=attention`) — no data-model change.
2. **Wire the CTA** to land on the filtered subset, pre-applied and **visible** (the active filter should be shown as a chip the coach can clear — never a hidden filter that makes the roster look broken).
3. **Count parity:** the number in the button must equal the number of rows shown. `Review 13 Players` → 13 rows. If those can't match, the button text is wrong, not the list.
4. **Zero / singular states** (re-verify from the redesign ticket, and they matter more now that the population is smaller):
   - `attention === 0` → CTA reads something sensible (e.g. **"Review Roster"**) and the card can show a positive state — never "Review 0 Players."
   - `1` → "1 Player Ready" / "1 player needs attention."
   - Filtered view with zero results → a clean **"everyone's ready"** empty state, not a blank table.

---

## Guardrails

- **Visual/data-scoping fix only.** No DB table changes, no API contract changes, no migration.
- **No change to readiness scoring** — `calculateAllPlayerReadiness` and the Ready / At Risk / Needs Work thresholds are untouched. Only the input population changes.
- **Focus Today is out of scope and must stay green.** `group_focus` / `get_group_focus_for_school` / `get_focus_impact` are school-scoped by design — **do not** re-scope them in this ticket. Regression-check that Daily Focus and Focus Impact still render after the change.
- Reuse existing components; no new UI library; existing icon set.
- Don't break the desktop/sidebar layout or the other portal surfaces sharing the shell.

## Acceptance

1. Metric strip, Roster Readiness card, Recruiting Readiness list, and the CTA destination all resolve from **one** roster query scoped to the selected team + season.
2. **Dashboard total == Roster page count** for the same selection (today: 12 == 12).
3. **Switching team or season updates the dashboard numbers** — proves resolution follows the switcher, not the coach's first `school_id`.
4. Review CTA lands on the needs-attention subset with the filter visible; **button count == rows shown**.
5. Zero and singular states correct on both the card and the filtered list.
6. Attention definition unchanged (At Risk + Needs Work) and sourced from the **existing** predicate shared with the Messages audience.
7. Focus Today / Focus Impact regression-green; no scoring, DB, or API change.

## Verification

Signed-in render-proof, not a unit test:

- Dashboard total matches the Roster page for the same team/season.
- Click **Review N Players** → land on the filtered list → **count the rows, they equal N**.
- Switch team (and season) → dashboard numbers change coherently; no other program's data appears.
- Force `attention = 0` (or a fixture) → confirm the CTA and empty states read correctly.
- Daily Focus + Focus Impact still render and function.
- Re-check at mobile width — this is a mobile-first surface.

I'll run this pass on the preview once it's up.

---

### Note for sequencing
F1 is the dashboard slice of the broader **team-resolution unification** in Phase 0. Landing it here doesn't close that item globally — other surfaces may still resolve school the old way. Worth a follow-up sweep, but the dashboard is the one under the hero card, so it goes first.
