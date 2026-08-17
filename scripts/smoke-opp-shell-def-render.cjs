/**
 * Smoke: defensive shell rendering — zone shapes + no invented rushers.
 * Usage: node scripts/smoke-opp-shell-def-render.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = { window: {}, globalThis: {}, console, document: undefined };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
function load(file) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox);
}
load("OFFGRD-formations-data.js");
load("OFFGRD-formation-canon.js");
load("OFFGRD-render.js");
load("OFFGRD-opp-shells.js");
const S = sandbox.OFFGRD_OPP_SHELLS;
const R = sandbox.OFFGRD_RENDER;

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

check("4-4 template exists", !!(R.DFRONTS && R.DFRONTS["4-4"] && R.DFRONTS["4-4"].length));
check("5-0 template exists", !!(R.DFRONTS && R.DFRONTS["5-0"] && R.DFRONTS["5-0"].length));
check("42 OVER-G aliases to 4-3", S.resolveDefFront("42 OVER-G").front === "4-3" && !S.resolveDefFront("42 OVER-G").unresolved);
check("unknown front falls back 4-3 + flag", S.resolveDefFront("Weird Stack").front === "4-3" && S.resolveDefFront("Weird Stack").unresolved);

const c3 = S.buildDefShell({ front: "4-3", coverage: "Cover 3", n: 8, shellKey: "def:4-3|cover 3" });
const c3svg = R.renderMarkup(c3, { showZones: true, showHandles: false });
check("Cover 3 has 3 deep thirds", (c3svg.match(/DEEP ⅓/g) || []).length === 3, (c3svg.match(/DEEP ⅓/g) || []).length);
check("Cover 3 has 4 under zones", ((c3svg.match(/>FLAT</g) || []).length + (c3svg.match(/>HOOK</g) || []).length) === 4);
check("Cover 3 has no rusher path without blitz", !c3.defs.some((d) => d.role === "rush" || (d.route && d.route.length)));

const c1 = S.buildDefShell({ front: "4-3", coverage: "Cover 1", n: 6, shellKey: "def:4-3|cover 1" });
const c1svg = R.renderMarkup(c1, { showZones: true, showHandles: false });
check("Cover 1 has deep middle", /DEEP MIDDLE/.test(c1svg));
check("Cover 1 has MAN or RAT", /MAN|RAT/.test(c1svg));

const c0 = S.buildDefShell({ front: "4-3", coverage: "Cover 0", n: 4, shellKey: "def:4-3|cover 0" });
const c0svg = R.renderMarkup(c0, { showZones: true, showHandles: false });
check("Cover 0 has no deep zone", !/DEEP/.test(c0svg));

const blitz = S.buildDefShell({
  front: "4-3",
  coverage: "Cover 4",
  blitz: "MIKE A",
  n: 3,
  shellKey: "def:4-3|cover 4|mike a",
});
check("charted blitz draws one rusher path", blitz.defs.filter((d) => d.role === "rush" && d.route && d.route.length).length === 1);
check("AUTO-SHELL fields present", c3.cardStatus === "shell" && c3.showZones === true && c3.n === 8);

if (fails) {
  console.error(fails + " failed");
  process.exit(1);
}
console.log("smoke-opp-shell-def-render: all ok");
