/**
 * Smoke: Assist mode detection must not depend on window.IMPORT_MODE alone
 * (let IMPORT_MODE is script-local in OFFGRD.html).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "OFFGRD-assist-import.js"), "utf8");

function withDom(modeBtn, run) {
  const sandbox = {
    window: {},
    document: {
      querySelector: function (sel) {
        if (sel === "#seg-importmode button.on") {
          return modeBtn
            ? { getAttribute: function () { return modeBtn; } }
            : null;
        }
        return null;
      },
      getElementById: function () {
        return null;
      },
    },
    console,
    Promise,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.OFFGRD_CALLER_OUTCOME = { isSuccessVal: function () { return null; } };
  vm.runInNewContext(src, sandbox);
  return run(sandbox.OFFGRD_ASSIST_IMPORT, sandbox);
}

let fails = 0;
withDom("autoscout", function (AI, sb) {
  sb.IMPORT_MODE = undefined;
  if (!AI.isAssistMode || !AI.isAssistMode()) {
    // isAssistMode may not be exported — check via onCommitClick short-circuit
  }
});

// Re-export isAssistMode for test — patch file exports if missing
const src2 = src.replace(
  "onCommitClick: onCommitClick,",
  "onCommitClick: onCommitClick,\n    isAssistMode: isAssistMode,"
);
function check(modeAttr, windowMode, expect) {
  const sandbox = {
    console,
    Promise,
    document: {
      querySelector: function (sel) {
        if (sel === "#seg-importmode button.on") {
          return modeAttr == null
            ? null
            : { getAttribute: function () { return modeAttr; } };
        }
        return null;
      },
      getElementById: function () {
        return { style: { display: "none" }, offsetParent: null };
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  if (windowMode !== undefined) sandbox.IMPORT_MODE = windowMode;
  sandbox.OFFGRD_CALLER_OUTCOME = { isSuccessVal: function () { return null; } };
  vm.runInNewContext(src2, sandbox);
  const got = sandbox.OFFGRD_ASSIST_IMPORT.isAssistMode();
  if (got !== expect) {
    console.error("FAIL modeAttr=", modeAttr, "windowMode=", windowMode, "got", got, "want", expect);
    fails++;
  }
}

check("autoscout", undefined, true); // the production bug case
check("full", undefined, false);
check("defense", undefined, false);
check(null, "autoscout", true);
check("full", "autoscout", true); // window wins

if (fails) process.exit(1);
console.log("PASS assist mode detect — window.IMPORT_MODE undefined + button.on=autoscout → Assist path");
