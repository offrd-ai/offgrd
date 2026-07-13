# Scope display fix — tendency report + weekly-package snapshot

**Cache:** `?v=52`  
**Symptom:** badge `76 · 1 game` vs report `76 D · 117 O · 2 games` (v51); earlier `130 vs 193`.

## Cause
- v51 badge still used **mode-side only** (`scopedOppRows("def")` on Defense) → 1 game date.
- Report/package used **def + off** → 2 game dates.

## Fix (v52)
Badge now uses the same pool:
`76 D · 117 O · 2 games · Parkway North`

Derived from `scopedOppRows("def")` + `scopedOppRows("off")` — identical to Tendencies + Package. Changing Games(scope) updates all three together.

## Acceptance
- Badge games count = report scope tile games count.
- Badge `N D · M O` = report "N defensive · M offensive".
- Package snapshot identical.
- Per-cell `n=` still reconciles.

*Reporting-only. No edge redeploy.*
