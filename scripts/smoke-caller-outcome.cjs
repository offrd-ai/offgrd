/**
 * Outcome model — buckets, flags, concept derivation, suggester learning.
 *   node scripts/smoke-caller-outcome.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");

function load(name) {
  const src = fs.readFileSync(path.join(ROOT, name), "utf8");
  const sandbox = {
    localStorage: {
      _m: {},
      getItem(k) {
        return this._m[k] || null;
      },
      setItem(k, v) {
        this._m[k] = String(v);
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(src, sandbox);
  return sandbox;
}

const box = load("OFFGRD-caller-outcome.js");
const O = box.OFFGRD_CALLER_OUTCOME;
if (!O) throw new Error("OFFGRD_CALLER_OUTCOME missing");

/* 1) One-tap result → success from isSuccessVal */
const solid1 = O.finalizeOutcome({ result: "solid" }, { dn: 1, db: "10+" });
/* gain 6 vs need 12*0.5=6 → success */
if (solid1.success !== 1) throw new Error("1st&10 solid should succeed, got " + solid1.success);
if (solid1.concept !== "worked") throw new Error("clean success → worked");

const short1 = O.finalizeOutcome({ result: "short" }, { dn: 1, db: "10+" });
/* gain 2 < 6 → fail */
if (short1.success !== 0) throw new Error("1st&10 short should fail");
if (short1.concept !== "didnt_work") throw new Error("plain fail → didnt_work");

/* 2) Drop on failure → concept worked (execution) */
const drop = O.finalizeOutcome({ result: "no_gain", flag: "drop" }, { dn: 1, db: "10+" });
if (drop.success !== 0) throw new Error("drop still fails yards");
if (drop.concept !== "worked") throw new Error("drop → concept worked");
if (O.learningSuccess(drop) !== 1) throw new Error("drop must not down-rank suggester");

/* 3) Penalty on us + explosive → negated, worked_untested */
const penUs = O.finalizeOutcome({ result: "explosive", flag: "pen_us" }, { dn: 1, db: "10+" });
if (!penUs.negated) throw new Error("pen_us must negate");
if (penUs.concept !== "worked_untested") throw new Error("want worked_untested got " + penUs.concept);
if (O.learningSuccess(penUs) !== 1) throw new Error("untested still resurfaces positive");

/* 4) Stuffed + pen on them → negated, didnt_work */
const penThem = O.finalizeOutcome({ result: "no_gain", flag: "pen_them" }, { dn: 3, db: "4-6" });
if (!penThem.negated) throw new Error("pen_them must negate");
if (penThem.concept !== "didnt_work") throw new Error("stuffed+def pen → didnt_work");

/* 5) Coverage took it */
const cov = O.finalizeOutcome({ result: "short", flag: "coverage" }, { dn: 2, db: "7-9" });
if (cov.concept !== "didnt_work") throw new Error("coverage → didnt_work");

/* 6) Ungraded null */
const ung = O.finalizeOutcome({ result: null }, { dn: 1, db: "10+" });
if (ung.success != null || ung.concept != null) throw new Error("ungraded must be null");
if (O.learningSuccess(ung) != null) throw new Error("ungraded moves nothing");

/* 7) Legacy hit/miss */
const hit = O.finalizeOutcome({ result: "hit" }, { dn: 1, db: "10+" });
if (hit.success !== 1 || hit.concept !== "worked") throw new Error("legacy hit");

/* 8) Fold carries derived fields */
const logSrc = fs.readFileSync(path.join(ROOT, "OFFGRD-caller-log.js"), "utf8");
vm.runInNewContext(logSrc, box);
const C = box.OFFGRD_CALLER;
function ev(partial) {
  return Object.assign(
    {
      eventId: C.uuid(),
      gameId: "g1",
      playIndex: 0,
      type: "call",
      payload: { play: "HOUSTON", dn: 1, db: "10+", hash: "L", zone: "ANY" },
      deviceId: "devA",
      actorId: "a",
      clientTs: 1000,
      seq: 1,
      superseded: false,
    },
    partial
  );
}
const folded = C.foldCallerEvents([
  ev({ eventId: "c1", playIndex: 0 }),
  ev({
    eventId: "o1",
    type: "outcome",
    playIndex: 0,
    payload: { result: "no_gain", flag: "drop" },
    clientTs: 1100,
    seq: 2,
  }),
  ev({ eventId: "c2", playIndex: 1, payload: { play: "MESH", dn: 1, db: "10+" }, clientTs: 2000 }),
]);
if (folded.log.length !== 2) throw new Error("fold len " + folded.log.length);
if (folded.log[0].concept !== "worked" || folded.log[0].flag !== "drop") {
  throw new Error("fold drop concept " + JSON.stringify(folded.log[0]));
}
if (folded.log[1].result != null) throw new Error("ungraded must stay null");
const pending = O.pendingEntries(folded.log);
if (pending.length !== 1 || pending[0].play !== "MESH") throw new Error("pending queue wrong");
const rates = O.liveRates(folded.log);
if (rates.pending !== 1) throw new Error("rates.pending");
if (rates.successRate !== 1) throw new Error("drop counts as concept success in rate");

/* 9) Infer next situation */
const adv = O.inferNextSituation(
  { dn: 1, db: "10+", hash: "L", zone: "ANY" },
  O.finalizeOutcome({ result: "explosive" }, { dn: 1, db: "10+" })
);
/* explosive 18 on 1st&10 → first down */
if (!adv.inferred || adv.dn !== 1 || adv.db !== "10+") {
  throw new Error("explosive on 1st&10 should first-down infer " + JSON.stringify(adv));
}
const advSolid = O.inferNextSituation(
  { dn: 1, db: "10+", hash: "L", zone: "ANY" },
  O.finalizeOutcome({ result: "solid" }, { dn: 1, db: "10+" })
);
/* solid gain 6 → 2nd & 6 → db 4-6 */
if (!advSolid.inferred || advSolid.dn !== 2 || advSolid.db !== "4-6") {
  throw new Error("solid advance want 2nd&4-6 got " + JSON.stringify(advSolid));
}
const adv2 = O.inferNextSituation(
  { dn: 1, db: "10+", hash: "L", zone: "ANY" },
  O.finalizeOutcome({ result: "short" }, { dn: 1, db: "10+" })
);
/* short gain 2 → 2nd & 10 → db 10+ */
if (!adv2.inferred || adv2.dn !== 2 || adv2.db !== "10+") {
  throw new Error("short advance want 2nd&10+ got " + JSON.stringify(adv2));
}
const noPen = O.inferNextSituation(
  { dn: 1, db: "10+" },
  O.finalizeOutcome({ result: "explosive", flag: "pen_us" }, { dn: 1, db: "10+" })
);
if (!noPen.needsInput || noPen.inferred) throw new Error("penalty must not infer");
const noTo = O.inferNextSituation(
  { dn: 2, db: "4-6" },
  O.finalizeOutcome({ result: "turnover" }, { dn: 2, db: "4-6" })
);
if (!noTo.needsInput) throw new Error("turnover must need input");

console.log("OK caller outcome model + fold + pending + learning + infer");
