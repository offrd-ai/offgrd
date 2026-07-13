#!/usr/bin/env node
/**
 * Syntax-check OFFGRD JS modules + inline <script> blocks in HTML.
 * Uses `node --check` so classic + type=module scripts both parse.
 * Fails the process on the first parse error (npm run check / CI).
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const SKIP = new Set(["xlsx.full.min.js", "supabase.js"]);
let tmpN = 0;

function fail(file, detail) {
  console.error("PARSE FAIL:", file);
  console.error(detail);
  process.exit(1);
}

function nodeCheck(source, label, asModule) {
  const ext = asModule ? ".mjs" : ".js";
  const tmp = path.join(os.tmpdir(), "offgrd-parse-" + process.pid + "-" + (tmpN++) + ext);
  fs.writeFileSync(tmp, source, "utf8");
  try {
    execFileSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  } catch (e) {
    const err = (e && (e.stderr || e.stdout || e.message)) || String(e);
    fail(label, String(err).trim());
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

function checkHtml(filePath, display) {
  const html = fs.readFileSync(filePath, "utf8");
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  let n = 0;
  while ((m = re.exec(html))) {
    const attrs = m[1] || "";
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const code = m[2];
    if (!code || !code.trim()) continue;
    n += 1;
    const isModule = /\btype\s*=\s*["']module["']/i.test(attrs);
    nodeCheck(code, display + " inline#" + n, isModule);
  }
}

const entries = fs.readdirSync(root);
let jsCount = 0;
let htmlCount = 0;

for (const name of entries) {
  if (SKIP.has(name)) continue;
  const full = path.join(root, name);
  if (!fs.statSync(full).isFile()) continue;
  if (/\.js$/i.test(name) && /^OFFGRD/i.test(name)) {
    nodeCheck(fs.readFileSync(full, "utf8"), name, false);
    jsCount += 1;
  } else if (/\.html$/i.test(name) && /^(OFFGRD|index)/i.test(name)) {
    checkHtml(full, name);
    htmlCount += 1;
  }
}

console.log("parse ok:", jsCount, "js,", htmlCount, "html");
