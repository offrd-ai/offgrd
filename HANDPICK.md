# Hand-pick frames → vision-only re-run

**Goal:** Isolate whether the 30% coverage result was a **sampler failure** (wrong frames) vs a true ceiling on this film. Same 10 PLAY#s, same model/prompt, **your** frames.

Clips are already at `clips/<PLAY#>.mp4`. Auto-sampler output (for reference) is in `out/frames/` and copied to `D:\mattb\Claude Cowork OFFGRD\exp-frames\`.

---

## What to hand-pick (per play)

Aim for **3–7** JPEGs per PLAY#:

| Slot | Must be |
|---|---|
| **F0** | Genuine **pre-snap set** — defense aligned, ball not snapped, field readable (not Hudl chrome / pause menu / dead swipe) |
| **F1…Fn-1** | Motion after snap that shows the **man vs zone tell** (corner turn+carry vs sink/pass-off). Play 11’s clean ~6s frame is the gold standard |
| **Last** | Last clean football frame before Control Center / stop-tail |

Skip Control Center, home screen, black fades, and Hudl UI-only frames.

### Suggested ffmpeg (you have clips + ffmpeg)

```bash
# example: PLAY 11 — pre-snap set @2.5s, develop @6.0s, confirm @7.5s
ffmpeg -y -ss 2.5 -i clips/11.mp4 -frames:v 1 handpicked/11/F0_t2.5.jpg
ffmpeg -y -ss 6.0 -i clips/11.mp4 -frames:v 1 handpicked/11/F1_t6.0.jpg
ffmpeg -y -ss 7.5 -i clips/11.mp4 -frames:v 1 handpicked/11/F2_t7.5.jpg
```

Or plain `F0.jpg` + optional `times.json`:

```json
{ "F0": 2.5, "F1": 6.0, "F2": 7.5 }
```

### Drop folder

```
experiments/multi-frame-coverage/handpicked/
  6/F0_t….jpg …
  7/…
  …
  99/…
```

All 10 PLAY#s: **6, 7, 9, 11, 14, 16, 18, 23, 62, 99**.

---

## Cursor re-run (vision only — no re-extract)

```bash
cd workers/auto-scout-runner
railway run -s auto-scout-runner -- npm run exp:multi-frame:vision
# or:
railway run -s auto-scout-runner -- node experiments/multi-frame-coverage/run.mjs \
  --sample experiments/multi-frame-coverage/sample.json \
  --frames-dir experiments/multi-frame-coverage/handpicked \
  --out experiments/multi-frame-coverage/out-handpicked
```

Writes `out-handpicked/results.json`. Still **zero** `upsert_cv_scheme_v1` / production F1/F2.

Hand that JSON + `handpicked/` frames back to Claude for the re-adjudication.

---

## Two sampler fixes (Cursor follow-up if hand-pick proves the lever)

If hand-picked vision clears ~60% coverage, wire these into `extractBurst.js` before any product extract:

1. **F0 gate — genuine pre-snap set, not “first non-dark pixel.”**  
   Current adaptive path often keeps `t=0` (Hudl chrome / dead lead-in). Require a football-field look (reject UI-chrome / swipe / menu) before accepting the earliest frame; prefer the first frame that looks like a set defense.

2. **Coverage-develop span — don’t thin away the man/zone tell.**  
   Static-dedupe + even thinning skipped the useful mid/post-snap window on several misses (Play 11’s tell ~6s was easy to under-weight). After F0 is locked, bias remaining slots toward **post-motion** timestamps (spread from first motion change → last clean football), and always keep at least one frame in the ~post-snap develop band when duration allows.

Until hand-pick results land: **do not** greenlight production `extract.js` wiring off the auto-sampler’s 30%.
