# OFFGRD explainer — morning ship checklist (Aug 20)

Everything below is **already done and committed to your working tree**. The only thing left is the push — nothing here needs Cursor to write code.

---

## 1. What changed overnight

**Logo close — your call, made.** You were right, and it also exposed a render bug: the close card loaded the logo from `offops.app`, which the render sandbox can't reach, so every previous MP4 silently fell back to plain text. The lockup is now embedded (base64) in both animatics, so it renders identically everywhere. Every film and cut now closes on the shield lockup at 170px, tagline, URL. The "One place" beat at 0:13 got the lockup too.

**Everything re-rendered.** Both films, all six social cuts, both squares. Verified frame-by-frame: lockup on every close, URL fully faded in, captions clear of the UI, no console errors.

**Spot moved under the hero.** New `#film` section directly below the hero on index.html — the page now goes hero → 60s film → Why programs switch. Verified on a local server: flush placement (hero bottom = film top, to the pixel), click swaps poster → playing video, the five journey walkthrough posters untouched, div/section counts balanced.

## 2. File inventory (all in the working tree, unpushed)

| File | What |
|---|---|
| `index.html` | Spot under hero + video player CSS/JS |
| `walkthroughs/OFFGRD-explainer-60s.mp4` | The site film, 60.6s, logo close — **referenced by index.html** |
| `walkthroughs/posters/offgrd-explainer-poster-wide.jpg` | Its poster — **referenced by index.html** |
| `walkthroughs/OFFGRD-explainer-60s-square.mp4` | Captioned square of the full 60 (feed) |
| `walkthroughs/OFFGRD-explainer-215.mp4` + `-square` | The 2:34 sales cut |
| `walkthroughs/social/OFFGRD-cut-offline-09[-square].mp4` | :09 wifi cut |
| `walkthroughs/social/OFFGRD-cut-scoutcards-19[-square].mp4` | :19 scout-cards cut |
| `walkthroughs/social/OFFGRD-cut-friday-23[-square].mp4` | :23 Friday-night cut |
| `walkthroughs/OFFGRD-explainer-60s.srt` | Subtitle upload for platforms |
| `walkthroughs/offgrd-explainer[-215].html` | Animatic sources, lockup embedded |
| `walkthroughs/posters/offgrd-explainer-poster.jpg` | 1000×880 tile (spare, unreferenced) |
| Docs: `OFFGRD-explainer-VO.md`, `OFFGRD-explainer-215-companion.md`, `OFFGRD-elevenlabs-script.txt`, `OFFGRD-215-elevenlabs-SIX-CLIPS.txt`, `OFFGRD-ship-checklist.md` | Reference |

## 3. Cursor terminal — run from Windows, in d:\mattb\_offgrd-git

No code changes needed. No asset pin (index.html isn't SW-precached and no pinned JS changed — script tags still ?v=307).

```
git status
```
Expect: modified `index.html`; new files under `walkthroughs\` and `walkthroughs\social\`; docs in root. If you see ~141 CRLF-modified files you're in the Linux VM — switch to Windows.

```
git add index.html walkthroughs OFFGRD-explainer-VO.md OFFGRD-explainer-215-companion.md OFFGRD-elevenlabs-script.txt OFFGRD-215-elevenlabs-SIX-CLIPS.txt OFFGRD-ship-checklist.md

git commit -m "Explainer films: 60s spot under hero + 2:34 sales cut + social cut-downs (logo close, captions)"

git push origin main
```

~37 MB of MP4s in this commit — fine for Vercel static hosting; flagged before, accepted for speed.

## 4. Field-verify after deploy (2 minutes)

1. odkops.com — film section sits directly under the hero; poster is the lockup card.
2. Click it: video plays **with sound** on desktop; on iPhone it plays inline (playsinline is set).
3. Let it run to the end: close = shield lockup + "Never off guard." + getoffrd.com/gameday, URL fully visible.
4. Scroll the Coach's Week section: the five walkthrough posters still open as interactive players.
5. Hosted sales link now exists: `https://odkops.com/walkthroughs/OFFGRD-explainer-215.mp4` — this is what you text/email a coach.

## 5. Post wherever you're posting (assets → captions)

- Feed post: `OFFGRD-cut-offline-09-square.mp4` + Option B caption from our thread ("When the press box wifi dies…"). First comment: the hashtag block.
- The :19 and :23 squares are the follow-ups this week.
- Full 60 square for the pinned/profile post. SRT included if the platform takes uploads.

## 6. Still open (your side)

- **Real screenshots.** Films still show the mock UI. Send screens of Scout cards, O Caller, the rollup, D Caller, and O Caller offline → they drop into the SHOTS map and I re-render everything in one pass. Do this before putting money behind it.
- **X Ads** per OFFGRD-paid-ads-plan.md — the :09/:19/:23 squares are the creative it was waiting on.
- The 60s "It already knows the down, the distance, the field zone" line — kept, defensible mid-game; say the word if you want it re-cut like Block 3.
