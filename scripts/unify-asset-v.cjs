"use strict";
const fs = require("fs");
const path = require("path");
const V = process.argv[2] || "183";
const htmlPath = path.join(__dirname, "..", "OFFGRD.html");
let h = fs.readFileSync(htmlPath, "utf8");
const before = [...new Set([...h.matchAll(/[?&]v=(\d+)/g)].map((m) => m[1]))];
console.log("before:", before.join(", "));
h = h.replace(
  /(<(?:script|link)\b[^>]*(?:src|href)=["'])([^"']+)(["'][^>]*>)/gi,
  function (full, a, url, c) {
    if (/^https?:/i.test(url)) return full;
    return a + url.replace(/([?&])v=\d+/g, "$1v=" + V) + c;
  }
);
/* Dynamic tryLoad("….js?v=N") first-party strings (xlsx local pin, etc.) */
h = h.replace(/tryLoad\(\s*["']([^"']+\.js)\?v=\d+["']/g, function (full, file) {
  if (/^https?:/i.test(file)) return full;
  return 'tryLoad("' + file + "?v=" + V + '"';
});
h = h.replace(/<!-- v\d+:/, "<!-- v" + V + ":");
fs.writeFileSync(htmlPath, h);
const after = [...new Set([...h.matchAll(/[?&]v=(\d+)/g)].map((m) => m[1]))];
console.log("after:", after.join(", "));
