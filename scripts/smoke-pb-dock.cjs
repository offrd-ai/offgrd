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
check("WR → no move tool", !has(wr, "move"), wr.join(","));
check("WR → block", has(wr, "block-perim"), wr.join(","));
check("WR → no run-blocks", !anyRun(wr), wr.join(","));
check("WR → no blitz", !has(wr, "blitz"), wr.join(","));

const te = D.groupsForSelection({ type: "route", role: "TE", lab: "Y" });
check("TE → receiver groups", anyRoute(te) && has(te, "motion") && !anyRun(te), te.join(","));

const lb = D.groupsForSelection({ group: "LB", lab: "W" });
check("LB kind", D.kindOfSel({ group: "LB", lab: "W" }) === "lb");
check("LB → blitz", has(lb, "blitz"), lb.join(","));
check("LB → zone-drop", has(lb, "zone-drop"), lb.join(","));
check("LB → spy", has(lb, "spy"), lb.join(","));
check("LB → man", has(lb, "man"), lb.join(","));
check("LB → no DL slant", !has(lb, "dl-slant"), lb.join(","));
check("LB → no press", !has(lb, "press"), lb.join(","));
check("LB → no routes", !anyRoute(lb), lb.join(","));

const play = D.groupsForSelection(null);
["side", "formation", "personnel", "protection", "concepts", "defense-look"].forEach(function (id) {
  check("null → " + id, has(play, id), play.join(","));
});
check("null → no player verbs", !anyRoute(play) && !anyRun(play) && !has(play, "blitz"), play.join(","));

const dPlay = D.groupsForSelection(null, { side: "defense" });
["side", "front", "coverage", "blitz-group", "offense-look"].forEach(function (id) {
  check("defense null → " + id, has(dPlay, id), dPlay.join(","));
});
check("defense null → no O family/concepts", !has(dPlay, "concepts") && !has(dPlay, "formation") && !has(dPlay, "defense-look"), dPlay.join(","));

const qb = D.groupsForSelection({ type: "qb", lab: "QB" });
check("QB → no route group", !anyRoute(qb), qb.join(","));
check("QB kind", D.kindOfSel({ type: "qb", lab: "QB" }) === "qb");
check("QB → drop + boot + notes", has(qb, "qb-drop") && has(qb, "qb-boot") && has(qb, "qb-notes"), qb.join(","));

const rb = D.groupsForSelection({ type: "rb", lab: "RB" });
check("RB → back routes", has(rb, "routes-back"), rb.join(","));
check("RB → no run-blocks", !anyRun(rb), rb.join(","));
check("RB → no move tool", !has(rb, "move"), rb.join(","));

const dl = D.groupsForSelection({ group: "DL", lab: "T" });
check("DL kind", D.kindOfSel({ group: "DL", lab: "T" }) === "dl");
check("DL → slant/contain/two-gap/drop", has(dl, "dl-slant") && has(dl, "dl-contain") && has(dl, "dl-two-gap") && has(dl, "zone-drop"), dl.join(","));
check("DL → no blitz", !has(dl, "blitz"), dl.join(","));
check("DL → no man", !has(dl, "man"), dl.join(","));
check("DL → no routes", !anyRoute(dl), dl.join(","));

const db = D.groupsForSelection({ group: "DB", lab: "CB" });
check("DB kind", D.kindOfSel({ group: "DB", lab: "CB" }) === "db");
check("DB → man/drop/blitz/press", has(db, "man") && has(db, "zone-drop") && has(db, "blitz") && has(db, "press"), db.join(","));
check("DB → no spy", !has(db, "spy"), db.join(","));
check("DB → no slant", !has(db, "dl-slant"), db.join(","));

check("dock default ON (no storage)", D.isDockOn() === true);
check("classic hatch off by default", D.isClassicOn() === false);

const off = { type: "route", lab: "X" };
const def = { group: "LB", lab: "W" };
check("offense tap drags with no mode", D.tapDrags(off, { mode: "move" }) === true);
check("offense tap drags in route mode", D.tapDrags(off, { mode: "route" }) === true);
check("defense tap drags with no mode", D.tapDrags(def, { mode: "move" }) === true);
check("defense tap drags in route mode", D.tapDrags(def, { mode: "route" }) === true);
check("erase does not drag", D.tapDrags(off, { mode: "erase" }) === false);
check("man-assign tap on receiver does not drag", D.tapDrags(off, { mode: "move", pending: "man", sel: def }) === false);

if (fails) {
  console.error(fails + " FAIL");
  process.exit(1);
}
console.log("ok  smoke-pb-dock");
