# OFFGRD — Hudl Tagging & Import Guide

A one-page reference for charting opponent defenses so they load straight into OFFGRD's **Defense Scout**. Tag once, import, predict.

---

## The golden rule: tag on YOUR offense (ODK = O)

Their defense is on the field when **we're on offense**. So `DEF FRONT`, `BLITZ`, and `COVERAGE` get tagged on **ODK = O** rows. OFFGRD reads those rows automatically and ignores the rest (your defense, special teams).

Charting scout film (them vs someone else)? Tag defense on the **D rows**. Charting our game? Tag defense on the **O rows**. The importer figures out the rest.

You do **not** need coverage to start — **front + blitz alone** already produce front and pressure tendencies. Coverage layers on top and unlocks the coverage call + play call sheet.

---

## What to tag (3 columns)

### 1. DEF FRONT  *(required for front tendencies)*
Be consistent — OFFGRD now auto-fixes capitalization, so "Over" = "OVER".
Examples: `EVEN` · `ODD` · `SPLIT` · `STACK` · `BEAR` · `OVER` · `UNDER` · `4-2` · `3-3` · `4-4`

### 2. BLITZ  *(required for pressure tendencies)*
Name the pressure — any value counts as a blitz. Leave **blank** or type `No Blitz` for none.
Examples: `MIKE` · `NICKEL` · `DOUBLE A` · `EDGE` · `SAFETY` · `CORNER` · `ZERO`
For a 4-man simulated pressure (drop a lineman), tag `SIM PRESSURE` so it shows as its own category.

### 3. COVERAGE  *(optional — add when ready)*
OFFGRD understands all of these and normalizes them automatically:

| You can type | OFFGRD reads it as |
|---|---|
| `Cover 0` `C0` `Zero` | Cover 0 |
| `Cover 1` `C1` `Man Free` | Cover 1 |
| `Cover 2` `C2` `Tampa` | Cover 2 |
| `Cover 3` `C3` `3 Buzz` `3 Sky` `3 Cloud` | Cover 3 |
| `Cover 4` `C4` `Quarters` | Cover 4 |
| `Cover 6` `C6` | Cover 6 |
| `2 Man` `2-Man` | 2-Man |
| `Man` (when you don't know the shell) | Man |
| `Zone` (when you don't know the shell) | Zone |

**Layered approach:** Start with `Man` / `Zone` where you're unsure — OFFGRD still predicts at that level and gets sharper automatically as you fill in specific shells.

> Already auto-tagged by Hudl Assist (no work for you): DN, DIST, YARD LN, HASH, OFF FORM, BACKFIELD, PLAY TYPE, PLAY DIR, GN/LS.
>
> Name the play. Put direction in **PLAY DIR** — exactly as Parkway West already charts. Do not put WEST / EAST / LEFT / RIGHT on the play name.

---

## Export from Hudl

Both Hudl interfaces work. Either way, OFFGRD needs the **play-by-play grid**, one row per play.

**Classic:**

1. Open the game breakdown (the play grid with your columns).
2. Click **Export to Excel** (bottom of the breakdown).

**New Hudl (Fall '26 interface):**

1. Open the game from the library and go to the play grid.
2. Export is on the **action bar** (alongside copy / move) — no longer buried in a menu.
3. If any of our three columns are hidden, **right-click a column header** to show them (new in Fall '26).

> ⚠️ **Don't use "report export."** New Hudl can export *reports* as CSV — those are aggregated summaries, not play rows, and OFFGRD can't read them. Export the **grid**, not a report.

**Then, for either path:**

1. Include the columns: `ODK, DN, DIST, YARD LN, HASH, OFF FORM, BACKFIELD, PLAY TYPE, PLAY DIR, GN/LS, DEF FRONT, BLITZ, COVERAGE`.
2. Save the file as **.csv** (in Excel: File → Save As → CSV).

You can export the whole game — OFFGRD filters to the right rows itself.

*Tagging tip: Hudl's Fall '26 grid fixed dropped cells when typing fast and added better sorting — tagging `DEF FRONT` / `BLITZ` / `COVERAGE` in the new grid is now the quicker option.*

---

## Import into OFFGRD

1. Open **OFFGRD.html**.
2. Top right → **Import data**.
3. Pick the side:
   - **Defense (DC scout)** → their defense (front / blitz / coverage). *This is the one for this guide.*
   - **Opponent offense (run/pass)** → their offense tendencies.
   - **Offense (our plays)** → our self-scout for the call sheet.
4. Type the **Opponent** (e.g., `Parkway North`) and a **Week / game label** (e.g., `2024` or `Wk 3`).
5. Paste the CSV (or upload it) → **Add to season**.
6. The box confirms what mapped and which rows it used.

---

## Keeping a clean season

- **Re-importing replaces** a game with the same Opponent + Week + side — so re-pull a cleaner export anytime, no duplicates.
- **Manage** (top bar) lists every game; delete or review there.
- **Export season file** backs up your whole library to one file you can share with other coaches (they use **Import season file**).
- Auto-saves in the browser between sessions.

---

## Consistency checklist

- [ ] Tagging on **O rows** for our game (your offense vs their defense), or **D rows** for scout film — the importer detects which
- [ ] Same **front** names across games (EVEN/ODD/etc.)
- [ ] **Blitz** named, or `No Blitz`/blank for none; `SIM PRESSURE` for sims
- [ ] **Coverage** from the accepted list (start with Man/Zone if unsure)
- [ ] One Opponent + Week label per game, consistent spelling

*Tag it once, import it, and OFFGRD does the rest — offline, on the sideline.*
