# Teardown — FootballU (footballu.com) vs OFFGRD
*Researched 2026-08-06 · live site, free whiteboard, App Store listing (v1.3.6), pricing page*

## Who they are

FootballU LLC (Dallas, TX). Tagline: "Virtual Reps, Real Results — Gamify your Playbook!" All-in-one for playbooks, quiz reps, scout cards, and team communication. Web + iOS + Android. Claims 100+ teams (HS-heavy: Cedar Valley UT, Frisco Memorial TX, Bishop Kelly ID, plus Purdue Northwest). App Store 4.5★ from only 13 ratings — early, small, but shipping fast (20+ releases since Jul 2024; team feed, chat, tablet support, "Ball" feature all landed within the last year).

**Pricing (7-day free trial on all):** Individual (3 users) $12/mo · $95/yr. Small Team (30 users) $40/mo · $400/yr. Unlimited team $70/mo · $700/yr (adds team messaging + performance tracking). Collegiate/Pro: contact. Separate Tackle and Flag tracks.

## Their playbook interface (observed live)

The whiteboard is their front door — free, **no sign-up required**, one click from the nav. That matters more than the tool itself: a coach is drawing a play within 10 seconds of landing.

Observed mechanics: full-length scrollable field canvas (their branding painted on it), players as position-lettered discs (Q, H, F…), offense and defense both on-field with **Hide Offense / Hide Defense** toggles. **Left-click a player → assign custom routes; right-click → assign motion.** A situation strip sits top-right (1st & 10, field position ↑40) even in the whiteboard. Zoom in/out, field flip, an **"Enable ball"** toggle (their newer ball-tracking feature for players), settings for player size/field type, fullscreen, and **export bottom-right to download/print**. Marketing claim: "mix and match any formation to any play call, motion, or tag and visualize against any defense."

Honest read: it's a clean drawing tool, mobile-first ("best diagram tool on mobile" per a review), but from what's public it's **draw-and-view, not simulate**. Nothing suggests OFFGRD-level animation (motion fires, snap, routes and coverage drops moving in time), auto-derived reads, OL protections, or tagging that feeds a prediction engine. Their play is a picture; your play is data.

## Their gamification (the part worth studying)

This is their entire identity, and the loop is simple:

1. **Installs** — coach assigns a set of plays to players to learn on their own time.
2. **Practice quizzes** — a list of plays, each customized with hash, D&D, field position, calls for both sides; assigned to players *or exported as scout cards*.
3. **Virtual Reps** — the signature mechanic: player picks their position, then **touches the field and drags their own position through the play** "like a video game," with instant feedback. Kinesthetic, not multiple-choice.
4. **Score surface** — the player home screen shows **points earned, reps completed, views, and % of reps correct**. Coach side gets team-wide views/reps/progress tracking.

Their best marketing line is a question: *"Do your kids know your playbook?"* — same nerve OFFGRD's Reps Lab hits.

## Where OFFGRD is already ahead

Everything around the rep. FootballU has no opponent intelligence — no breakdown import, no tendencies, no prediction, no callers, no in-game anything, no flywheel from game tags to practice focus, no recruiting, and no offline story (they require connectivity; you cold-boot in airplane mode). Their quizzes test "do you know our play"; Reps Lab tests **reads, coverage ID, and routes against defenses** — football understanding, not memorization — and scores land by player/position in a system that then re-weights the week. They gamified a playbook; you built a program engine. Also: scout cards, their headline time-saver, you already ship.

## What to steal (ranked)

1. **The score surface — cheapest, highest leverage.** Reps Lab already grades everything; it just doesn't *celebrate* anything. Add a player-facing card: points, weekly rep count, % correct, streak (days in a row with reps). The data exists — this is UI. Streaks especially: a kid protecting a 9-day streak on the bus is exactly the behavior coaches want and the thing FootballU's players rave about ("at-home reps with instant feedback").
2. **Position-group leaderboard on the coach's Results board — and in the locker room.** "WRs 94% on route quizzes, DBs 71% on Cover-ID" is coach-actionable *and* competitive fuel. Weekly top-5 reps leaderboard, resettable, position-normalized so linemen aren't buried. Ties straight into your test-all-week/dial-the-plan story — gamification isn't a bolt-on for you, it's fuel for the flywheel.
3. **Drag-through-the-play rep mode.** Their one genuinely novel interaction: the player *moves his own dot* through his assignment instead of answering a question. You have animated plays with real route data — a "walk your assignment" mode (drag your position; score = path match against the drawn route/fit) is buildable on the existing renderer and would leapfrog their version because yours can grade against coverage-specific adjustments.
4. **Free whiteboard as the front door.** Their no-signup whiteboard is a lead magnet you can beat: a stripped OFFGRD play-drawer at odkops.com/draw that *animates* the play (theirs doesn't) with one button — "Save this play → create your free program." Also blunts their "try it free instantly" advantage over your sign-up-first flow.
5. **Install assignments with due dates.** "Install 2 assigned — due Thursday" with completion tracking. You have the plays and tests; you lack the explicit homework wrapper coaches recognize.

## What to skip

Team chat/announcements/schedules — commodity; every program already lives in GroupMe/Remind, and it drags you toward moderating minors' chat (real liability surface). "AI Speech" — gimmick until proven. Their situation-tagging on quizzes — you already do this deeper via real breakdown data.

## Positioning line against them

If FootballU comes up in a conversation: *"FootballU gamifies learning your own playbook — and does it well. OFFGRD does that too (graded reads, coverage-ID, and route tests, scored to the roster), and then aims the whole week at an opponent: their tendencies predicted, your practice focused by test scores, both sides called on Friday with live AI — all offline. They stop at 'do your kids know the playbook.' We start there."*

And on price: they're $700/yr for unlimited; you're free-while-beta with founding-program perks. Worth saying out loud to fence-sitting coaches.

## Suggested next moves

Near-term (this season): score surface + streaks on Reps Lab; position-group boards on Results. Mid-term: drag-through rep mode on the shared renderer; install assignments. Marketing: free animated whiteboard funnel; add a "Do your kids actually know football?" angle to content — one level above their question.

Sources: [footballu.com](https://footballu.com/) · [FootballU on the App Store](https://apps.apple.com/us/app/footballu/id6505048744) · live whiteboard session 2026-08-06
