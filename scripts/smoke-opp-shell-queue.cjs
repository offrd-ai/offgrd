/**
 * Smoke: opponent card queue — situation weight, coverage header, print footer.
 * Usage: node scripts/smoke-opp-shell-queue.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { window: {}, globalThis: {}, console, localStorage: {
  _s: Object.create(null),
  getItem: function (k) { return this._s[k] == null ? null : this._s[k]; },
  setItem: function (k, v) { this._s[k] = String(v); },
  removeItem: function (k) { delete this._s[k]; },
} };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "OFFGRD-opp-shells.js"), "utf8"), sandbox);
const S = sandbox.OFFGRD_OPP_SHELLS;
if (!S) {
  console.error("FAIL load OFFGRD_OPP_SHELLS");
  process.exit(1);
}

const OPP = "Southwest Longhorns";
let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

function row(partial) {
  return Object.assign(
    {
      id: partial.id || "r" + Math.random().toString(16).slice(2),
      opponent: OPP,
      side: "off",
      play: "",
      formation: "2x2 Doubles Gun",
      offBackCount: 1,
      offStrength: "right",
      playType: "Run",
      direction: "R",
      gap: "B",
      down: 1,
      distance: 10,
      hash: "L",
      fieldZone: "PLUS",
      gain: 4,
      success: 1,
    },
    partial
  );
}

check("weight constant is named", S.OPP_CARD_SIT_WEIGHT && S.OPP_CARD_SIT_WEIGHT.THIRD_OR_REDZONE_MULT === 1.25);

const even = { n: 4, downDist: { "1": 2, "2": 2 }, fieldZoneDist: { PLUS: 4 } };
const thirdMaj = { n: 4, downDist: { "3": 3, "1": 1 }, fieldZoneDist: { PLUS: 4 } };
const rzMaj = { n: 4, downDist: { "1": 4 }, fieldZoneDist: { REDZONE: 3, PLUS: 1 } };
const halfThird = { n: 4, downDist: { "3": 2, "1": 2 }, fieldZoneDist: { PLUS: 4 } };
check("no boost without majority", S.situationWeight(even) === 4);
check("3rd-down majority ×1.25", S.situationWeight(thirdMaj) === 5);
check("red-zone majority ×1.25", S.situationWeight(rzMaj) === 5);
check("exactly half 3rd does not boost", S.situationWeight(halfThird) === 4);

const snaps = [];
for (let i = 0; i < 4; i++) snaps.push(row({ id: "base-" + i, play: "Inside Zone", down: 1, fieldZone: "PLUS" }));
for (let i = 0; i < 4; i++) snaps.push(row({ id: "3rd-" + i, play: "Stick", formation: "Trips Rt Gun", down: i < 3 ? 3 : 1, fieldZone: "PLUS" }));
for (let i = 0; i < 2; i++) snaps.push(row({ id: "thin-" + i, play: "Naked", formation: "Empty Gun", down: 3, fieldZone: "REDZONE" }));

S.clearCache();
const grouped = S.groupRows(snaps, OPP);
const iz = grouped.groups.find((g) => g.play === "Inside Zone");
const stick = grouped.groups.find((g) => g.play === "Stick");
const naked = grouped.groups.find((g) => g.play === "Naked");
check("IZ sitWeight = n", iz && iz.sitWeight === 4, iz && iz.sitWeight);
check("Stick sitWeight boosted", stick && stick.sitWeight === 5, stick && stick.sitWeight);
check("Naked is thin", naked && naked.thin === true);

const ranked = grouped.groups.slice().sort(S.queueCompare);
check("boosted n=4 ranks above unboosted n=4", ranked[0] && ranked[0].play === "Stick", ranked[0] && ranked[0].play);
check("thin last even if 3rd+RZ", ranked[ranked.length - 1] && ranked[ranked.length - 1].play === "Naked");

const cov = S.coverageOf(ranked, grouped.total, 12);
check("coverage uses all groups when <12", cov.topCount === 3 && cov.total === 10);
check("coverage header copy", cov.header === "Top 3 plays = 100% of their snaps.", cov.header);
check("selected header copy", cov.selectedHeader === "Selected 3 plays = 100% of their snaps.", cov.selectedHeader);

const emptyForm = S.resolveFormation("");
check("empty formation is uncharted not rejected", emptyForm.uncharted === true && emptyForm.unresolved === false);
check("n/a formation is uncharted", S.resolveFormation("n/a").uncharted === true && S.resolveFormation("n/a").unresolved === false);
const rejected = S.resolveFormation("NOT_A_REAL_FORM_XYZ");
check("rejected tag stays unresolved", rejected.unresolved === true && !rejected.uncharted);
const spread = S.resolveFormation("SPREAD");
check("SPREAD family label stays rejected", spread.unresolved === true && !spread.uncharted);
const unchartedShell = S.buildShell({ play: "Ghost", formation: "", n: 4, shellKey: "play:ghost|", sitWeight: 4 });
const resolvedShell = S.buildShell({ play: "Inside Zone", formation: "2x2 Doubles Gun", n: 4, shellKey: "play:iz|", sitWeight: 4 });
check("uncharted shell is not red-unresolved", unchartedShell.unchartedFormation === true && unchartedShell.unresolvedFormation === false);
const formRank = [unchartedShell, resolvedShell].sort(S.queueCompare);
check("uncharted below resolved groups", formRank[0] === resolvedShell && formRank[1] === unchartedShell);

const footer = S.printFooterLine({ drawnCount: 1, shellCount: 2, pct: 91, opponent: OPP });
check("print footer names opponent", footer === "1 drawn · 2 shells · 91% of snaps · " + OPP, footer);

S.telePush("queue_open", { opponent: OPP, cards: 3 });
S.telePush("print", { opponent: OPP, t_open_to_print_ms: 1200, shells: 2, drawn: 1, pct_shells_edited: 33 });
const tele = S.teleRead();
check("tele ring has named events", tele.length === 2 && tele[0].event === "queue_open" && tele[1].event === "print");
check("print payload keeps t_open_to_print_ms", tele[1].t_open_to_print_ms === 1200);

vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "OFFGRD-scoutcards.js"), "utf8"), sandbox);
const SC = sandbox.OFFGRD_SCOUTCARDS;
if (!SC || !SC.buildSheetHtml) {
  fails += 1;
  console.error("FAIL load OFFGRD_SCOUTCARDS.buildSheetHtml");
} else {
  const unchartedCard = SC.cardHtml(Object.assign({}, unchartedShell, { cardStatus: "shell", players: [{ id: 0 }] }), "opponent");
  check("sheet uses muted uncharted badge", /sc-uncharted/.test(unchartedCard) && !/sc-unres/.test(unchartedCard));
  const rejectedShell = S.buildShell({ play: "Dart", formation: "SPREAD", n: 6, shellKey: "sig:spread|", sitWeight: 6 });
  const rejectedCard = SC.cardHtml(Object.assign({}, rejectedShell, { cardStatus: "shell", players: [{ id: 0 }] }), "opponent");
  check("sheet keeps red for canon-rejected tag", /sc-unres/.test(rejectedCard) && /unresolved formation/.test(rejectedCard));
}

if (fails) {
  console.error(fails + " failed");
  process.exit(1);
}
console.log("smoke-opp-shell-queue: all ok");
