/* OFFGRD gameday service worker — sideline airplane survival.
   Host sends Cache-Control: max-age=0, so without this SW a reload offline
   cannot load scripts and the DC lands on a dead page.

   Layer 1 fix (v191): cold-boot offline failed because the navigation document
   was not reliably in cache (network-first only runtime-put scripts; Safari
   often won't cache.put a mode:navigate Request). Now:
   - precache HTML shell + first-party scripts at install (one-by-one)
   - explicit navigate handler with multi-key shell match (ignore search)
   - store documents via Request(url) not the navigate Request object

   KILL-SWITCH (zombie-SW incident): activate fetches sw-kill.json no-store;
   if { "kill": true } → delete all caches + unregister. Control plane never cached. */
var CACHE = "offgrd-gameday-v274";
var ASSET_V = "274";

/* Shell + boot graph — must be present for airplane cold-boot. */
var PRECACHE = [
  "./OFFGRD.html",
  "./icon.svg",
  "./manifest.json",
  "./OFFGRD-config.js?v=" + ASSET_V,
  "./OFFGRD-brand-persist.js?v=" + ASSET_V,
  "./supabase.js?v=" + ASSET_V,
  "./OFFGRD-cache-gate.js?v=" + ASSET_V,
  "./OFFGRD-render.js?v=" + ASSET_V,
  "./OFFGRD-pos-glossary.js?v=" + ASSET_V,
  "./OFFGRD-autoderive.js?v=" + ASSET_V,
  "./OFFGRD-matchup.js?v=" + ASSET_V,
  "./OFFGRD-scoutcards.js?v=" + ASSET_V,
  "./OFFGRD-tendencies.js?v=" + ASSET_V,
  "./OFFGRD-scout-report.js?v=" + ASSET_V,
  "./OFFGRD-week-autotest.js?v=" + ASSET_V,
  "./OFFGRD-weeklypackage.js?v=" + ASSET_V,
  "./OFFGRD-telestrate.js?v=" + ASSET_V,
  "./OFFGRD-redesign.js?v=" + ASSET_V,
  "./OFFGRD-shell.js?v=" + ASSET_V,
  "./OFFGRD-caller-outcome.js?v=" + ASSET_V,
  "./OFFGRD-caller-sit.js?v=" + ASSET_V,
  "./OFFGRD-caller-log.js?v=" + ASSET_V,
  "./OFFGRD-caller-sync.js?v=" + ASSET_V,
  "./OFFGRD-caller-analysis.js?v=" + ASSET_V,
  "./OFFGRD-caller-summary-llm.js?v=" + ASSET_V,
  "./OFFGRD-booth-ask.js?v=" + ASSET_V,
  "./OFFGRD-caller-select.js?v=" + ASSET_V,
  "./OFFGRD-dcaller.js?v=" + ASSET_V,
  "./OFFGRD-account.js?v=" + ASSET_V,
  "./OFFGRD-auth.js?v=" + ASSET_V,
  "./OFFGRD-cloud.js?v=" + ASSET_V,
  "./OFFGRD-cv-review.js?v=" + ASSET_V,
  "./OFFGRD-frame-capture.js?v=" + ASSET_V,
  "./OFFGRD-assist-import.js?v=" + ASSET_V,
  "./OFFGRD-qb-offline-queue.js?v=" + ASSET_V,
  "./OFFGRD-qb-cloud.js?v=" + ASSET_V,
  "./OFFGRD-role-gate.js?v=" + ASSET_V,
  "./OFFGRD-mobile.js?v=" + ASSET_V
];

function isControlPlane(url) {
  try {
    var p = new URL(url).pathname;
    return /\/offgrd-sw\.js$/i.test(p) || /\/sw-kill\.json$/i.test(p);
  } catch (e) {
    return false;
  }
}

function selfDestruct(reason) {
  try {
    console.warn("[offgrd-sw] kill-switch fired", reason || "");
  } catch (e) {}
  return caches.keys().then(function (keys) {
    return Promise.all(
      keys.map(function (k) {
        return caches.delete(k);
      })
    );
  }).then(function () {
    return self.registration.unregister();
  });
}

function checkKillSwitch() {
  return fetch("./sw-kill.json", { cache: "no-store", credentials: "same-origin" })
    .then(function (res) {
      if (!res || !res.ok) return false;
      return res.json().then(function (j) {
        if (j && j.kill === true) {
          return selfDestruct(j.reason || "sw-kill.json").then(function () {
            return true;
          });
        }
        return false;
      });
    })
    .catch(function () {
      return false;
    });
}

function absUrl(rel) {
  return new URL(rel, self.registration.scope).href;
}

/** Cache.put that Safari accepts — never pass a mode:navigate Request. */
function putUrl(cache, url, res) {
  try {
    return cache.put(new Request(url, { credentials: "same-origin" }), res);
  } catch (e) {
    return Promise.resolve();
  }
}

/** Store HTML under every key a cold reopen might ask for.
 *  Caller must pass a Response reserved for caching (clone before browser read). */
function putShell(cache, res) {
  var shell = absUrl("./OFFGRD.html");
  var bare = absUrl("OFFGRD.html");
  var scopeUrl = self.registration.scope; /* often …/gameday/ or …/ */
  var copies = [shell, bare, scopeUrl];
  try {
    var u = new URL(shell);
    copies.push(u.origin + u.pathname);
    copies.push(u.origin + u.pathname + u.search);
  } catch (e) {}
  /* de-dupe */
  var seen = {};
  var puts = [];
  var keys = [];
  for (var i = 0; i < copies.length; i++) {
    if (!copies[i] || seen[copies[i]]) continue;
    seen[copies[i]] = 1;
    keys.push(copies[i]);
  }
  for (var j = 0; j < keys.length; j++) {
    /* Clone before any put consumes the body. */
    var body = j === keys.length - 1 ? res : res.clone();
    puts.push(putUrl(cache, keys[j], body));
  }
  return Promise.all(puts);
}

function matchShell(req) {
  var candidates = [];
  try {
    var u = new URL(req.url);
    candidates.push(req.url);
    candidates.push(u.origin + u.pathname);
    if (u.search) candidates.push(u.origin + u.pathname); /* already */
    /* directory navigations → shell */
    if (/\/$/.test(u.pathname) || /\/gameday\/?$/i.test(u.pathname)) {
      candidates.push(u.origin + u.pathname.replace(/\/?$/, "/") + "OFFGRD.html");
    }
  } catch (e) {}
  candidates.push(absUrl("./OFFGRD.html"));
  candidates.push(absUrl("OFFGRD.html"));
  candidates.push(self.registration.scope);

  function next(i) {
    if (i >= candidates.length) {
      return caches.match(absUrl("./OFFGRD.html"), { ignoreSearch: true }).then(function (r) {
        return r || caches.open(CACHE).then(function (cache) {
          return cache.match(absUrl("./OFFGRD.html"), { ignoreSearch: true });
        });
      });
    }
    var key = candidates[i];
    return caches.match(key, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return next(i + 1);
    });
  }
  return next(0);
}

function precacheAll() {
  return caches.open(CACHE).then(function (cache) {
    /* One-by-one: addAll aborts the whole list on a single 404. */
    var chain = Promise.resolve();
    PRECACHE.forEach(function (path) {
      chain = chain.then(function () {
        return fetch(path, { credentials: "same-origin" })
          .then(function (res) {
            if (!res || !res.ok) return;
            var url = absUrl(path);
            if (/OFFGRD\.html$/i.test(path) || /OFFGRD\.html$/i.test(url)) {
              return putShell(cache, res);
            }
            var pathCopy = null;
            var pathKey = null;
            try {
              var u = new URL(url);
              if (u.search) {
                pathKey = u.origin + u.pathname;
                pathCopy = res.clone();
              }
            } catch (e) {}
            return putUrl(cache, url, res).then(function () {
              /* also pathname without ?v= for module skew */
              if (pathCopy && pathKey) return putUrl(cache, pathKey, pathCopy);
            });
          })
          .catch(function () {});
      });
    });
    return chain;
  });
}

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(precacheAll());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    checkKillSwitch().then(function (killed) {
      if (killed) return;
      return caches.keys().then(function (keys) {
        return Promise.all(
          keys.map(function (k) {
            if (k.indexOf("offgrd-gameday-") === 0 && k !== CACHE) {
              return caches.delete(k);
            }
          })
        );
      }).then(function () {
        return self.clients.claim();
      });
    })
  );
});

function sameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

function isHtmlNav(req) {
  if (req.mode === "navigate") return true;
  try {
    var accept = req.headers && req.headers.get("accept");
    if (accept && accept.indexOf("text/html") >= 0) return true;
    var p = new URL(req.url).pathname;
    if (/OFFGRD\.html$/i.test(p) || /\/gameday\/?$/i.test(p)) return true;
  } catch (e) {}
  return false;
}

/** Cache a Response already reserved for SW use (do not pass the browser copy). */
function putRuntime(req, res) {
  if (!res || !res.ok) return;
  caches.open(CACHE).then(function (cache) {
    if (isHtmlNav(req)) {
      putShell(cache, res);
      return;
    }
    var pathCopy = null;
    var pathKey = null;
    try {
      var u = new URL(req.url);
      if (u.search) {
        pathKey = u.origin + u.pathname;
        pathCopy = res.clone();
      }
    } catch (e) {}
    putUrl(cache, req.url, res).then(function () {
      if (pathCopy && pathKey) putUrl(cache, pathKey, pathCopy);
    });
  });
}

function cacheThenReturn(req, res) {
  try {
    putRuntime(req, res.clone());
  } catch (e) {}
  return res;
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  if (!sameOrigin(req.url)) return;
  if (isControlPlane(req.url)) return;

  /* Navigation / HTML shell — explicit path; offline must hit matchShell. */
  if (isHtmlNav(req)) {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          return cacheThenReturn(req, res);
        })
        .catch(function () {
          return matchShell(req).then(function (cached) {
            return cached || Response.error();
          });
        })
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then(function (res) {
        return cacheThenReturn(req, res);
      })
      .catch(function () {
        return caches.match(req.url, { ignoreSearch: true }).then(function (cached) {
          if (cached) return cached;
          try {
            var u = new URL(req.url);
            return caches.match(u.origin + u.pathname).then(function (c2) {
              return c2 || Response.error();
            });
          } catch (e2) {
            return Response.error();
          }
        });
      })
  );
});
