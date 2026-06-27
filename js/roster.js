/**
 * js/roster.js
 * -----------------------------------------------------------------------------
 * 로스터(후보 명단) 공용 헬퍼. index(공개 페이지)와 admin(관리자) 양쪽에서 사용.
 *
 * 우선순위: localStorage 오버라이드(관리자 편집본) → data/roster.js 기본값.
 * -----------------------------------------------------------------------------
 */
(function (global) {
  "use strict";
  var LS_KEY = "matchpoint.roster.v1";

  function getDefault() {
    return Array.isArray(global.MATCHPOINT_ROSTER)
      ? global.MATCHPOINT_ROSTER.map(function (x) { return Object.assign({}, x); })
      : [];
  }

  function getRoster() {
    try {
      var raw = global.localStorage && localStorage.getItem(LS_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    } catch (e) { /* 무시하고 기본값 */ }
    return getDefault();
  }

  function saveRoster(arr) {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  }

  function clearOverride() {
    localStorage.removeItem(LS_KEY);
  }

  function hasOverride() {
    try { return !!(global.localStorage && localStorage.getItem(LS_KEY)); }
    catch (e) { return false; }
  }

  global.Roster = {
    getRoster: getRoster,
    saveRoster: saveRoster,
    clearOverride: clearOverride,
    hasOverride: hasOverride,
    getDefault: getDefault,
  };
})(window);
