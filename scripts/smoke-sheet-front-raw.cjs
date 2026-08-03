/**
 * Smoke: Excel DEF FRONT "4-3" / "3-4" must not become locale dates.
 * Exercises the same rules as OFFGRD.html sheetToCsvRaw.
 */
function cellText(cell) {
  if (!cell) return "";
  let v = "";
  if (cell.w != null && String(cell.w).length) v = String(cell.w);
  else if (cell.t === "d" && cell.v) {
    const d = cell.v instanceof Date ? cell.v : new Date(cell.v);
    if (!isNaN(d.getTime())) v = String(d.getMonth() + 1) + "-" + String(d.getDate());
    else v = String(cell.v);
  } else if (cell.v == null) v = "";
  else v = String(cell.v);
  return v;
}

const cases = [
  { name: "display text 4-3", cell: { t: "d", v: new Date(2024, 3, 3), w: "4-3" }, want: "4-3" },
  { name: "display text 3-4", cell: { t: "d", v: new Date(2024, 2, 4), w: "3-4" }, want: "3-4" },
  { name: "date without w → m-d", cell: { t: "d", v: new Date(2024, 3, 3) }, want: "4-3" },
  { name: "date without w 3-4", cell: { t: "d", v: new Date(2024, 2, 4) }, want: "3-4" },
  { name: "plain string", cell: { t: "s", v: "4-3 OVER" }, want: "4-3 OVER" },
  { name: "must not be APR", cell: { t: "d", v: new Date(2024, 3, 3), w: "4-3" }, wantNot: /APR|Apr|March|Mar/i },
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
console.log("PASS sheet front raw —", cases.length, "cases; 4-3 round-trips as 4-3");
