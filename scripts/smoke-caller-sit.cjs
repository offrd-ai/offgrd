/**
 * Situational fallback ladder — never-blank expect resolution.
 *   node scripts/smoke-caller-sit.cjs
 */
"use strict";
const path = require("path");
const Sit = require(path.join(__dirname, "..", "OFFGRD-caller-sit.js"));

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

function snap(partial) {
  return Object.assign(
    {
      down: 2,
      distance: 8,
      fieldZone: "PLUS",
      hash: "M",
      coverage: "Cover 3",
      playType: "Pass",
      formation: "Cali",
    },
    partial
  );
}

/* --- exact-hit --- */
const exactPool = [
  snap(),
  snap({ distance: 7 }),
  snap({ distance: 9 }),
  snap({ distance: 8, coverage: "Cover 1" }),
  snap({ distance: 8 }),
];
const exact = Sit.resolveSituation(exactPool, {
  dn: 2,
  db: "7-9",
  hash: "M",
  zone: "PLUS",
});
assert(exact.rung === 0 && exact.n === 5 && !exact.widened, "exact-hit rung 0 n=5");
assert(/exact/.test(exact.badge), "exact badge: " + exact.badge);

/* --- hash-drop recovery (Matt case: M·Plus exact 0 → any hash still thin → any hash/field) --- */
const mattPool = [];
for (let i = 0; i < 7; i++) {
  mattPool.push(
    snap({
      hash: i % 2 ? "L" : "R",
      fieldZone: i % 3 ? "OWN" : "PLUS",
      formation: "Cali",
      coverage: "Cover 3",
    })
  );
}
/* Zero exact M·Plus — all have wrong hash or we'll use only non-M */
const noExact = mattPool.map((r, i) =>
  Object.assign({}, r, { hash: i % 2 ? "L" : "R", fieldZone: "OWN" })
);
/* Add enough OWN snaps that drop-hash (still OWN) works? Ticket: any/any = 7.
   Build: 0 exact M+Plus; after drop hash still 0 if all OWN; drop field → 7. */
const widenPool = [];
for (let i = 0; i < 7; i++) {
  widenPool.push(
    snap({
      hash: ["L", "R", "M"][i % 3],
      fieldZone: ["OWN", "PLUS", ""][i % 3] || "OWN",
      formation: "Cali",
    })
  );
}
/* Ensure none are M+PLUS together */
widenPool.forEach((r, i) => {
  if (r.hash === "M") r.fieldZone = "OWN";
  if (r.fieldZone === "PLUS") r.hash = "L";
});
const matt = Sit.resolveSituation(widenPool, {
  dn: 2,
  db: "7-9",
  hash: "M",
  zone: "PLUS",
});
assert(matt.rung >= 1 && matt.n >= 5 && matt.widened, "hash/field widen recovers: " + JSON.stringify({
  rung: matt.rung,
  n: matt.n,
  badge: matt.badge,
}));
assert(matt.n === 7, "matt pool n=7 got " + matt.n);
assert(
  /any hash\/field|any hash|any field/.test(matt.widenLabel || matt.badge),
  "widen label names filter set: " + matt.badge
);
assert(/2ND & 7-9/i.test(matt.badge), "badge keeps 2ND & 7-9: " + matt.badge);
/* Cali dominance in widened set (formation stand-in for Matt's 86% signal) */
const caliN = matt.rows.filter((r) => r.formation === "Cali").length;
assert(caliN === 7, "widened sample is all Cali (" + caliN + ")");

/* --- field-drop (hash already ANY, field PLUS → ANY) --- */
const fieldPool = [];
for (let i = 0; i < 6; i++) {
  fieldPool.push(snap({ hash: "L", fieldZone: i < 2 ? "PLUS" : "OWN" }));
}
const fieldDrop = Sit.resolveSituation(fieldPool, {
  dn: 2,
  db: "7-9",
  hash: "ANY",
  zone: "PLUS",
});
/* exact PLUS with ANY hash: only 2 → below floor → drop field → 6 */
assert(fieldDrop.rung === 2 && fieldDrop.n === 6, "field-drop rung 2 n=6 got rung=" + fieldDrop.rung + " n=" + fieldDrop.n);
assert(/any field/.test(fieldDrop.badge), "field-drop badge: " + fieldDrop.badge);

/* --- distance-widen adjacency 7-9 ↔ 10+ --- */
const distPool = [];
for (let i = 0; i < 6; i++) {
  distPool.push(snap({ down: 2, distance: 12, hash: "L", fieldZone: "OWN" })); // 10+
}
const distW = Sit.resolveSituation(distPool, {
  dn: 2,
  db: "7-9",
  hash: "M",
  zone: "PLUS",
});
assert(distW.rung === 3 && distW.n === 6, "distance-widen rung 3: " + JSON.stringify({ rung: distW.rung, n: distW.n }));
assert(/10\+|distance/.test(distW.badge), "distance widen badge: " + distW.badge);

/* short / GOAL must NOT borrow 10+ */
const noShortBorrow = Sit.resolveSituation(distPool, {
  dn: 2,
  db: "1-3",
  hash: "M",
  zone: "PLUS",
});
assert(
  noShortBorrow.rung !== 3,
  "1-3 must not use distance-neighbor rung, got " + noShortBorrow.rung
);

/* --- down-only --- */
const downPool = [];
for (let i = 0; i < 5; i++) {
  downPool.push(snap({ down: 2, distance: 2, hash: "L", fieldZone: "OWN" })); // 1-3 on 2nd
}
const downOnly = Sit.resolveSituation(downPool, {
  dn: 2,
  db: "7-9",
  hash: "M",
  zone: "PLUS",
});
assert(downOnly.rung === 4 && downOnly.n === 5, "down-only rung 4: " + JSON.stringify({ rung: downOnly.rung, n: downOnly.n, badge: downOnly.badge }));
assert(/down only/i.test(downOnly.badge), "down-only badge: " + downOnly.badge);

/* --- playbook terminal --- */
const empty = Sit.resolveSituation([], { dn: 2, db: "7-9", hash: "M", zone: "PLUS" });
assert(empty.terminal && empty.rung === 5, "playbook terminal");
assert(/call sheet|not their tendencies/i.test(empty.badge), "terminal copy: " + empty.badge);

/* --- RZ-sticky: never open-field bleed --- */
const rzMix = [];
for (let i = 0; i < 8; i++) {
  rzMix.push(snap({ down: 2, distance: 8, fieldZone: "OWN", hash: "L" })); // open field
}
for (let i = 0; i < 2; i++) {
  rzMix.push(snap({ down: 2, distance: 8, fieldZone: "REDZONE", hash: "M" }));
}
const rz = Sit.resolveSituation(rzMix, {
  dn: 2,
  db: "7-9",
  hash: "M",
  zone: "REDZONE",
});
/* Only 2 RZ snaps < floor → should terminal, NOT fall into 8 open-field */
assert(rz.terminal === true, "RZ thin → terminal, not open-field bleed");
assert(/red-zone/i.test(rz.badge), "RZ terminal copy: " + rz.badge);
assert(
  rz.rows.every((r) => r.fieldZone === "REDZONE"),
  "RZ rows never include open field"
);

/* RZ widen within RZ (drop hash) hits floor */
const rzOk = [];
for (let i = 0; i < 6; i++) {
  rzOk.push(snap({ down: 3, distance: 5, fieldZone: "REDZONE", hash: i ? "L" : "R" }));
}
const rzWiden = Sit.resolveSituation(rzOk, {
  dn: 3,
  db: "4-6",
  hash: "M",
  zone: "REDZONE",
});
assert(!rzWiden.terminal && rzWiden.n === 6 && rzWiden.widened, "RZ hash-drop within RZ");
assert(
  rzWiden.rows.every((r) => r.fieldZone === "REDZONE"),
  "RZ widen stays in RZ"
);
assert(/RZ/.test(rzWiden.badge), "RZ badge marks RZ: " + rzWiden.badge);

/* --- money-down sticky: 3rd never pulls 1st/2nd --- */
const moneyPool = [];
for (let i = 0; i < 10; i++) {
  moneyPool.push(snap({ down: 1, distance: 8, hash: "L", fieldZone: "OWN" }));
}
for (let i = 0; i < 2; i++) {
  moneyPool.push(snap({ down: 3, distance: 8, hash: "L", fieldZone: "OWN" }));
}
const money = Sit.resolveSituation(moneyPool, {
  dn: 3,
  db: "7-9",
  hash: "M",
  zone: "PLUS",
});
assert(money.terminal || money.rows.every((r) => +r.down === 3), "3rd never borrows 1st/2nd");
assert(
  !money.rows.some((r) => +r.down === 1 || +r.down === 2),
  "no early-down rows in money-down resolve"
);

/* --- GOAL sticky: no distance neighbor blend --- */
const goalNeighbors = Sit.distanceNeighbors("GOAL");
assert(Array.isArray(goalNeighbors) && goalNeighbors.length === 0, "GOAL has no neighbors");
const goalRungs = Sit.buildRungs(Sit.normalizeSit({ dn: 1, db: "GOAL", zone: "REDZONE" }, { filterDb: "1-3" }));
assert(
  !goalRungs.some((r) => r.rung === 3),
  "GOAL buildRungs skips distance-widen"
);

/* --- conf reflects widened n --- */
assert(matt.conf.n === 7, "conf.n matches widened n");
assert(matt.conf.level === "LOW" || matt.conf.level === "MEDIUM", "conf level for n=7: " + matt.conf.level);

/* --- O/D identical inputs → identical resolve --- */
const a = Sit.resolveSituation(widenPool, { dn: 2, db: "7-9", hash: "M", zone: "PLUS" });
const b = Sit.resolveSituation(widenPool, { dn: 2, db: "7-9", hash: "M", zone: "PLUS" });
assert(a.rung === b.rung && a.n === b.n && a.badge === b.badge, "identical inputs → identical resolve");

console.log("OK caller sit ladder: exact / hash-field widen / distance / down-only / playbook / RZ-sticky / money-down / GOAL");
console.log("PROOF matt-case:", matt.badge, "· Cali", caliN + "/" + matt.n, "· conf", matt.conf.level);
