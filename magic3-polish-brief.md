# Magic 3 polish — three items, then Slice A

Small slice off the back of the first real production use of the family rollup.
Item 1 may be a correctness bug in the shared success rule; do it first and report
before changing anything.

---

## 1. Goal-line efficiency may be a measurement artifact (report first)

Live numbers from the family rollup on the real corpus:

| family | n | % | YPP | EFF |
|---|---|---|---|---|
| Quick Game | 76 | 35% | 3.8 | 38% |
| Mesh | 21 | 10% | 5.0 | 52% |
| Inside Run | 16 | 7% | 2.6 | 44% |
| **Goaline** | **14** | **6%** | **−0.1** | **0%** |
| Counter | 12 | 6% | 1.9 | 17% |
| Smash | 12 | 6% | 2.5 | 25% |
| Flood | 11 | 5% | 7.2 | 73% |

0% efficiency across 14 calls is either a real finding or a broken measurement, and
we must not report it to a coach until we know which.

The canon rule is `gain >= 0.5×DIST` (1st), `0.7×DIST` (2nd), `DIST` (3rd/4th).
Near the goal line that can be unsatisfiable: if a 1st-and-goal from the 3 carries
`DIST = 10` (a default, or distance-to-marker rather than distance-to-goal), success
would require 5 yards on a 3-yard field. Every such snap fails by construction.

Report:
1. For those 14 snaps: dump `DN`, `DIST`, `YARD LN`, `GN/LS`, `RESULT`. Is `DIST`
   ever greater than the actual distance to the goal line?
2. Does the success rule clamp the needed yards to the distance available? If not,
   how many snaps in the whole corpus — not just this family — are affected?
3. Are all 14 actually goal-line *situations*, or is "Goaline" a family label that
   also gets called elsewhere? These are different problems.
4. Does a rushing/receiving touchdown record a positive `GN/LS`? A −0.1 YPP average
   is suspicious if scores are logged as 0.

If the rule is unclamped, the fix is to cap needed yards at the distance to the goal
line — and it applies to the canon success function everywhere, not just this
rollup. That would shift numbers across Tendencies and the caller, so report the
blast radius before changing it. If the measurement is sound, say so plainly and we
treat −0.1 / 0% as a real coaching finding.

---

## 2. Axis tabs collide

The tab row reads **Family · Structure · Concepts · Families** and two appear active
at once. Report what each tab actually does. If "Family" and "Families" are distinct
axes, rename them so a coach can tell them apart at a glance without a legend. If
one is redundant, remove it. Only one axis may render as active at a time.

## 3. Redundant `n=` in metric cells

Cells read `3.8 n=76` and `38% n=76` while the N column already shows 76. Drop the
inline `n=` when it equals the row's N. Keep it **only** where the denominator
genuinely differs from the row count (e.g. a metric computed over a subset), because
that difference is information. Report any place that's true.

---

## Then: Slice A of `import-fidelity-brief.md`

After this slice commits, execute **Slice A only** from `import-fidelity-brief.md`
in the repo root — the STUNT/BLITZ correctness bug, PRESNAP SAFETIES, coverage
modifiers, and the play-map hydrate smoke. Report A1–A4 and stop. Do not start
Slice B.

---

## Backlog (do not build)

Logged 2026-08-19 after the Goaline diagnostic. Success rule stays unclamped;
revisit only if YARD LN lands on own-offense rows.

1. **Selection effect (Magic 3) — done in situational-truth v305.** DIST
   column beside `n`, from the same rows as EFF.

2. **RESULT on own-offense rows — done in situational-truth v305.** COMP on
   pass-family rows. Sack/penalty reported, penalty behavior unchanged.
