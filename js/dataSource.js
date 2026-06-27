/**
 * dataSource.js  (프론트엔드 — 얇은 클라이언트)
 * -----------------------------------------------------------------------------
 * 화면(app.js)이 데이터 출처를 모르게 하는 경계 모듈.
 *
 * 데이터 합성 방식:
 *   - 후보 명단/이름/사진/부문 = 로스터(운영자 관리, js/roster.js) 에서.
 *   - 득표수 = 서버리스 프록시 `/api/scores` 가 id별로 제공(실연동 시 각 앱 합산).
 *     프록시가 없으면(file:// 등) 로스터의 데모 득표를 사용.
 *   ※ 득표 "숫자"는 화면에 노출하지 않습니다(순위 정렬에만 사용).
 *
 * 보안: 브라우저엔 API Key 를 두지 않음. 키 사용은 프록시(api/scores.js)에서만.
 *
 * 내부 도메인 모델 (Entry):
 *   { id, name, group|null, imageUrl|null, totalVotes(정렬용), updatedAt }
 * fetchScores() → { entries: Entry[], sources: [], fetchedAt }
 * -----------------------------------------------------------------------------
 */
(function (global) {
  "use strict";

  var CONFIG = {
    endpoint: "/api/scores", // 득표 프록시 (Vercel/Netlify 서버리스)
    timeoutMs: 8000,
  };

  function toSafeCount(n) {
    var v = Number(n);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  }

  function totalOf(e) {
    if (typeof e.totalVotes === "number") return toSafeCount(e.totalVotes);
    if (e.votesBySource) {
      return Object.keys(e.votesBySource).reduce(function (s, k) {
        return s + toSafeCount(e.votesBySource[k]);
      }, 0);
    }
    return 0;
  }

  /**
   * 점수 데이터를 가져온다.
   *
   * 명단의 원천은 프록시(/api/scores → 리매치 API)입니다. 프록시가 이름을 포함한
   * entry 를 주면 그대로 사용하고, 프록시가 미가용(file:// 등)일 때만 로스터 데모로
   * 폴백합니다. (레거시: 프록시가 이름 없이 id별 득표만 주면 로스터에 득표만 적용)
   *
   * @returns {Promise<{ entries: Entry[], sources: [], fetchedAt: string }>}
   */
  async function fetchScores() {
    var votesById = null; // 레거시: 이름 없는 프록시 응답의 id별 득표

    try {
      var raw = await fetchJSON(CONFIG.endpoint);
      if (raw && Array.isArray(raw.entries)) {
        // 이름이 있는 entry → 프록시를 명단 원천으로 그대로 사용
        var named = raw.entries.filter(function (e) {
          return e && typeof e.id === "string" && typeof e.name === "string" && e.name;
        });
        if (named.length) {
          var entries = named.map(function (e) {
            return {
              id: e.id,
              name: e.name,
              group: e.group != null ? String(e.group) : null,
              imageUrl: typeof e.imageUrl === "string" && e.imageUrl ? e.imageUrl : null,
              totalVotes: totalOf(e),
              updatedAt: e.updatedAt || new Date().toISOString(),
            };
          });
          return {
            entries: entries,
            sources: Array.isArray(raw.sources) ? raw.sources : [],
            fetchedAt: raw.fetchedAt || new Date().toISOString(),
          };
        }
        // 이름 없는 응답 → id별 득표만 추출해 로스터에 적용
        votesById = {};
        raw.entries.forEach(function (e) {
          if (e && typeof e.id === "string") votesById[e.id] = totalOf(e);
        });
      }
    } catch (err) {
      if (!isProxyUnavailable(err)) throw err;
      // 프록시 미가용 → 로스터 데모로 폴백
    }

    return fromRoster(votesById);
  }

  // 로스터(운영자 명단) 기반 폴백. votesById 가 있으면 그 득표를, 없으면 데모 득표 사용.
  function fromRoster(votesById) {
    var roster = global.Roster ? global.Roster.getRoster() : [];
    var entries = roster
      .filter(function (c) { return c && typeof c.id === "string" && typeof c.name === "string"; })
      .map(function (c) {
        var votes = votesById && Object.prototype.hasOwnProperty.call(votesById, c.id)
          ? votesById[c.id]
          : toSafeCount(c.votes);
        return {
          id: c.id,
          name: c.name,
          group: c.group != null ? String(c.group) : null,
          imageUrl: typeof c.imageUrl === "string" && c.imageUrl ? c.imageUrl : null,
          totalVotes: votes,
          updatedAt: new Date().toISOString(),
        };
      });
    return { entries: entries, sources: [], fetchedAt: new Date().toISOString() };
  }

  function isProxyUnavailable(err) {
    return (
      err &&
      (err.name === "TypeError" || err.code === "ENDPOINT_NOT_FOUND")
    );
  }

  async function fetchJSON(url) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, CONFIG.timeoutMs);
    try {
      var res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.status === 404) {
        var e = new Error("proxy not found");
        e.code = "ENDPOINT_NOT_FOUND";
        throw e;
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  global.DataSource = { fetchScores: fetchScores };
})(window);
