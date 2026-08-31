/**
 * Guided IS game mode — chip sit, glance Expect, delete-undo, entry patch.
 *   node scripts/smoke-caller-game-mode.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const G = require(path.join(ROOT, "OFFGRD-caller-game.js"));
const HOME = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");
const CSS = fs.readFileSync(path.join(ROOT, "OFFGRD-redesign.js"), "utf8");
const SW = fs.readFileSync(path.join(ROOT, "offgrd-sw.js"), "utf8");

let n = 0;
function ok(cond, msg) {
  n++;
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

ok(G.isGuided("guided") && G.isGuided(undefined) && !G.isGuided("advanced"), "guided is game mode; advanced is not");

const chips = G.sitChipLabels({ dn: 2, db: "10+", hash: "L", zone: "ANY" });
ok(chips.dn === "2ND" && chips.db === "10+" && chips.hash === "L" && chips.zone === "ANY", "sit chips 2ND · 10+ · L · ANY");
ok(G.sitChipLine({ dn: 3, db: "4-6", hash: "M", zone: "REDZONE" }) === "3RD · 4-6 · M · RZ", "sit chip line");

ok(G.covShort("Cover 4") === "C4" && G.covShort("2-man") === "2M", "coverage glance abbreviations");
const gl = G.expectGlance({ cov: "Cover 4", covPct: 0.54, front: "3-4", pr: 0.38, n: 12 });
ok(gl.text === "C4 54% · 3-4 · 38% blz" && !gl.empty, "expect glance: " + gl.text);
ok(G.expectGlance({ terminal: true, n: 0 }).empty && /No sample/.test(G.expectGlance({ n: 0 }).text), "empty expect is honest");

let committed = null;
const timers = [];
G.useClock({
  now: function () { return 1000; },
  setTimeout: function (fn, ms) {
    timers.push({ fn: fn, ms: ms });
    return timers.length;
  },
  clearTimeout: function () { timers.length = 0; },
});
const pend = G.queueDelete({ playIndex: 3, play: "HOUSTON" }, function (p) { committed = p; });
ok(pend && pend.playIndex === 3 && G.isHiddenPlayIndex(3), "delete hides the row immediately");
ok(G.filterHidden([{ playIndex: 3 }, { playIndex: 4 }]).length === 1, "filterHidden drops pending delete");
ok(timers[0] && timers[0].ms === 5000, "5-second undo window");
G.cancelDelete();
ok(!G.pendingDelete() && !G.isHiddenPlayIndex(3), "undo toast cancels before commit");
G.queueDelete({ playIndex: 7, play: "DINO" }, function (p) { committed = p; });
timers[0].fn();
ok(committed && committed.playIndex === 7, "timeout commits undo");

ok(/OFFGRD-caller-game\.js/.test(HOME), "O Caller loads game-mode helper");
ok(/OFFGRD-caller-game\.js/.test(SW), "SW precaches game-mode helper for airplane-mode iPad");
ok(/data-caller-game/.test(HOME) && /callerGuidedEntryHtml/.test(HOME), "guided paints the game entry panel");
ok(/CALLER_GAME_SCREEN/.test(HOME) && /callerGameShow/.test(HOME) && /callerGameAfterCall/.test(HOME), "three-screen wizard a/s/b");
ok(/rd-gd-sit-banner/.test(HOME) && /data-caller-act="sit-open"/.test(HOME), "screen A sit is a banner");
ok(/rd-gd-sit-editor/.test(HOME) && /data-caller-act="sit-set"/.test(HOME) && /data-caller-act="sit-done"/.test(HOME), "screen S shows all four sit rows");
ok(/callerGuidedAfterHtml/.test(HOME) && /data-caller-act="skip"/.test(HOME) && /data-caller-act="done"/.test(HOME), "screen B has Skip and Done");
ok(/rd-gd-wiz-back/.test(HOME) && /data-caller-act="back"/.test(HOME), "Back is on every wizard screen");
ok(/callerEnsureDelegate/.test(HOME) && /data-caller-act/.test(HOME) && /callerPaintSitGridOn/.test(HOME), "taps are delegated; sit paints in place");
ok(/callerToggleExpect/.test(HOME) && /rd-gd-expect-line/.test(HOME), "expect is one glance line");
ok(/caller-more/.test(HOME) && /More · log · marks · tools/.test(HOME), "non-integral panels sit in More");
ok(/callerDeleteSnap/.test(HOME) && /caller-del-row/.test(HOME) && /callerCancelDelete/.test(HOME), "log rows carry Delete + undo");
ok(/callerPatchEntry/.test(HOME), "screen swaps patch entry, not the full column");
ok(/callerCallSheetHtml\(\{ game:true \}\)/.test(HOME), "guided shortlist hides Playbook / full list");
ok(/Search all plays/.test(HOME) && /Show all plays/.test(HOME), "Search is game; Show all stays on Advanced");
ok(/rd-gd-sit-grid/.test(HOME), "Advanced sit grid still exists");
ok(/min-height:44px/.test(CSS) && /rd-gd-sit-banner/.test(CSS) && /rd-gd-wiz-back/.test(CSS), "game-mode 44pt targets");
ok(/rd-gd-del-toast/.test(CSS), "delete undo toast styled");

ok(G.sitSpeak({ dn: 1, db: "10+" }) === "1st & 10", "sitSpeak drops 10+ bucket leak");
ok(G.sitSpeak({ dn: 3, db: "4-6" }) === "3rd & 4-6", "sitSpeak keeps a real band");
ok(G.sitBannerLine({ dn: 2, db: "7-9", hash: "L", zone: "OWN" }) === "2nd & 7-9 · L · OWN", "sit banner line");
ok(G.speakSitTxt("3rd & 10+ L") === "3rd & 10 L", "backfill sitTxt drops 10+");
ok(G.pendingNeedLabel(1) === "1 older play needs results", "pending singular needs");
ok(G.pendingNeedLabel(2) === "2 older plays need results", "pending plural need");
ok(G.nextScreenAfterCall() === "b", "call auto-advances to after-snap");
ok(G.coachSheetTitle({ dn: 3, db: "4-6" }, {}) === "Best for 3rd & 4-6", "sheet title is coach copy");
ok(
  /showing all 3rd down \(12\)/.test(G.coachSheetTitle({ dn: 3, db: "4-6" }, { widened: true, rung: 4, n: 12, badge: "down only" })),
  "widened title has no EXACT / DOWN ONLY"
);
ok(!/EXACT|DOWN ONLY|DISTANCE/.test(G.coachSheetTitle({ dn: 3, db: "4-6" }, { widened: true, rung: 4, n: 12, badge: "down only" })), "no pool codes in coach title");
ok(G.isEntryPaint("entry") && G.isEntryPaint("sit") && !G.isEntryPaint("full"), "footer only counts entry-scope paints");

ok(/CALLER_HOLD_FULL/.test(HOME) && /callerHoldFull/.test(HOME) && /callerMaybeRender/.test(HOME), "entry tap holds full paints");
ok(/CALLER_HOLD_FULL&&!opts\.force\) return/.test(HOME), "renderCaller no-ops while held");
ok(/callerMaybeRender\(\)/.test(HOME) && /OFFGRD_CALLER_SYNC_ENGINE\.subscribe/.test(HOME), "sync/presence use maybe-render");
ok(/rd-gd-vs/.test(HOME) && /vs "\+opp/.test(HOME), "opponent is labeled vs, not us");
ok(/<div class="lbl">Down<\/div>/.test(HOME) && /<div class="lbl">Dist<\/div>/.test(HOME) && /<div class="lbl">Hash<\/div>/.test(HOME) && /<div class="lbl">Zone<\/div>/.test(HOME), "sit editor labels all four dimensions");
ok(/is-hide/.test(HOME) && /<span class="body">Hide<\/span>/.test(HOME), "expanded Expect hides the glance line");
ok(/<button type="button" class="rd-gd-more-sum"/.test(HOME), "More bar is a full-width button");
ok(/rd-gd-tools/.test(HOME) && /Clear game/.test(HOME), "Clear lives in Tools");
ok(
  /<b>Call log<\/b><\/span><\/div>/.test(HOME) && /onclick="callerClear\(\)">Clear game/.test(HOME),
  "Guided log has no Clear; Tools has Clear game"
);
ok(/!topInBucket && !game/.test(HOME), "game mode folds BEST NOW into the list");
ok(/coachSheetTitle/.test(HOME) && /callerSpeakSitTxt/.test(HOME), "game screen uses coach sit copy");
ok(/if\(!callerIsGuided\(\)\) h\+=callerSyncHeaderHtml/.test(HOME), "sync/export chrome is not on the game header");
ok(/isEntryPaint/.test(HOME) && /CALLER_ENTRY_MS/.test(HOME), "footer ms is the last entry-scope paint");

ok(/CALLER_REPICK/.test(HOME) && /callerIsGuided\(\)&&CALLER_REPICK/.test(HOME), "re-pick only after Back from After-snap");
ok(/callerSitCallFields/.test(HOME) && /Object\.assign\(\{ play:play \}, callerSitCallFields\(\)\)/.test(HOME), "re-pick writes the banner sit");
ok(/function callerGameStripLook/.test(HOME) && /callerGameSkip\(\)\{[\s\S]*callerGameStripLook/.test(HOME), "Skip strips look");
ok(/if\(!callerIsGuided\(\)\) callerAttachStickyObs/.test(HOME), "Guided does not attach sticky at call time");
ok(/coverage: callerIsGuided\(\)\?null/.test(HOME), "Guided call writes no Expect coverage");
ok(/function callerGameCommitSticky/.test(HOME) && /callerGameDone\(\)\{[\s\S]*callerGameCommitSticky/.test(HOME), "Done may commit untouched sticky");
ok(/class=\\"is-prefill\\"/.test(HOME) && /propFront/.test(HOME), "Screen B sticky look is proposed, not on");
ok(/rd-gd-look-seg button\.is-prefill/.test(CSS), "proposed look chips are dashed");
ok(G.sitFieldsEqual({ dn: 3, db: "10+", hash: "L", zone: "REDZONE" }, { dn: 3, db: "10+", hash: "L", zone: "REDZONE" }), "sitFieldsEqual same banner");
ok(!G.sitFieldsEqual({ dn: 3, db: "10+", hash: "L", zone: "REDZONE" }, { dn: 2, db: "7-9", hash: "L", zone: "ANY" }), "sitFieldsEqual rejects auto-computed sit");
ok(G.looksBare({ play: "DINO" }) && !G.looksBare({ play: "DINO", front: "3-4" }), "looksBare is Skip's recorded shape");

console.log("ok", n, "caller-game-mode checks");
