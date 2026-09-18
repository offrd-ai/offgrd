# TICKET — D Caller: a call is the snap

Central 9/10 (and Friday 9/4) both lost D as snaps because an open ungraded
snap absorbed every later tap as a `correction` on playIndex 0.

## Rule
Step 3 (the D call / Run-Pass) **creates the snap**. Yards enrich it.
**The next D call closes the previous snap**, graded or not.

"Amend the open ungraded snap" survives only for the **same call re-tapped
within 3s**. Pending count is honest.

## Not
- Do not emit `undo` to replace an ungraded call.
- Do not wait for yards before allocating the next playIndex.
- Do not let offense outcomes on the same gameId count as "graded."

## Soak
§5 of `docs/OFFGRD-postmortem-2026-09-10-Central.md`. No production pin
until that iPad soak is green.
