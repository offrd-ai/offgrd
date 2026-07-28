# OFFOPS Design Partner Kit — coach calls, week of July 27

**Goal:** 2–4 programs committed before camp. **Camp starts in ~3 weeks. Week 1 in ~4–5.** After that, tooling decisions are frozen until next spring.

**The ask is deliberately small.** Not "replace your system." **One position group, one season, free, and we do the setup.** A small ask in late July converts; a big one gets "let's talk in the spring."

---

## 1. The pitch in one line

> **"Every platform tells you who *completed* the install. We tell you which kid is failing what, drill it, and prove the number moved."**

That's the whole thing. Don't lead with time savings — that's the crowded lane and the competition owns it. Lead with the thing nobody else can say: **proof that practice worked.**

### The 30-second version (text / DM)

> Coach — built something I want to put in front of you before camp. It watches your position-group reps and tells you the exact thing a kid is failing — like "Test DB2 is 0-for-8 on depth vs Cover 1" — then puts that drill in your practice script, forces it into next week's test, and shows you whether the number actually moved.
>
> Not asking you to switch anything. One position group, free this season, and I do the setup. 15 minutes to show you?

### The three-sentence version (phone)

> You know how you install all week, and you find out Friday night who actually knew it? We fix the "find out Friday" part. The system tells you Tuesday which kid is failing which specific thing — not a quiz score, the actual cell, like depth versus Cover 1 — drills it, re-tests it next week, and shows you the before-and-after.

---

## 2. Who to call — and who to skip

**Target (in priority order)**

1. **A coach who trusts you already.** Relationship beats fit right now. We need honest weekly feedback more than a perfect ICP match.
2. **A defensive coordinator or secondary coach.** Our loop is deepest and most proven on **defensive alignment** — relationship, leverage, depth. That's where the demo is undeniable.
3. **A detail guy.** The coach who says "we lost that game on assignments" is our buyer. The one who says "we just need to be more physical" is not.
4. **A program where the head coach decides.** No procurement, no committee, no AD sign-off cycle. We don't have the weeks.
5. **Small-to-mid roster.** 30–60 kids. Big enough to matter, small enough that setup is fast.

**Skip for this first cohort**

- Anyone deep into SpiralXO or a full Hudl-centric workflow — we'd be fighting a switch instead of proving a loop.
- Anyone who wants **offense-only** today. Our strongest, proven surface is defensive alignment; leading with offense puts our weakest foot forward.
- Anyone who needs Hudl integration as a precondition. Be upfront and revisit in the offseason.
- Anyone who needs a contract, a PO, or a district review. Too slow for camp.
- A program with no structured position-group reps happening at all — the loop needs reps to eat.

> **A bad design partner costs more than no design partner.** Four honest, engaged coaches beat ten logos who never log in.

---

## 3. Pre-flight — do this 30 minutes before every demo

The product has rough edges I hit personally this month. Do not discover them live.

- [ ] **Sign in ahead of time** on the exact device/browser you'll demo from, on `getoffrd.com`. Do not sign in during the call — auth across origins can bounce.
- [ ] **Do not switch teams/seasons mid-demo.** The dashboard can resolve a different team than the switcher shows. Pick the team before you start and leave it.
- [ ] **Confirm the DB card has data** — Daily Focus → DB shows the scheme line and a named individual. If it's empty, the demo has no punch.
- [ ] **Have the Focus Impact card in a good state** (a tracked cell showing a delta or "awaiting"). If nothing is tracked, emphasize a cell yourself the day before so there's history.
- [ ] **Charge the phone, and have the mobile view ready** — coaches will ask "what does this look like on my phone."
- [ ] Close every other tab. No Vercel URLs, no staging aliases, no console.

**If something breaks live:** say "that's a bug, I'll have it fixed this week" and move on. Do not debug in front of a coach. Being unflappable about a rough edge in a pre-launch product reads as honest; fumbling reads as fragile.

---

## 4. The 12-minute demo script

The whole demo builds to **one moment**: the re-test delta. Everything before it is setup; everything after is logistics.

### (1) The problem — 60 seconds. No screen.

> "Walk me through your week. You install Monday and Tuesday, walk through Wednesday, and Friday you find out who actually had it. Every mental error on Friday was knowable on Wednesday — you just had no way to see it. Agreed?"

Let him talk. **He will tell you his exact pain.** Use his words for the rest of the call.

### (2) The diagnosis — 2 minutes. Dashboard → Daily Focus → DB.

Show the DB card. Read it out loud, because the specificity is the product:

> *"DB: Gap is align — depth 37% · leverage 43% · relationship 60%."*
> *"Depth drag concentrated on **Cover 1 (7/21)** — and that's 12% of what this opponent shows."*
> *"**Test DB 2**: align 13.3% versus a group average of 47% — **depth breaks down on Cover 1, 0 for 8.**"*

Then the line that lands:

> "That's not a quiz score. That's: pull this kid, drill Cover 1 depth. Every other platform would tell you he scored 62% on the install."

### (3) The action — 90 seconds.

Point at **Practice Emphasis** — *"Cover 1 — Press-bail depth: pedal to your landmark, then drive on the dig."*

> "That drill is generated from the deficiency, in your terms, and it's editable — if you'd say it differently, you type it and it learns your language."

Then **Add to practice** (it lands in this week's script) and **Emphasize next test**.

> "That flag means next week's test automatically gets at least six reps of *Cover 1 depth* for the DBs. I don't have to remember. The system re-tests the thing he failed."

*(Note: the action buttons are hidden on gameday — that's intentional cadence gating. If they're not showing, you're in a post-game slot. Mention it as a design choice: "we don't put practice actions in front of you on gameday.")*

### (4) **The moment** — 90 seconds. Focus Impact.

> *"DB · align · Cover 1 leverage — **2/7 → 5/9**."*

Stop talking for a second. Then:

> "That's the whole product. He was 2-for-7. We drilled it, re-tested it, he's 5-for-9. **That's proof your practice time worked.** Nobody else in this space will show you that number, because nobody else measures at that level."

If the delta is still `awaiting re-test`, use it anyway — it's honest and it shows the mechanism:

> "This one's flagged and waiting on next week's reps. That's what it looks like the day you flag it."

### (5) The player side — 60 seconds.

Show the player view on a phone: assignment, the rep, their own improvement. Then:

> "And your kids get a recruiting profile out of the same data — readiness scores, exposure to college coaches. So the kid has a reason to open it that isn't 'coach told me to.'"

That's the retention hook and it's a genuine advantage — the competition's parent portal is a calendar and one-way messages.

### (6) The offer + what I need — 2 minutes. See §6, §7.

### (7) Questions — the rest.

**What NOT to demo:** anything half-built, the film features, the recruiting CRM in depth (unless he asks), or a second position group. **One group, one loop, one number.** Every extra thing you show dilutes the moment.

---

## 5. Objections — honest answers only

Coaches can smell a dodge, and every one of these gets fact-checked in five minutes.

**"Do you integrate with Hudl?"**
> "Not yet — CSV import today, and a real integration is my offseason project. I'm not going to tell you otherwise. But here's the thing: this loop doesn't run off film. It runs off reps the system generates and grades. Your Hudl workflow stays exactly where it is."

**"Who else is using it?"**
> "You'd be one of the first — that's exactly why it's free and why I do the setup myself. I'd rather have four coaches who'll tell me the truth than forty logos. If it hasn't moved a number by Week 4, you walk and I've learned something."

**"What does it cost?"**
> "Free for you this season as a design partner. After that it's $1,497 for the gameday and player-development side, $1,997 with recruiting. But this year I'm buying feedback, not revenue."

**"I don't have time to learn a new system during camp."**
> "That's why the ask is one position group and 15 minutes a week from you. I do the setup — roster, your defense, your terminology. You look at one card on Tuesday."

**"My kids won't use it."**
> "Five minutes on their phone, and they see their own number move. Plus their recruiting profile lives in the same place. If they don't use it, that's a real finding and I want to know that too."

**"Is this just quizzes?"**
> "Opposite. We run *your* defense — your coverages, your fronts, motion adjustments — and grade where the kid lines up on relationship, leverage, and depth separately. A quiz gives you 78%. This gives you 'he's 0-for-8 on depth vs Cover 1.'"

**"What if I want to run it for offense too?"**
> "We can, but I'd start you on defense — that's where it's sharpest today. Get one group working, then expand."

**"What happens to my data if this doesn't work out?"**
> "It's yours, you get an export, and there's no contract to get out of."

---

## 6. The design partner offer

**They get**

- **Free for the entire 2026 season.** No card, no contract.
- **Concierge setup — I do it.** Roster, defensive system, terminology. Live in under 48 hours.
- **A direct line to me.** Bugs get fixed in days, not quarters.
- **Input on the roadmap.** What they ask for gets built first.
- **Their players get recruiting profiles** at no cost.
- **Renewal at the founding rate**, locked, if they continue.

**We get**

- **20 minutes a week.** A standing call — what worked, what broke, what's missing.
- **Permission to use their program name and logo** once they're comfortable.
- **A testimonial after Week 4** — *only if it's actually working.* Never ask for one before there's a number.
- **Honest failure reporting.** "My kids didn't open it" is more valuable than politeness.

**Explicitly not asked for:** exclusivity, a case study before results, or dropping any tool they already use.

> **Why free:** proof is worth more than $6k right now. Four programs with week-over-week deltas become the marketing that closes the next forty.

---

## 7. Onboarding checklist — what to collect on the call

Get these while you have him. Every one you leave for later is a week of drift.

- [ ] **Roster** — names, positions, grad year. CSV, spreadsheet, or a photo of the depth chart; we'll type it.
- [ ] **Base defense** — front(s) and coverages they actually run. *15 minutes on a call, or we install a starter 4-3/Cover 1-3 and he edits it.*
- [ ] **Terminology** — what he calls his coverages. Use *his* words in the system, not ours.
- [ ] **Position group to start** — recommend DBs.
- [ ] **Point of contact** — one coach, name and cell.
- [ ] **How players get the link** — team GroupMe, Remind, email, printed?
- [ ] **Week 1 opponent** (optional — enables opponent-scoped focus).
- [ ] **The standing weekly call** — put it on the calendar *before you hang up*. Day and time.

**Target: live within 48 hours of the call.** The competition promises 24 hours with a team behind them; we can beat that on effort with four programs.

---

## 8. Follow-up cadence

| When | What |
|---|---|
| Same day | Thank-you text + the onboarding checklist items you still need |
| Within 48h | **They're live.** Send a 60-second screen recording of *their* roster in *their* system |
| Day 3 | Confirm players have the link; check that reps are landing |
| Weekly (standing) | 20-min call. Open with the Focus Impact card — *their* numbers, not a feature update |
| Week 4 | If a number moved: ask for the testimonial and logo. If not: ask what's broken and fix it |
| Week 8 | Decide together whether to expand to a second position group |

**The weekly call is the product.** Open every one with their delta. That habit is what turns a design partner into an advocate.

---

## 9. Track it — one row per program

| Program | Coach + cell | Called | Demo'd | Committed | Live | Group | Weekly call | Wk-4 delta | Testimonial |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

Also track, because these are our real metrics this fall:

- **TTFR** — time from account created to first graded rep (target: < 2 minutes once Phase 0 ships; today it's manual).
- **Weekly active coaches** — did he open the card on Tuesday?
- **Reps completed per player per week.**
- **Cells emphasized → cells improved.** This is the number that becomes our marketing.

---

## 10. Say this / don't say this

**Say**
- "Which kid is failing what — and proof it got fixed."
- "One position group. Free. I do the setup."
- "Depth versus Cover 1, 0 for 8." *(specificity is the product)*
- "I'd rather have four coaches who tell me the truth."
- "Your Hudl workflow doesn't change."

**Don't say**
- "We replace all your tools." — Not true today, and it's the competition's line.
- "We integrate with Hudl." — Gets checked immediately.
- "It's easier to use than what you have." — Not defensible yet. Earn it.
- "AI-powered anything." — Coaches are numb to it, and it's a crowded claim.
- Any promise with a date you haven't confirmed with me first.

---

### One last thing

The temptation on these calls will be to show everything — the recruiting CRM, the playbook designer, the film work, the gameday module. **Resist it.** You have one thing nobody else in the market has, and it fits on a single card: *he was 2-for-7, we drilled it, now he's 5-for-9.*

Show that. Shut up. Let him ask the next question.
