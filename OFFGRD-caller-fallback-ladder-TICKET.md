# O/D Caller — situational fallback ladder (never-blank) TICKET

**Problem.** When a filter combination (Hash + Field + Down/Distance) has no logged sample, the caller shows "No sample for this sit — widen hash/field or log looks" and gives the coach nothing. But the data usually exists one level up: `2nd & 7-9 · M · Plus` = 0 snaps, yet `2nd & 7-9 · any · any` = 7 snaps → Cali 86%. On a headset with the play clock running, blank is the worst outcome — the coach needs a lean even if it's a wide one.

**Goal.** Never go blank. Auto-degrade specificity down a fixed ladder until a sample floor is met, show best-now from there, and label exactly how far it widened. Shared by O Caller and D Caller (one resolver, two UIs — same two-readers discipline as `OFFGRD_CALLER_OUTCOME`).

---

## Fallback ladder (relax least-predictive filter first)

Evaluate rungs top→down; use the **first rung with n ≥ 5** (THIN floor). Show best-now + best-options from that rung.

| Rung | Filter set | Rationale |
|---|---|---|
| 0 | Down + Distance + Hash + Field | exact |
| 1 | Down + Distance + Field (drop **Hash**) | hash barely moves coverage tendency — drop first |
| 2 | Down + Distance (drop **Field**) | open-field only; **RZ sticky — see below** |
| 3 | Down + Distance-**group** (widen band to neighbor) | 7-9 borrows 10+ before 1-3; medium↔long adjacency, not short |
| 4 | Down only | last data-driven resort |
| 5 | **Playbook call sheet** | terminal — "no reps yet, here's your script" (reuse existing Playbook) |

- **Auto-widen** — don't require the coach to tap through rungs mid-drive. Compute the best rung and render best-now immediately.
- **Fixed order, not adaptive.** Hash always drops first, etc. Predictability builds coach muscle memory; do not reorder based on which filter happens to have data.

## Sticky rules (never blend across these — a wrong-context call is worse than a wide one)

- **Red zone ≠ open field.** Never fall back from RZ to open-field snaps. Widen *within* RZ (drop hash, widen distance) but stay in RZ. If RZ has nothing at all → "No red-zone looks logged yet" + playbook, not open-field calls.
- **Money downs don't borrow early-down data.** 3rd/4th down never fall back into 1st/2nd-down samples. Keep `down` through rung 4; rung 3 widens distance only.
- **Goal-to-go** is its own bucket (don't blend with distance bands).

## Transparency (honest-numbers brand)

- Badge best-now with the rung it used: `Best from 2ND & 7-9 · any hash/field (7)` — coach always knows the specificity behind the number.
- Confidence chip reflects the **widened** sample n (a broader-but-bigger sample can legitimately read higher confidence — that's honest, surface it).
- Never silently blend levels; the label names the exact filter set used.
- When on the terminal playbook rung, say so plainly: `No reps logged — from your call sheet, not their tendencies.`

## Reuse

The self-scout tendency grid already documents "small-sample situations are widened automatically and flagged." Extend that **same** widening mechanism into the caller's hash+field path — don't fork a second widener. One resolver consumed by O + D caller UIs.

---

## Acceptance

1. `2nd & 7-9 · M · Plus` (0 exact) renders best-now from `2nd & 7-9 · any/any` (7) with a "widened: any hash/field" badge — not the blank state.
2. Every reachable Down/Distance shows *something* — best-now or the playbook terminal — never a dead "no plays" with no options.
3. RZ situation with no RZ sample shows RZ-widen or "no red-zone looks yet," and **never** surfaces open-field calls.
4. 3rd-down thin situation never shows 1st/2nd-down-sourced calls.
5. Badge always states the rung/filter-set used; confidence chip matches the widened n.
6. O and D caller produce identical results for identical inputs (shared resolver).
7. Smoke cases: exact-hit; hash-drop recovery; field-drop; distance-widen adjacency; down-only; playbook terminal; RZ-sticky (no open-field bleed); money-down-sticky.

## Sequence
Build the shared resolver + ladder → wire O caller → wire D caller (same resolver) → badges/labels → smokes. Screenshot the `2nd & 7-9` case (the one from Matt's report) resolving to Cali 86% with the widen badge — that's the proof.
