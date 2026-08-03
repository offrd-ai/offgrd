/**
 * Smoke: Excel DEF FRONT must not become locale dates in sheetToCsvRaw rules.
 * Date cells reconstruct m-d; locale .w ("3-Apr") is reversed to 4-3.
 */
function normalizeDefFront(value) {
  if (value == null) return value;
  const s = String(value).trim();
  if (!s) return s;
  const months = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  };
  let m = s.match(/^(\d{1,2})-([A-Za-z]{3,4})(.*)$/);
  if (m && months[m[2].toLowerCase()] != null) {
    return String(months[m[2].toLowerCase()]) + "-" + String(parseInt(m[1], 10)) + (m[3] || "");
  }
  m = s.match(/^([A-Za-z]{3,4})-(\d{1,2})(.*)$/);
  if (m && months[m[1].toLowerCase()] != null) {
    return String(months[m[1].toLowerCase()]) + "-" + String(parseInt(m[2], 10)) + (m[3] || "");
  }
  return s;
}
function looksLocaleFrontDate(w) {
  return /^\d{1,2}-[A-Za-z]{3,4}\b/i.test(w) || /^[A-Za-z]{3,4}-\d{1,2}\b/i.test(w);
}
function cellText(cell) {
  if (!cell) return "";
  let v = "";
  if (cell.t === "d" && cell.v) {
    const d = cell.v instanceof Date ? cell.v : new Date(cell.v);
    if (!isNaN(d.getTime())) v = String(d.getMonth() + 1) + "-" + String(d.getDate());
    else v = String(cell.v);
  } else if (cell.w != null && String(cell.w).length) {
    const w = String(cell.w);
    v = looksLocaleFrontDate(w) ? normalizeDefFront(w) : w;
  } else if (cell.v == null) v = "";
  else {
    const raw = String(cell.v);
    v = looksLocaleFrontDate(raw) ? normalizeDefFront(raw) : raw;
  }
  return v;
}

const cases = [
  { name: "date cell ignores locale .w", cell: { t: "d", v: new Date(2024, 3, 3), w: "3-Apr" }, want: "4-3" },
  { name: "date cell 3-4", cell: { t: "d", v: new Date(2024, 2, 4), w: "4-Mar" }, want: "3-4" },
  { name: "date without w", cell: { t: "d", v: new Date(2024, 3, 3) }, want: "4-3" },
  { name: "locale .w on number serial", cell: { t: "n", v: 45385, w: "3-Apr" }, want: "4-3" },
  { name: "locale .w 4-Mar", cell: { t: "n", v: 1, w: "4-Mar" }, want: "3-4" },
  { name: "display text 4-3 kept", cell: { t: "s", v: "4-3", w: "4-3" }, want: "4-3" },
  { name: "plain string OVER", cell: { t: "s", v: "4-3 OVER" }, want: "4-3 OVER" },
  { name: "must not be APR", cell: { t: "d", v: new Date(2024, 3, 3), w: "3-Apr" }, wantNot: /APR|Apr|Mar|March/i },
];

let fails = 0;
for (const c of cases) {
  const got = cellText(c.cell);
  if (c.want != null && got !== c.want) {
    console.error("FAIL", c.name, "got", got, "want", c.want);
    fails++;
  }
  if (c.wantNot && c.wantNot.test(got)) {
    console.error("FAIL", c.name, "got locale date", got);
    fails++;
  }
}
if (fails) process.exit(1);
console.log("PASS sheet front raw —", cases.length, "cases; 3-Apr → 4-3");
