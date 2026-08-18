/**
 * Smoke: Playbook selection → dock verb-group mapping.
 *   node scripts/smoke-pb-dock.cjs
 */
"use strict";
const path = require("path");
const D = require(path.join(__dirname, "..", "OFFGRD-pb-dock.js"));

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

function has(groups, id) { return groups.indexOf(id) >= 0; }
function anyRoute(groups) { return groups.some(function (g) { return /^routes-/.test(g); }); }
function anyRun(groups) { return groups.indexOf("run-blocks") >= 0; }

const ol = D.groupsForSelection({ ol: 1, lab: "LT", type: "block" });
check("OL → run-blocks", has(ol, "run-blocks"), ol.join(","));
check("OL → no routes", !anyRoute(ol), ol.join(","));
check("OL kind", D.kindOfSel({ ol: 1, lab: "LT" }) === "ol");

const wr = D.groupsForSelection({ type: "route", role: "WR", lab: "X" });
check("WR → routes", anyRoute(wr), wr.join(","));
check("WR → motion", has(wr, "motion"), wr.join(","));
check("WR → move", has(wr, "move"), wr.join(","));
check("WR → block", has(wr, "block-perim"), wr.join(","));
check("WR → no run-blocks", !anyRun(wr), wr.join(","));

const te = D.groupsForSelection({ type: "route", role: "TE", lab: "Y" });
check("TE → receiver groups", anyRoute(te) && has(te, "motion") && !anyRun(te), te.join(","));

const lb = D.groupsForSelection({ group: "LB", lab: "W" });
check("LB → blitz", has(lb, "blitz"), lb.join(","));
check("LB → move", has(lb, "move"), lb.join(","));
check("LB → direct", has(lb, "direct"), lb.join(","));

const play = D.groupsForSelection(null);
["formation", "personnel", "protection", "concepts", "defense-look"].forEach(function (id) {
  check("null → " + id, has(play, id), play.join(","));
});
check("null → no player verbs", !anyRoute(play) && !anyRun(play) && !has(play, "blitz"), play.join(","));

const qb = D.groupsForSelection({ type: "qb", lab: "QB" });
check("QB → no route group", !anyRoute(qb), qb.join(","));
check("QB kind", D.kindOfSel({ type: "qb", lab: "QB" }) === "qb");

const rb = D.groupsForSelection({ type: "rb", lab: "RB" });
check("RB → back routes", has(rb, "routes-back"), rb.join(","));
check("RB → no run-blocks", !anyRun(rb), rb.join(","));

const dl = D.groupsForSelection({ group: "DL", lab: "T" });
check("DL → move+direct, no blitz", has(dl, "move") && has(dl, "direct") && !has(dl, "blitz"), dl.join(","));

check("flag default off (no storage)", D.isDockOn() === false);

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-pb-dock");
