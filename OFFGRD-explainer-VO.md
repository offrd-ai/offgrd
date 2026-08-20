# OFFGRD Explainer — VO blocks & timing sheet

Companion to `walkthroughs/offgrd-explainer.html`.
**Measured:** 160 words · 10 beats · **60 s** finished runtime, VO embedded.
**Block durations as rendered:** 14.16 / 13.74 / 21.63 / 6.09 s = 55.6 s of speech + 3.9 s of beats between blocks and on the close.

> Note on the old count: the previous draft said "163 words" for nine lines. Actual count on those nine lines is 148. The soft time line below adds 12, so the real number is **160**.

---

## 1. What changed from the locked script

One line added as beat 3, per the soft-claim decision — directional, nothing a coach can check against his own Sunday and find wrong:

> **By the time it's a call sheet, half your week is gone.**

It sits between "somebody's spreadsheet" and "OFFGRD pulls it into one place," so the mess is the setup and *one place* is the payoff. On screen the montage dims and a SUN–FRI strip burns down three of six days under it. Nothing else in the script moved.

---

## 2. ElevenLabs generation blocks

Four generations, butted together in the edit. Splitting at these seams is cleaner than fighting the model with punctuation — each seam is a beat the model would otherwise rush.

**`OFF-GRID` is the spelling to paste.** Test the last line before you commit to a full render; a bad take there kills the close.

### Block 1 — cold open (0:00–0:23)
```
You already know what they do on third and long.

It's in the film. It's just spread across a week of clips, a legal pad, and somebody's spreadsheet.

By the time it's a call sheet, half your week is gone.

OFF-GRID pulls it into one place.
```

### Block 2 — the chart (0:23–0:35)
```
Chart your film once. OFF-GRID builds your scout cards from it, in your own formation language. Not somebody else's. It shows you what they actually run, how often, and how you've done against it.
```

### Block 3 — Friday night (0:35–0:56)
```
Friday night, you open O Caller. It already knows the down, the distance, the field zone. It shows you what they're likely to give you, and the calls from your book that have worked against that look. One tap grades the play.

Your call sheet and your self-scout, done as you go.

D Caller does the same on the other side of the ball.
```

### Block 4 — the close (0:56–1:16)
```
And when the press box wifi drops, both of them keep working.

OFF-GRID. Never off guard.
```

**Settings** (unchanged): male 35–55 American, low-mid register · Multilingual v2 · stability 50–60 · similarity 75 · style 0–15 · speed 0.95.

---

## 3. Timing sheet

Cut against your actual VO, not an estimate. Each block plays continuously and the **visuals** cut against it — so the pauses ElevenLabs rendered are the pauses in the spot, and no line ever gets clipped at a scene boundary.

| # | In | Len | Block · offset | Beat | On screen |
|---|---|---|---|---|---|
| 1 | 0:00.0 | 2.6 | 1 @ 0.00 | Third and long | Black. One line. `3RD & 12` chip. |
| 2 | 0:02.6 | 5.8 | 1 @ 2.64 | Spread across the week | Hudl clip grid · legal pad · `SCOUT_final_v4_USE THIS ONE.XLSX`. Deliberately ugly. |
| 3 | 0:08.4 | 3.4 | 1 @ 8.43 | Half your week is gone | Mess dims. SUN–FRI strip, three days burn red. |
| 4 | 0:11.8 | 3.0 | 1 @ 11.82 | One place | Cut to clean. Logo. Scout / Plan / Teach / Gameday. |
| 5 | 0:14.9 | 14.4 | 2 @ 0.00 | Chart once | Scout cards queue building — DART, 2X2 STACK, 3x1 wing, SPREAD, Tank 3x2, 2x1 Wing. His names. |
| 6 | 0:29.3 | 12.6 | 3 @ 0.00 | O Caller | Situation bar auto-fills. Expect strip. Three ranked calls. Cursor taps **Grade** at 10.7 s in — on "one tap grades the play." |
| 7 | 0:42.1 | 5.7 | 3 @ 12.57 | Call sheet + self-scout | Family rollup left, live graded play log right. |
| 8 | 0:47.8 | 4.0 | 3 @ 18.30 | D Caller | Flip. Their offense, your fronts and coverages. |
| 9 | 0:51.8 | 3.7 | 4 @ 0.00 | **Wifi drops** | Bars die one by one, ONLINE → OFFLINE, tap still registers. |
| 10 | 0:55.5 | 5.0 | 4 @ 3.66 | Never off guard | Logo. Line. `getoffrd.com/gameday`. Holds 2.5 s, then stops. |

**Total 60.8 s.** Your read came in faster than the 76 s the animatic first assumed, which is why it tightened — it's better at this length.

**Beat 8's cut point — resolved.** It was wrong, and it's fixed. The flip now happens at **18.30 s into Block 3** (was 17.04).

I couldn't settle it by waveform, so I measured pitch. Your read's sentence-initial reference — "Friday night" opening Block 3 — peaks at **176 Hz**. Its sentence-final reference — "grades the play." — falls to **70 Hz**. The segment starting at 18.66 s rises to **198 Hz**, a clear phrase-onset reset, which puts "D Caller does the same…" there and not at 17.22 s. The old 17.04 cut was flipping to the D Caller screen 1.6 s early, with the tail of *"…done as you go."* playing over it. The corrected cut lands in the 17.94–18.66 s pause, 0.36 s ahead of the words. Verified on the render.

## 4. Two things to do before you render

**Paste your screenshots.** Top of the script in the HTML:

```js
const SHOTS = {
  scoutcards : "",   // beat 5
  ocaller    : "",   // beat 6
  rollup     : "",   // beat 7
  dcaller    : "",   // beat 8
  offline    : ""    // beat 9
};
```

Set any one to an image path or data URL and that beat renders your real screen full-bleed instead of the mock. The mocks are built to the same layout, so you can swap one, some, or all.

**Check the numbers.** These are real, from the Parkway North corpus: 117 O / 134 D snaps, 3 games, Cover 4 51%, 4-3 64%, 16% pressure, 11 cards = 70% of snaps, and the call volumes (HOUSTON 26, MEMPHIS 21, SOUTH BEND 11, OTTAWA 11).

These are **plausible placeholders I made up** — confirm or replace before this goes public:

- per-call YPP on the O Caller ranked list (+7.1 / +5.8 / +5.2)
- the family rollup table in beat 7 (YPP and EFF by family)
- the D Caller stop rates and 3x1 44% / RUN 61%
- the four live-log grades

Everything adjustable lives in the `DEMO` object and the scene arrays at the top of the file.

---

## 5. Recording it

Open with `?autoplay=1` to skip the poster overlay. Press **C** (or the *Clean mode* button) to strip the header, controls and transcript — you get the stage alone, scaling to whatever width your window is. The stage is a fixed 1000×563 canvas scaled to fit, so a 1920-wide window gives you a clean 1920×1080 capture with everything proportional.

Space = play/pause. ← / → step beats. Clicking a chip jumps to that beat.

The four blocks are already embedded as base64 and play automatically — nothing else to wire up. If you re-render any block, replace its entry in the `TRACKS` object and re-check that block's scene offsets.

---

## 6. Still open

- ~~The 2:15 companion~~ — **written.** `OFFGRD-explainer-215-companion.md`, eight blocks, 382 words, projected 2:22. Render the blocks and I'll build and time the animatic.
- ~~`index.html` poster tile~~ — **done.** The spot now sits at the top of the Coach's Week section as a 16:9 poster that plays the MP4 inline. See section 7.


---

## 7. On the site

The spot is wired into `index.html` at the top of the Coach's Week section — the trailer above the day-by-day journey, which is the detail.

Three edits, all additive:

1. **CSS** — `.wt-poster--wide` and `video.wt-frame` at 16:9, plus a `.wt-spot` wrapper. The existing 10:8.8 walkthrough frames are untouched.
2. **Markup** — one `wt-poster` button carrying `data-video` instead of `data-file`, with `posters/offgrd-explainer-poster-wide.jpg` (1600×900, logo baked, play glyph).
3. **JS** — the existing click handler gained a branch: `data-video` builds a real `<video>`; `data-file` still builds the iframe. The six interactive walkthroughs behave exactly as before.

**Why a `<video>` and not an iframe.** I originally told you to use the `wt-poster`/iframe pattern, before the MP4 existed. Now that it does, an iframe is the wrong tool: the animatic HTML is 1.26 MB with base64 audio, depends on autoplay-with-sound policy, and renders a 16:9 stage inside a 10:8.8 frame. A 5.3 MB MP4 with native controls is smaller to parse, plays everywhere, and scrubs. The button and poster pattern is preserved — only what it opens changed.

Verified on a local server: poster loads at 1600×900, click swaps in the player with no layout shift, playback starts, and the iframe path still works for the other six.

**One thing to decide.** It's placed above the journey. If you'd rather it sit in the hero, it's a matter of moving the `.wt-spot` div — say so and I'll move it.
