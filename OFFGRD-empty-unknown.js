/**
 * [] is never authoritative.
 *
 * An empty result may only clear a cache or disable a fallback when
 * something independent confirms emptiness — a count, an explicit server
 * flag, a successful full fetch that independently says empty.
 * Absent that, empty means unknown, and unknown keeps the local data.
 *
 * Library clobber, Friday search, empty SNAP_CORPUS: one mistake, three doors.
 */
(function (global) {
  "use strict";

  /**
   * The only production source for confirmedEmpty:true.
   * `count` is the PostgREST exact count (or a matching head count)
   * from the same successful query that returned `rows`.
   * count == null / undefined is unknown — never confirm.
   */
  function fromExactCount(rows, count) {
    if (!Array.isArray(rows) || rows.length !== 0) return false;
    return count === 0;
  }

  function isUnknownEmpty(remote, opts) {
    opts = opts || {};
    if (!Array.isArray(remote) || remote.length > 0) return false;
    return !opts.confirmedEmpty;
  }

  function adoptRemoteList(remote, prior, opts) {
    opts = opts || {};
    var loc = Array.isArray(prior) ? prior : [];
    if (!Array.isArray(remote)) return loc;
    if (remote.length > 0) return remote;
    if (opts.confirmedEmpty) return remote;
    return loc.length ? loc : remote;
  }

  var API = {
    fromExactCount: fromExactCount,
    isUnknownEmpty: isUnknownEmpty,
    adoptRemoteList: adoptRemoteList,
  };

  global.OFFGRD_EMPTY_UNKNOWN = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
