/**
 * Follow-up G — auth-free placement integration.
 *
 * Proves the open assertion the live staging SSO pass couldn't reach:
 *   startTest floor-fill places ≥ min_reps Cover-1 align reps from def_aligns
 *   (ok branch), not OL Slam ol.coverage (short / regression).
 *
 * Run:  node scripts/smoke-focus4d-upweight-place.cjs
 *
 * No browser, no auth, no network. Loads real OFFGRD-week-autotest +
 * OFFGRD-align-key; mirrors pickAlignRep pool resolution from OFFGRD-QB.html
 * (isExplicitAlignCall + weekAlignCallForScheme) and the startTest floor-fill.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

// Real autotest helpers (normalizeSchemeKey, cellEmphasisFromSpec, …)
require(path.join(root, "OFFGRD-week-autotest.js"));
const AT = globalThis.OFFGRD_WEEK_AUTOTEST;
if (!AT || !AT.normalizeSchemeKey) {
  throw new Error("OFFGRD_WEEK_AUTOTEST failed to load");
}
const AK = require(path.join(root, "OFFGRD-align-key.js"));

const qbSrc = fs.readFileSync(path.join(root, "OFFGRD-QB.html"), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("✓ " + msg);
}

/* ── Source parity: helpers in this smoke must match QB.html ─────────────── */
assert(/function isExplicitAlignCall/.test(qbSrc), "QB defines isExplicitAlignCall");
assert(/function weekAlignCallForScheme/.test(qbSrc), "QB defines weekAlignCallForScheme");
assert(/if\(!isExplicitAlignCall\(call\)\) return false/.test(qbSrc), "strictScheme filter skips OL-only");
assert(/weekAlignCallForScheme\(opts\.preferScheme\)/.test(qbSrc), "strictScheme falls back to def_aligns");

/**
 * Mirror OFFGRD-QB.html isExplicitAlignCall — OL ol.coverage alone is NOT enough.
 */
function isExplicitAlignCall(call) {
  if (!call) return false;
  if (call._defCall && call._defCall.coverage != null && String(call._defCall.coverage).trim()) return true;
  if (call.coverage != null && String(call.coverage).trim()) return true;
  return false;
}

/**
 * Mirror weekAlignCallForScheme — build a def_call shell from WEEKDEF/WEEKCOVS.
 * (defCallToPlay shape: top-level coverage + _defCall.)
 */
function weekAlignCallForScheme(schemeValue, ctx) {
  const preferKey = AT.normalizeSchemeKey(schemeValue);
  if (!preferKey) return null;
  let covLabel = null;
  const consider = function (label) {
    if (!label || covLabel) return;
    if (AT.normalizeSchemeKey(label) === preferKey) covLabel = String(label).trim();
  };
  Object.keys(ctx.WEEKDEF || {}).forEach(consider);
  (ctx.WEEKCOVS || []).forEach(function (c) {
    consider(typeof c === "string" ? c : c && (c.k || c.coverage));
  });
  if (ctx.WEEKPLAN && ctx.WEEKPLAN.def_aligns) {
    Object.keys(ctx.WEEKPLAN.def_aligns).forEach(consider);
  }
  if (!covLabel) {
    if (/^cover [0-6]$/.test(preferKey)) covLabel = "Cover " + preferKey.slice(-1);
    else if (preferKey === "tampa 2") covLabel = "Tampa 2";
  }
  if (!covLabel) return null;
  const authored =
    Object.keys(ctx.WEEKDEF || {}).some(function (k) {
      return AT.normalizeSchemeKey(k) === preferKey;
    }) ||
    (ctx.WEEKCOVS || []).some(function (c) {
      const label = typeof c === "string" ? c : c && (c.k || c.coverage);
      return AT.normalizeSchemeKey(label) === preferKey;
    });
  if (!authored) return null;
  const base = (ctx.weekDefCalls || [])[0] || {};
  const front = base.front || "4-3";
  const raw = {
    id: "week-align-" + preferKey.replace(/\s+/g, "-"),
    name: front + " " + covLabel,
    front: front,
    coverage: covLabel,
    defs: [],
    stunt: {},
    assigns: {},
    v: 2,
  };
  return {
    id: raw.id,
    name: raw.name,
    state: { front: raw.front, defs: [], players: [] },
    ol: { stunt: {}, assigns: {}, coverage: covLabel },
    coverage: covLabel,
    _defCall: raw,
    _fromDefAligns: true,
  };
}

/**
 * Mirror pickAlignRep's call-pool resolution (the seam that produced 0/6).
 * Returns { callPool, source } where source ∈ matched|def_aligns|full|empty.
 */
function resolveAlignCallPool(BLITZCALLS, opts, ctx) {
  opts = opts || {};
  const preferKey = opts.preferScheme ? AT.normalizeSchemeKey(opts.preferScheme) : "";
  let callPool = (BLITZCALLS || []).slice();
  let source = "full";
  if (preferKey) {
    const matched = (BLITZCALLS || []).filter(function (call) {
      if (!isExplicitAlignCall(call)) return false;
      const cov = AK.resolveCallCoverage(call);
      if (!cov.ok) return false;
      return AT.normalizeSchemeKey(cov.coverage) === preferKey;
    });
    if (matched.length) {
      callPool = matched;
      source = "matched";
    } else if (opts.strictScheme) {
      const fromWeek = weekAlignCallForScheme(opts.preferScheme, ctx);
      if (fromWeek) {
        callPool = [fromWeek];
        source = "def_aligns";
      } else {
        return { callPool: [], source: "empty" };
      }
    }
  }
  if (!callPool.length) return { callPool: [], source: "empty" };
  return { callPool: callPool, source: source };
}

/** Deterministic stub: succeeds iff resolveAlignCallPool is non-empty + looks exist. */
function makePickAlignRep(env) {
  let tick = 0;
  return function pickAlignRep(_positions, opts) {
    opts = opts || {};
    if (!(env.OPPLOOKS && env.OPPLOOKS.length)) return null;
    const resolved = resolveAlignCallPool(env.BLITZCALLS, opts, env.ctx);
    if (!resolved.callPool.length) return null;
    const call = resolved.callPool[tick++ % resolved.callPool.length];
    const cov = AK.resolveCallCoverage(call);
    if (!cov.ok) return null;
    const defCall =
      call._defCall ||
      ({
        id: call.id,
        name: call.name,
        front: call.front || (call.state && call.state.front) || "4-3",
        coverage: cov.coverage,
        defs: (call.state && call.state.defs) || [],
      });
    return {
      align: true,
      coverageName: cov.coverage,
      _defCall: defCall,
      targetAlign: {
        relationship: "over #1",
        leverage: "outside",
        depth: "off",
      },
      play: { _defCall: defCall, state: { defs: defCall.defs || [{ group: "DB", x: 200, y: 200 }] } },
      _reviewRep: !!opts.review,
      _poolSource: resolved.source,
      _callId: call.id,
      _fromDefAligns: !!call._fromDefAligns,
    };
  };
}

/**
 * Mirror startTest align floor-fill + random remainder (OFFGRD-QB.html).
 * Captures ok/short branch without console spies.
 */
function runAlignUpweightFill(env) {
  const n = env.n || 10;
  const positions = env.positions || ["DB"];
  const pickAlignRep = makePickAlignRep(env);
  const queue = [];
  const branches = [];
  const cells = AT.cellEmphasisFromSpec(positions, env.week && env.week.test_spec);
  const installed = AT.installedSchemeKeys(env.week || null);

  for (let ci = 0; ci < (cells || []).length && queue.length < n; ci++) {
    const cell = cells[ci];
    if (!cell || cell.kind !== "align" || !cell.scheme_key) continue;
    const floor = Math.min(cell.min_reps || 6, n);
    const inPlan = !!installed[cell.scheme_key];
    const asReview = !inPlan;
    let have = queue.filter(function (r) {
      return AT.alignRepMatchesCell(r, cell);
    }).length;
    let guard = 0;
    while (have < floor && queue.length < n && guard < floor * 12) {
      guard++;
      const r = pickAlignRep(positions, {
        preferScheme: cell.scheme_value,
        strictScheme: true,
        review: asReview,
        focusCell: cell,
      });
      if (!r) break;
      queue.push(r);
      have++;
    }
    branches.push({
      cell: cell,
      have: have,
      floor: floor,
      ok: have >= floor,
      asReview: asReview,
      message:
        (have >= floor ? "ok" : "short") +
        ": " +
        cell.scheme_value +
        " " +
        (cell.dimension || "") +
        " got " +
        have +
        "/" +
        floor +
        (asReview ? " (review)" : ""),
    });
  }

  for (let k = 0; k < n * 8 && queue.length < n; k++) {
    const r = pickAlignRep(positions);
    if (r) queue.push(r);
  }

  // Same underivable filter as startTest
  const filtered = queue.filter(function (r) {
    return r && r.targetAlign && r.targetAlign.relationship && r.play && r.play._defCall;
  });

  return { queue: filtered, branches: branches, cells: cells, installed: installed, n: n };
}

/* ── Fixtures ───────────────────────────────────────────────────────────── */

function tampaCall() {
  const raw = {
    id: "dc-tampa",
    name: "4-3 Tampa 2",
    front: "4-3",
    coverage: "Tampa 2",
    defs: [{ group: "DB", lab: "F", x: 170, y: 300 }],
    v: 2,
  };
  return {
    id: raw.id,
    name: raw.name,
    coverage: raw.coverage,
    front: raw.front,
    state: { front: raw.front, defs: raw.defs, players: [] },
    ol: { coverage: raw.coverage, stunt: {} },
    _defCall: raw,
  };
}

/** OL Slam — ol.coverage Cover 1 only (the false positive that caused 0/6). */
function slamOlOnly() {
  return {
    id: "d0184b1b-slam",
    name: "Slam",
    state: {
      front: "4-3",
      defs: [{ group: "DL", lab: "E", x: 400, y: 360 }],
      players: [{ type: "ol", lab: "C", x: 500, y: 380 }],
    },
    ol: {
      coverage: "Cover 1",
      front: "4-3",
      stunt: { 0: [{ x: 1, y: 2 }] },
    },
    // intentionally NO top-level coverage / _defCall
  };
}

function cover6Explicit() {
  const raw = {
    id: "dc-c6",
    name: "4-3 Cover 6",
    front: "4-3",
    coverage: "Cover 6",
    defs: [{ group: "DB", lab: "C", x: 200, y: 280 }],
    v: 2,
  };
  return {
    id: raw.id,
    name: raw.name,
    coverage: raw.coverage,
    front: raw.front,
    state: { front: raw.front, defs: raw.defs, players: [] },
    ol: { coverage: raw.coverage },
    _defCall: raw,
  };
}

function look() {
  return { id: "look-2x2", name: "Doubles", formation: "2x2", state: { players: [] } };
}

function emphasisWeek(extra) {
  return Object.assign(
    {
      def_aligns: {
        "Cover 1": { 0: { x: 210, y: 220, lab: "C" } },
        "Tampa 2": { 0: { x: 170, y: 300 } },
      },
      gen: { def_calls: [tampaCall()._defCall] },
      test_spec: {
        positions: {
          DB: {
            kinds: ["align", "coverage"],
            emphasis: [
              {
                kind: "align",
                dimension: "leverage",
                scheme_type: "coverage",
                scheme_value: "Cover 1",
                min_reps: 6,
                out_of_plan_mode: "review",
              },
            ],
          },
        },
      },
    },
    extra || {}
  );
}

function envFor(week, BLITZCALLS, opts) {
  opts = opts || {};
  const WEEKDEF = opts.WEEKDEF != null ? opts.WEEKDEF : week.def_aligns || {};
  const WEEKCOVS = opts.WEEKCOVS != null ? opts.WEEKCOVS : Object.keys(WEEKDEF);
  return {
    n: opts.n || 10,
    positions: ["DB"],
    week: week,
    BLITZCALLS: BLITZCALLS,
    OPPLOOKS: [look()],
    ctx: {
      WEEKDEF: WEEKDEF,
      WEEKCOVS: WEEKCOVS,
      WEEKPLAN: week,
      weekDefCalls: (week.gen && week.gen.def_calls) || [],
    },
  };
}

/* ── 1) Happy path: def_aligns Cover 1 → ok ≥6 ───────────────────────────── */

console.log("\n── 1) ok ≥6 from def_aligns (OL Slam present but ignored) ──");
{
  const week = emphasisWeek();
  const tampa = tampaCall();
  const slam = slamOlOnly();
  const env = envFor(week, [slam, tampa]);

  // Pool identity: fill pool === pick pool (same resolveAlignCallPool)
  const fillPool = resolveAlignCallPool(
    env.BLITZCALLS,
    { preferScheme: "Cover 1", strictScheme: true },
    env.ctx
  );
  const pickPool = resolveAlignCallPool(
    env.BLITZCALLS,
    { preferScheme: "Cover 1", strictScheme: true },
    env.ctx
  );
  assert(fillPool.source === "def_aligns", "fill pool sourced from def_aligns (not matched OL Slam)");
  assert(pickPool.source === fillPool.source, "pool identity: pick source === fill source");
  assert(
    fillPool.callPool.map(function (c) {
      return c.id;
    }).join(",") ===
      pickPool.callPool.map(function (c) {
        return c.id;
      }).join(","),
    "pool identity: fill call ids === pick call ids"
  );
  assert(
    fillPool.callPool.every(function (c) {
      return c.id !== slam.id && (c._fromDefAligns || isExplicitAlignCall(c));
    }),
    "pool excludes OL Slam id"
  );

  const result = runAlignUpweightFill(env);
  const cell = result.cells[0];
  const cover1 = result.queue.filter(function (r) {
    return AT.alignRepMatchesCell(r, cell);
  });
  const branch = result.branches[0];
  const floorReps = result.queue.slice(0, branch.have);

  assert(!!branch && branch.ok === true, "ok branch taken (not short)");
  assert(!/short:/.test(branch.message), "no short warning: " + branch.message);
  assert(/ok:/.test(branch.message), "ok message: " + branch.message);
  assert(cover1.length >= 6, "placed Cover-1 count ≥6, got " + cover1.length);
  assert(branch.have >= 6, "branch.have ≥6, got " + branch.have);
  assert(floorReps.length >= 6, "floor-fill prefix length ≥6");
  assert(
    floorReps.every(function (r) {
      return AT.alignRepMatchesCell(r, cell);
    }),
    "floor-fill prefix are Cover-1 cell matches"
  );
  assert(
    floorReps.every(function (r) {
      return r._fromDefAligns === true && r._poolSource === "def_aligns";
    }),
    "floor-fill Cover-1 reps sourced from def_aligns (not OL Slam)"
  );
  assert(
    floorReps.every(function (r) {
      return r._callId !== slam.id;
    }),
    "floor-fill reps do not carry Slam call id"
  );

  // Bias, don't monopolize
  assert(result.queue.length === result.n, "test length stays at n=" + result.n + ", got " + result.queue.length);
  const tampaReps = result.queue.filter(function (r) {
    return AT.normalizeSchemeKey(r.coverageName) === "tampa 2";
  });
  assert(tampaReps.length >= 1, "non-flagged Tampa 2 still appears in remainder, got " + tampaReps.length);
  console.log(
    "   → placed Cover 1: " +
      cover1.length +
      "/" +
      branch.floor +
      " (floor-fill " +
      floorReps.length +
      " from def_aligns) · Tampa 2 remainder: " +
      tampaReps.length +
      " · branch: " +
      branch.message
  );
}

/* ── 2) Regression: OL Slam only (no def_aligns Cover 1) → short ─────────── */

console.log("\n── 2) OL-only Slam + no Cover-1 def_aligns → short (false-positive lockout) ──");
{
  const week = emphasisWeek({
    def_aligns: { "Tampa 2": { 0: { x: 1, y: 2 } } }, // Cover 1 ABSENT
  });
  const env = envFor(week, [slamOlOnly(), tampaCall()], {
    WEEKDEF: week.def_aligns,
    WEEKCOVS: ["Tampa 2"],
  });

  const pool = resolveAlignCallPool(
    env.BLITZCALLS,
    { preferScheme: "Cover 1", strictScheme: true },
    env.ctx
  );
  assert(pool.source === "empty", "OL Slam must not populate strict Cover-1 pool");

  const result = runAlignUpweightFill(env);
  const branch = result.branches[0];
  assert(!!branch && branch.ok === false, "short branch taken");
  assert(/short:/.test(branch.message), "short message: " + branch.message);
  assert(branch.have === 0, "got 0 Cover-1 reps from OL Slam false positive, have=" + branch.have);
  // Rest of install still fills (Tampa 2). Non-strict remainder may still resolve
  // Slam via ol.coverage (pre-existing pickAlignRep) — the locked regression is
  // strictScheme floor-fill → short, not a full-pool OL ban.
  assert(result.queue.length > 0, "graceful: remainder still fills from Tampa 2");
  const tampaN = result.queue.filter(function (r) {
    return AT.normalizeSchemeKey(r.coverageName) === "tampa 2";
  }).length;
  assert(tampaN >= 1, "Tampa 2 still in remainder after short, got " + tampaN);
  console.log("   → " + branch.message + " · remainder n=" + result.queue.length + " (tampa=" + tampaN + ")");
}

/* ── 3) Graceful degrade: no Cover-1 anywhere → short, no crash ──────────── */

console.log("\n── 3) Degrade: no Cover-1 def_aligns / def_calls → short, rest fills ──");
{
  const week = emphasisWeek({
    def_aligns: { "Tampa 2": {} },
  });
  const env = envFor(week, [tampaCall()], { WEEKDEF: week.def_aligns, WEEKCOVS: ["Tampa 2"] });
  const result = runAlignUpweightFill(env);
  const branch = result.branches[0];
  assert(branch.ok === false && branch.have === 0, "degrade short 0/6");
  assert(result.queue.length === result.n, "degrade: full test still builds from Tampa 2");
  console.log("   → " + branch.message + " · queue=" + result.queue.length);
}

/* ── 4) Out-of-plan review: explicit Cover 6 call, not in install ────────── */

console.log("\n── 4) Out-of-plan review: Cover 6 explicit call → ok + _reviewRep ──");
{
  const week = {
    def_aligns: { "Cover 1": {}, "Tampa 2": {} }, // Cover 6 NOT installed
    gen: { def_calls: [tampaCall()._defCall] },
    test_spec: {
      positions: {
        DB: {
          emphasis: [
            {
              kind: "align",
              dimension: "leverage",
              scheme_type: "coverage",
              scheme_value: "Cover 6",
              min_reps: 6,
              out_of_plan_mode: "review",
            },
          ],
        },
      },
    },
  };
  const c6 = cover6Explicit();
  const env = envFor(week, [c6, tampaCall()], {
    WEEKDEF: week.def_aligns,
    WEEKCOVS: ["Cover 1", "Tampa 2"],
  });
  const installed = AT.installedSchemeKeys(week);
  assert(!installed["cover 6"], "Cover 6 is out of install");

  const result = runAlignUpweightFill(env);
  const branch = result.branches[0];
  assert(branch.ok === true && branch.asReview === true, "review ok branch");
  const floorReview = result.queue.slice(0, branch.have);
  assert(floorReview.length >= 6, "review places ≥6 Cover-6 reps");
  assert(
    floorReview.every(function (r) {
      return AT.alignRepMatchesCell(r, result.cells[0]) && r._reviewRep === true;
    }),
    "floor-fill review reps tagged _reviewRep"
  );
  console.log("   → " + branch.message + " · reviewRep×" + floorReview.length);
}

/* ── Done ───────────────────────────────────────────────────────────────── */

console.log("\nFocus 4d Follow-up G PLACE integration GREEN — ok≥6 from def_aligns, OL Slam→short, pool identity, review, degrade.");
