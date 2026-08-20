/**
 * BEFORE-fix probe. Models the current auth wiring over 60s idle.
 * Does not import product code — replica of today's loop only.
 *
 *   node scripts/probe-auth-reentry-before.cjs
 */
"use strict";

function simulate(opts) {
  opts = opts || {};
  const windowMs = opts.windowMs || 60000;
  const hydrateMs = opts.hydrateMs || 7000;
  const jwtMs = opts.jwtMs != null ? opts.jwtMs : 240000; /* 4 min — inside ensureFreshSession's 5-min window */
  const startWithTeam = opts.startWithTeam !== false;

  const counts = {
    authEvents: {},
    onUser: 0,
    myTeams: 0,
    finishProgramHydrate: 0,
    ensureFreshSession: 0,
    refreshSession: 0,
  };
  function note(ev) {
    counts.authEvents[ev] = (counts.authEvents[ev] || 0) + 1;
  }

  let now = 0;
  let expiresAt = now + jwtMs;
  const user = { id: "u1" };
  let sessionUser = startWithTeam ? user : null;
  let team = startWithTeam ? { id: "t1" } : null;
  const queue = [];
  let hydrating = false;
  let hydrateDoneAt = -1;

  function emit(ev) {
    queue.push({ t: now, ev: ev });
  }

  function ensureFreshSession() {
    counts.ensureFreshSession += 1;
    if (expiresAt - now < 60000 * 5) {
      counts.refreshSession += 1;
      expiresAt = now + jwtMs;
      /* supabase notifies asynchronously */
      queue.push({ t: now + 0, ev: "TOKEN_REFRESHED", async: true });
    }
    return user;
  }

  function myTeams() {
    counts.myTeams += 1;
    ensureFreshSession();
    return [{ id: "t1" }];
  }

  function finishProgramHydrate() {
    counts.finishProgramHydrate += 1;
    hydrating = true;
    hydrateDoneAt = now + hydrateMs;
  }

  function onUser() {
    counts.onUser += 1;
    sessionUser = user;
    ensureFreshSession();
    myTeams();
    team = { id: "t1" };
    finishProgramHydrate();
  }

  /* Current onAuth discards the event type. */
  function onAuth(ev) {
    note(ev);
    onUser();
  }

  /* Idle start: already signed in. A TOKEN_REFRESHED arrives (auto-refresh or leftover). */
  emit("TOKEN_REFRESHED");

  while (now <= windowMs) {
    if (hydrating && now >= hydrateDoneAt) hydrating = false;
    const due = [];
    const rest = [];
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].t <= now && !hydrating) due.push(queue[i]);
      else rest.push(queue[i]);
    }
    queue.length = 0;
    rest.forEach(function (q) { queue.push(q); });
    if (due.length) {
      onAuth(due[0].ev);
      for (let j = 1; j < due.length; j++) queue.push(due[j]);
    }
    now += 50;
  }

  return { counts: counts, sessionUser: sessionUser && sessionUser.id, team: team && team.id };
}

const fiveMin = simulate({ jwtMs: 240000, hydrateMs: 7000, windowMs: 60000 });
const hourJwt = simulate({ jwtMs: 3600000, hydrateMs: 7000, windowMs: 60000 });

console.log("BEFORE 60s idle — JWT 5min (always inside 5-min refresh window, hydrate 7s):");
console.log(JSON.stringify(fiveMin.counts, null, 2));
console.log("BEFORE 60s idle — JWT 3600s (healthy token, hydrate 7s):");
console.log(JSON.stringify(hourJwt.counts, null, 2));
console.log("ok  probe-auth-reentry-before");
