/**
 * Playbook drag: source contract + Chrome CDP mouse (not dispatchEvent).
 * tapDrags can be green while pointerdown→innerHTML wipe drops the gesture.
 *   node scripts/smoke-playbook-drag.cjs
 */
"use strict";
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "OFFGRD-Playbook.html"), "utf8");
const FIXTURE = path.join(ROOT, "scripts", "fixtures", "pb-field-drag.html");

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

check("Playbook captures #field before renderAll wipe", /function captureField/.test(HTML) && /setPointerCapture\(e\.pointerId\)/.test(HTML));
check("drag start calls captureField before renderAll", /DRAG=\{kind:"obj",o:hit\};\s*captureField\(e\);\s*renderAll\(\)/.test(HTML));
check("pointermove is on window, not only the wiped svg", /window\.addEventListener\("pointermove",onMove/.test(HTML));
check("pointerdown uses non-passive listener", /addEventListener\("pointerdown",onDown,\s*\{passive:false\}/.test(HTML));
check("pointercancel ends the drag", /addEventListener\("pointercancel",onUp\)/.test(HTML));
check("svg-only pointermove is gone", !/svg\.addEventListener\("pointermove",onMove\)/.test(HTML));

const fixture = fs.readFileSync(FIXTURE, "utf8");
check("fixture wipes innerHTML on down (Playbook renderAll)", /svg\.innerHTML=/.test(fixture) && /captureField\(e\);\s*render\(\);/.test(fixture));
check("fixture move is on window", /window\.addEventListener\("pointermove",onMove/.test(fixture));

function chromePath() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const home = process.env.LOCALAPPDATA || "";
  const cands = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(home, "Google", "Chrome", "Application", "chrome.exe"),
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ];
  return cands.find(function (p) { return p && fs.existsSync(p); }) || "";
}

function freePort() {
  return new Promise(function (resolve, reject) {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", function () {
      const p = s.address().port;
      s.close(function () { resolve(p); });
    });
    s.on("error", reject);
  });
}

function waitJson(url, tries) {
  return new Promise(function (resolve, reject) {
    let left = tries || 40;
    const tick = function () {
      http.get(url, function (res) {
        let b = "";
        res.on("data", function (d) { b += d; });
        res.on("end", function () {
          try { resolve(JSON.parse(b)); }
          catch (e) {
            if (--left <= 0) reject(e);
            else setTimeout(tick, 100);
          }
        });
      }).on("error", function () {
        if (--left <= 0) reject(new Error("CDP not up: " + url));
        else setTimeout(tick, 100);
      });
    };
    tick();
  });
}

function openCdp(wsUrl) {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(wsUrl);
    let n = 0;
    const pending = new Map();
    ws.addEventListener("open", function () {
      resolve({
        send: function (method, params) {
          return new Promise(function (res, rej) {
            const id = ++n;
            pending.set(id, { res: res, rej: rej });
            ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
          });
        },
        close: function () { try { ws.close(); } catch (e) {} }
      });
    });
    ws.addEventListener("message", function (ev) {
      const msg = JSON.parse(String(ev.data));
      if (!msg.id || !pending.has(msg.id)) return;
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message || JSON.stringify(msg.error)));
      else p.res(msg.result);
    });
    ws.addEventListener("error", function (e) { reject(e.error || e); });
  });
}

async function runBrowser() {
  const chrome = chromePath();
  if (!chrome) throw new Error("Chrome not found — set CHROME_PATH");
  const httpPort = await freePort();
  const cdpPort = await freePort();
  const server = http.createServer(function (req, res) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(fixture);
  });
  await new Promise(function (res) { server.listen(httpPort, "127.0.0.1", res); });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-drag-"));
  const url = "http://127.0.0.1:" + httpPort + "/";
  const child = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=" + dir,
    "--remote-debugging-port=" + cdpPort,
    "--remote-debugging-address=127.0.0.1",
    url
  ], { stdio: "ignore" });
  let session;
  try {
    const ver = await waitJson("http://127.0.0.1:" + cdpPort + "/json/version");
    const pages = await waitJson("http://127.0.0.1:" + cdpPort + "/json/list");
    const page = (pages || []).find(function (p) { return p.type === "page" && p.webSocketDebuggerUrl; }) || pages[0];
    if (!page || !page.webSocketDebuggerUrl) throw new Error("no CDP page (" + (ver && ver.Browser) + ")");
    session = await openCdp(page.webSocketDebuggerUrl);
    await session.send("Runtime.enable");
    await session.send("Page.enable");
    await session.send("Page.navigate", { url: url });
    let ready = "";
    let tries = 0;
    while (tries < 50) {
      const ev = await session.send("Runtime.evaluate", {
        expression: "typeof window.__dragState",
        returnByValue: true
      });
      ready = ev && ev.result ? ev.result.value : "";
      if (ready === "function") break;
      await new Promise(function (r) { setTimeout(r, 100); });
      tries += 1;
    }
    if (ready !== "function") throw new Error("fixture did not boot (__dragState=" + ready + ")");
    const box = await session.send("Runtime.evaluate", {
      expression: "JSON.stringify(document.getElementById('field').getBoundingClientRect())",
      returnByValue: true
    });
    if (!box || !box.result || box.result.value == null) throw new Error("no field rect");
    const r = JSON.parse(box.result.value);
    const startX = r.left + (200 / 1000) * r.width;
    const startY = r.top + (200 / 640) * r.height;
    const endX = r.left + (320 / 1000) * r.width;
    const endY = r.top + (280 / 640) * r.height;
    await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: startX, y: startY });
    await session.send("Input.dispatchMouseEvent", {
      type: "mousePressed", x: startX, y: startY, button: "left", clickCount: 1, buttons: 1
    });
    let i;
    for (i = 1; i <= 8; i++) {
      const t = i / 8;
      await session.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: startX + (endX - startX) * t,
        y: startY + (endY - startY) * t,
        button: "left",
        buttons: 1
      });
    }
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseReleased", x: endX, y: endY, button: "left", clickCount: 1, buttons: 0
    });
    const after = await session.send("Runtime.evaluate", {
      expression: "JSON.stringify(window.__dragState())",
      returnByValue: true
    });
    const st = JSON.parse(after.result.value);
    check("CDP drag moved X (not a synthetic Event)", st.x > 250 && st.y > 230, JSON.stringify(st));
  } finally {
    if (session) session.close();
    try { child.kill(); } catch (e) {}
    try { server.close(); } catch (e2) {}
  }
}

function isCdpUnavailable(err) {
  const msg = String(err && err.message ? err.message : err);
  return /CDP not up|Chrome not found|ECONNREFUSED|connect ECONNRESET/.test(msg);
}

runBrowser().then(function () {
  if (fails) {
    console.error(fails + " FAIL");
    process.exit(1);
  }
  console.log("ok  smoke-playbook-drag");
}).catch(function (err) {
  const detail = err && err.message ? err.message : err;
  if (isCdpUnavailable(err)) {
    console.warn("skip browser drag — " + detail);
    if (fails) {
      console.error(fails + " FAIL");
      process.exit(1);
    }
    console.log("ok  smoke-playbook-drag (browser skipped)");
    process.exit(0);
  }
  console.error("FAIL browser drag — " + detail);
  process.exit(1);
});
