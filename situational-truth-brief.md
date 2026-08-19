# EXECUTE NOW — Situational truth in the Magic 3 rollup

Two changes that together stop the family table from misleading a coach. Read
`magic3-polish-brief.md` and `import-fidelity-brief.md` first — both follow-ups were
logged there and this brief promotes them.

**The problem, stated plainly.** The rollup currently invites a wrong conclusion.
Flood reads 7.2 YPP / 73% EFF on 11 calls; Quick Game reads 3.8 / 38% on 76. A coach
reads that as "call more Flood." But the Goaline diagnostic proved the confound:
that family reads 0% largely because VIKING and PHILLY only get called on 2nd-and-25
and 4th-and-20 — and 11 of its 14 snaps gained exactly 0 yards on pass plays, which
are almost certainly incompletions we currently cannot distinguish from stuffs.

Efficiency by family is entangled with **when** each family gets called and **how**
each snap actually ended. Fix both or the number stays a half-truth.

---

## PART A — Show the situation the family was called in

**A1. Average distance-to-go, per family row.** Beside `n`, show the mean `DIST`
across that family's snaps. This is the single cheapest way to expose the confound:
if Flood averages 3rd-and-4 and Quick Game averages 3rd-and-9, the comparison
explains itself without a stats lecture.

- Column header short enough to fit the existing table — `AVG TO GO` or `DIST`.
- Compute from the same rows the EFF number uses, so the two can never disagree.
- Blank, not zero, when `DIST` is missing. Never impute.
- Applies to every axis (family, structure, concept), not just family.

**A2. Down mix, if it fits without crowding.** A compact indicator of which downs
the family lives on — e.g. `1st 60% · 2nd 25% · 3rd 15%` — is more honest than
average distance alone, because a family called mostly on 1st down is a different
animal from one called on 3rd. Your call whether it fits the row or belongs in an
expanded state. **Do not crowd the table.** If it doesn't fit cleanly, propose where
it should live and build A1 only.

**A3. Do NOT build a normalized/adjusted efficiency metric.** No opponent
adjustment, no expected-points model, no situation-weighted EFF. We show the raw
number and the context beside it, and let the coach do the reasoning. Inventing a
composite would be exactly the over-modeling this product refuses to do.

---

## PART B — Stop treating an incompletion like a stuff

**B1. Import RESULT on own-offense rows.** Promoted out of Slice B of
`import-fidelity-brief.md`. The classic path stores RESULT for defense and scout
rows but not `side:"ours"`, yet RESULT is ~97–100% filled in every export we have
(Rush, Complete, Incomplete, Penalty, Complete TD, Scramble, Rush TD, Sack,
Interception, Fumble).

- Header alias + store on ours. Do not change the defense/scout paths.
- Report which games need re-import, per the standing rule.
- Assist: write `result` onto the typed snap — `FIELD_DEFS` already defines it and
  the typed write currently leaves it in `raw`.

**B2. Use it where it changes the read, and nowhere else.**
- A completion percentage on pass-family rows is legitimate and useful.
- A sack should not read as a run for −7. Report how sacks are currently bucketed
  in the rollup and whether that distorts any family's YPP today.
- Penalties: report how they're handled now. A penalty snap with 0 gain is not a
  failed play call and probably should not sit in the denominator — but do not
  change that behavior in this slice. Report first; if the change is warranted it
  gets its own decision, because it moves EFF everywhere.

**B3. Honesty rules, unchanged.** Nothing is inferred from a blank RESULT. Rows
missing it are counted in the denominator and shown as unknown, never assumed
complete or incomplete.

---

## Acceptance
1. Every rollup row shows avg distance-to-go, computed from the same rows as its
   EFF; blank when `DIST` is absent.
2. Goaline (or whatever VIKING/PHILLY map to) visibly shows a long average
   distance, making its 0% legible as situational rather than mysterious.
3. Totals still reconcile; the footer contract is unchanged.
4. RESULT lands on own-offense rows; re-import scope reported per field.
5. No composite/adjusted efficiency metric was introduced.
6. Sack and penalty handling reported. Penalty behavior unchanged in this slice.
7. `npm run check` green, including a fixture where two families share an EFF but
   differ sharply in average distance.

## Slice result — done 2026-08-19 (pin v305)

A1, B1, B2-report, B3 landed. No composite EFF. Penalty handling unchanged.

**A2.** Down mix does not fit the row. Six columns already (n · DIST · % · YPP · EFF · COMP).
Propose: tap a family name to expand a one-line mix (`1st 60% · 2nd 25% · 3rd 15%`)
under that row. Not built.

**B2 sacks (live corpus, 238 ours).** The rollup does not special-case sacks.
`structureLabel` reads `playType`, so a Pass / −7 stays PASS, not a run.
YPP is mean `gain`, so that −7 sits in the family average.

Hudl `RESULT=Sack` is stored on 0/238 ours rows (parseOffense never wrote it).
14 Pass snaps have negative gain (mean −9.3). Those are the sack-shaped
plays today. Dropping them would move Mesh 5.3 → 10.1 (5 of 21), Screen
2.0 → 4.2 (1 of 6), Goaline −0.1 → 0.7 (2 of 14), Quick Game 5.0 → 5.3.
Flood is untouched. We did not drop them.

**B2 penalties (live corpus).** Hudl `RESULT=Penalty` is also 0/238.
A penalty with gain 0 still scores as an EFF miss (`isSuccessVal`).
It stays in the denominator. Not changed.

96/238 rows have a `result`, but they are live-call buckets (hit / miss /
solid / short / …), not Hudl Complete / Incomplete. COMP stays blank
until a classic own-offense re-import writes the Hudl tag. Blank RESULT
is never inferred.

**Re-import.** Classic own-offense games must be re-imported for Magic 3
to show COMP. Assist already keeps RESULT in `raw`; `scout_snaps` has no
`result` column, so the typed snap is in-memory + raw only. Defense/scout
paths were not changed.

---

## Also outstanding (not this slice)
- Offline reload with the rollup rendered — never verified on any pin.
- Auth reentrancy: `onAuthStateChange` → `onUser` → `myTeams()` → `ensureFreshSession()`
  can fire another auth event. App-wide, own slice.
- Native `confirm()` → in-page `askConfirm` in `.pm-unmap`, Formations unmap, and
  "Plan this week". Unblocks automated verification of destructive actions.
