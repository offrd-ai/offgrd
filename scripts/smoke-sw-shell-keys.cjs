/**
 * Smoke: app-shell cache keys must stay OFFGRD.html after a Playbook visit.
 * Usage: node scripts/smoke-sw-shell-keys.cjs
 *
 * Simulates: navigate OFFGRD.html → navigate OFFGRD-Playbook.html →
 * kill network → navigate OFFGRD.html. Shell keys must still serve OFFGRD.html;
 * Playbook stays under its own exact-URL key.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SCOPE = "https://getoffrd.com/gameday/";
const SHELL = SCOPE + "OFFGRD.html";
const PLAYBOOK = SCOPE + "OFFGRD-Playbook.html";
const QB = SCOPE + "OFFGRD-QB.html";
const INDEX = SCOPE + "index.html";

const store = new Map();

function bodyOf(res) {
  return res && res._body != null ? res._body : "";
}

function makeRes(body, ok) {
  const r = {
    ok: ok !== false,
    status: ok === false ? 500 : 200,
    _body: String(body),
    clone: function () { return makeRes(this._body, this.ok); },
  };
  return r;
}

function makeReq(url, mode) {
  return { url: url, mode: mode || "navigate", method: "GET", headers: { get: function () { return "text/html"; } } };
}

const cacheApi = {
  put: function (req, res) {
    const key = typeof req === "string" ? req : (req.url || String(req));
    store.set(key, res);
    return Promise.resolve();
  },
  match: function (req, opts) {
    const key = typeof req === "string" ? req : (req.url || String(req));
    if (store.has(key)) return Promise.resolve(store.get(key));
    if (opts && opts.ignoreSearch) {
      try {
        const want = new URL(key).origin + new URL(key).pathname;
        for (const [k, v] of store) {
          try {
            if (new URL(k).origin + new URL(k).pathname === want) return Promise.resolve(v);
          } catch (e) {}
        }
      } catch (e2) {}
    }
    return Promise.resolve(undefined);
  },
};

const sandbox = {
  self: {
    registration: { scope: SCOPE },
    location: { origin: "https://getoffrd.com" },
    addEventListener: function () {},
    skipWaiting: function () {},
    clients: { claim: function () {} },
    __OFFGRD_SW: null,
  },
  caches: {
    open: function () { return Promise.resolve(cacheApi); },
    match: function (req, opts) { return cacheApi.match(req, opts); },
    keys: function () { return Promise.resolve([]); },
  },
  fetch: function () { return Promise.reject(new Error("offline")); },
  Request: Request,
  Response: Response,
  URL: URL,
  Promise: Promise,
  console: console,
};
sandbox.self.caches = sandbox.caches;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "offgrd-sw.js"), "utf8"), sandbox);
const SW = sandbox.self.__OFFGRD_SW;
if (!SW) {
  console.error("FAIL load __OFFGRD_SW");
  process.exit(1);
}

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

check("OFFGRD.html is app shell", SW.isAppShellRequest(SHELL) === true);
check("/gameday/ is app shell", SW.isAppShellRequest(SCOPE) === true);
check("Playbook is not app shell", SW.isAppShellRequest(PLAYBOOK) === false);
check("QB is not app shell", SW.isAppShellRequest(QB) === false);
check("index.html is not app shell", SW.isAppShellRequest(INDEX) === false);

function wait() { return new Promise(function (r) { setImmediate(r); }); }

(async function () {
  SW.putRuntime(makeReq(SHELL), makeRes("OFFGRD-SHELL"));
  await wait();
  SW.putRuntime(makeReq(PLAYBOOK), makeRes("PLAYBOOK-DOC"));
  await wait();

  const shellKeys = [SHELL, SCOPE, new URL("./OFFGRD.html", SCOPE).href];
  for (let i = 0; i < shellKeys.length; i++) {
    const hit = await cacheApi.match(shellKeys[i], { ignoreSearch: true });
    check(
      "shell key still OFFGRD.html after Playbook nav: " + shellKeys[i],
      hit && bodyOf(hit) === "OFFGRD-SHELL",
      hit ? bodyOf(hit) : "miss"
    );
  }

  const pb = await cacheApi.match(PLAYBOOK);
  check("Playbook cached under its own key", pb && bodyOf(pb) === "PLAYBOOK-DOC", pb ? bodyOf(pb) : "miss");

  const offlineShell = await SW.matchShell(makeReq(SHELL));
  check("offline navigate OFFGRD.html serves OFFGRD.html", offlineShell && bodyOf(offlineShell) === "OFFGRD-SHELL", offlineShell ? bodyOf(offlineShell) : "miss");

  const offlinePb = await SW.matchShell(makeReq(PLAYBOOK));
  check("offline navigate Playbook serves Playbook", offlinePb && bodyOf(offlinePb) === "PLAYBOOK-DOC", offlinePb ? bodyOf(offlinePb) : "miss");

  const offlineUnknown = await SW.matchShell(makeReq(SCOPE + "missing.html"));
  check("offline unknown nav falls back to OFFGRD.html", offlineUnknown && bodyOf(offlineUnknown) === "OFFGRD-SHELL", offlineUnknown ? bodyOf(offlineUnknown) : "miss");

  if (fails) {
    console.error(fails + " failed");
    process.exit(1);
  }
  console.log("smoke-sw-shell-keys: all ok");
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
