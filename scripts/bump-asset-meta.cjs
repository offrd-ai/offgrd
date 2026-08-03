"use strict";
const fs = require("fs");
const path = require("path");
const V = process.argv[2] || "192";
const root = path.join(__dirname, "..");

function write(rel, fn) {
  const p = path.join(root, rel);
  let s = fs.readFileSync(p, "utf8");
  const n = fn(s);
  fs.writeFileSync(p, n);
  console.log(rel, s === n ? "NOCHANGE" : "ok");
}

write("OFFGRD-redesign.js", (s) =>
  s.replace(/const ASSET_V = "\d+"/, 'const ASSET_V = "' + V + '"')
);
write("OFFGRD-config.js", (s) =>
  s
    .replace(/OFFGRD_ASSET_V = "\d+"/, 'OFFGRD_ASSET_V = "' + V + '"')
    .replace(/assetV: "\d+"/, 'assetV: "' + V + '"')
    .replace(/currently \?v=\d+/, "currently ?v=" + V)
);
write("OFFGRD-account.js", (s) => s.replace(/\?v=\d+/g, "?v=" + V));
write("OFFGRD-auth.js", (s) => s.replace(/\?v=\d+/g, "?v=" + V));
write("offgrd-sw.js", (s) =>
  s
    .replace(/offgrd-gameday-v\d+/, "offgrd-gameday-v" + V)
    .replace(/ASSET_V = "\d+"/, 'ASSET_V = "' + V + '"')
);
write("OFFGRD.html", (s) =>
  s.replace(
    /<!-- v\d+:[^>]+-->/,
    "<!-- v" +
      V +
      ": cold-boot paint from offgrd_shell_role before network (no rd-neutral black) -->"
  )
);
console.log("meta bump", V);
