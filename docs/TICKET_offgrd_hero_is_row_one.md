# TICKET — Hero is row one of the shortlist

BEST NOW. After the Build B production pin. Not in that pin.

## What happened

Vs Cover 0 this week the hero showed MEMPHIS as a concept match. HAMMER
was sitting on a situational record of 78% over 18 snaps. History lost
to theory.

## The rule

One ranking function, shared by the hero and the shortlist. The hero is
row one of that list. There is no second sort for the headline.

History before theory:

- A situational record at or above `MIN_SNAPS` (shortlist default 4, in
  `OFFGRD-caller-shortlist.js`) beats any concept match.
- A concept match is the hero only when nothing clears that gate. Label
  it "no reps." Do not label it as if it were the call.

`callerRankedCalls()` in `OFFGRD.html` currently sorts on expected value
and scheme, then `OFFGRD_CALLER_SHORTLIST.buildPanel` re-ranks for the
list underneath. The call sheet takes `ranked.list[0]` (or the sheet
panel's first row) as the headline. Those two orders diverged on Cover 0.

## Done when

- Hero and shortlist are the same function. Hero === row 1.
- Against a look where one play has ≥ `MIN_SNAPS` in the situation and
  another is only a concept match, the record is the hero.
- When no play clears the gate, the hero is the concept match and the
  label says "no reps."
- The Cover 0 case ranks HAMMER (78% / 18) above MEMPHIS.
