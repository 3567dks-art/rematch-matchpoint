/**
 * app.js
 * -----------------------------------------------------------------------------
 * UI 렌더링 및 앱 진입점 (투표 합산 랭킹).
 * 데이터 출처는 알지 못하며, DataSource.fetchScores() 가 반환하는
 * 내부 도메인 모델(Entry / Source)만 신뢰합니다. (dataSource.js 모델 정의 참고)
 *
 * 표시 정책: 앱별 투표수는 노출하지 않고 "합산 총 투표수"만 보여줍니다.
 * 갱신: 자동 폴링 없음 — 최초 1회 로드 후 새로고침 버튼으로만 갱신(매크로 방지 포함).
 * 보안: 외부 문자열은 항상 textContent 로 삽입 (XSS 방지).
 * -----------------------------------------------------------------------------
 */
(function () {
  "use strict";

  // 화면 상태 (필터/검색 시 재요청 없이 재렌더용)
  let state = { entries: [], sources: [], fetchedAt: null };
  let selectedCategory = null; // 선택된 부문(트롯/KPOP). null = 전체
  // 직전 순위를 기억해 순위 변동(▲▼) 표시
  let prevRankById = new Map();

  // 새로고침 제어 (수동 전용 + 매크로/봇 억제)
  const REFRESH_COOLDOWN_MS = 6000; // 연타 방지 쿨다운
  let loading = false;
  let cooldownUntil = 0;
  let cooldownTimer = null;
  let recentClicks = []; // 짧은 시간 내 클릭 누적 → 과도하면 장기 잠금
  let lockUntil = 0;

  // ── DOM 참조 ────────────────────────────────────────────────────────────────
  const el = {
    list: document.getElementById("ranking-list"),
    podium: document.getElementById("podium"),
    rankingSub: document.getElementById("ranking-sub"),
    empty: document.getElementById("empty-state"),
    emptyText: document.getElementById("empty-text"),
    updatedAt: document.getElementById("updated-at"),
    refreshBtn: document.getElementById("refresh-btn"),
    catTabs: document.getElementById("cat-tabs"),
    filterSearch: document.getElementById("filter-search"),
    year: document.getElementById("year"),
  };

  const nf = new Intl.NumberFormat("ko-KR");

  // ── 정렬/순위 계산 ────────────────────────────────────────────────────────────
  function rankEntries(entries) {
    const sorted = [...entries].sort((a, b) => b.totalVotes - a.totalVotes);
    return sorted.map((e, i) => ({ ...e, rank: i + 1 }));
  }

  function rankDelta(id, currentRank) {
    if (!prevRankById.has(id)) return 0;
    return prevRankById.get(id) - currentRank; // >0 이면 상승(▲)
  }

  // ── 작은 빌더들 ───────────────────────────────────────────────────────────────
  const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

  // 부문 표시문구 매핑 (내부 데이터 값은 그대로, 화면 표시만 변경)
  const GROUP_LABELS = { KPOP: "아이돌", 트롯: "대중가수" };
  function groupLabel(group) {
    return GROUP_LABELS[group] || group;
  }

  function pctText(votes, total) {
    if (!total || total <= 0) return "0%";
    return ((votes / total) * 100).toFixed(1) + "%";
  }

  function rankBadge(rank, delta) {
    const wrap = document.createElement("span");
    wrap.className = "rank";
    const num = document.createElement("span");
    if (MEDALS[rank]) {
      num.className = "rank-medal";
      num.textContent = MEDALS[rank];
    } else {
      num.className = "rank-num";
      num.textContent = rank;
    }
    wrap.append(num);
    if (delta !== 0) {
      const d = document.createElement("span");
      d.className = "rank-delta " + (delta > 0 ? "up" : "down");
      d.textContent = (delta > 0 ? "▲" : "▼") + Math.abs(delta);
      wrap.append(d);
    }
    return wrap;
  }

  // 썸네일: 사진(imageUrl)이 있으면 이미지, 없으면 이름 첫 글자 아바타
  function thumb(entry) {
    const box = document.createElement("div");
    box.className = "rank-thumb";
    if (entry.imageUrl) {
      const img = document.createElement("img");
      img.src = entry.imageUrl;
      img.alt = entry.name;
      img.loading = "lazy";
      // 깨진 이미지면 이니셜로 폴백
      img.addEventListener("error", () => {
        img.remove();
        box.append(initial(entry.name));
        box.classList.add("is-initial");
      });
      box.append(img);
    } else {
      box.append(initial(entry.name));
      box.classList.add("is-initial");
    }
    return box;
  }
  function initial(name) {
    const s = document.createElement("span");
    s.textContent = (name || "?").trim().charAt(0) || "?";
    return s;
  }

  // 득표 비율 막대 (1위 대비 상대 길이)
  function totalBar(entry, maxTotal) {
    const wrap = document.createElement("div");
    wrap.className = "total-bar";
    const fill = document.createElement("div");
    fill.className = "total-bar-fill";
    const pct = maxTotal > 0 ? Math.round((entry.totalVotes / maxTotal) * 100) : 0;
    fill.style.width = pct + "%";
    wrap.append(fill);
    return wrap;
  }

  // ── 랭킹 행 렌더 (후보별 현재 득표수 + 백분율) ───────────────────────────────
  function renderRow(entry, maxTotal, catTotal) {
    const row = document.createElement("article");
    row.className = "rank-row" + (entry.rank <= 3 ? " is-top is-top-" + entry.rank : "");

    const pos = document.createElement("div");
    pos.className = "rank-pos";
    pos.append(rankBadge(entry.rank, rankDelta(entry.id, entry.rank)));

    const info = document.createElement("div");
    info.className = "rank-info";
    const name = document.createElement("div");
    name.className = "rank-name";
    name.textContent = entry.name;
    // 득표수를 가수 이름 바로 아래에 배치
    const votes = document.createElement("div");
    votes.className = "rank-votes";
    const num = document.createElement("span");
    num.className = "rank-votes-num";
    num.textContent = nf.format(entry.totalVotes);
    const unit = document.createElement("span");
    unit.className = "rank-votes-unit";
    unit.textContent = "표";
    votes.append(num, unit);
    info.append(name, votes);

    // 하단 전체폭 줄: 퍼센트 + 진행바
    const score = document.createElement("div");
    score.className = "rank-score";
    const pct = document.createElement("span");
    pct.className = "rank-pct";
    pct.textContent = pctText(entry.totalVotes, catTotal);
    score.append(pct, totalBar(entry, maxTotal));

    row.append(pos, thumb(entry), info, score);
    return row;
  }

  // ── TOP 3 포디움 카드 (크게 강조 + 메달) ─────────────────────────────────────
  function renderPodiumCard(entry, catTotal) {
    const card = document.createElement("article");
    card.className = "podium-card is-" + entry.rank;

    const medal = document.createElement("div");
    medal.className = "podium-medal";
    medal.textContent = MEDALS[entry.rank] || entry.rank;

    const ph = thumb(entry);
    ph.classList.add("podium-thumb");

    const name = document.createElement("div");
    name.className = "podium-name";
    name.textContent = entry.name;

    card.append(medal, ph, name);

    const votes = document.createElement("div");
    votes.className = "podium-votes";
    const num = document.createElement("span");
    num.textContent = nf.format(entry.totalVotes);
    const unit = document.createElement("span");
    unit.className = "unit";
    unit.textContent = "표";
    votes.append(num, unit);

    const pct = document.createElement("div");
    pct.className = "podium-pct";
    pct.textContent = pctText(entry.totalVotes, catTotal);

    card.append(votes, pct);
    return card;
  }

  // ── 부문 탭 (트롯 / KPOP) ──────────────────────────────────────────────────
  function categoriesInData() {
    return Array.from(new Set(state.entries.map((e) => e.group).filter(Boolean)));
  }

  function renderTabs() {
    const cats = categoriesInData();
    if (cats.length === 0) {
      el.catTabs.replaceChildren();
      el.catTabs.hidden = true;
      selectedCategory = null;
      return;
    }
    el.catTabs.hidden = false;
    if (!selectedCategory || !cats.includes(selectedCategory)) {
      selectedCategory = cats[0];
    }
    el.catTabs.replaceChildren(
      ...cats.map((c) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cat-tab" + (c === selectedCategory ? " active" : "");
        btn.textContent = groupLabel(c);
        btn.setAttribute("aria-pressed", c === selectedCategory ? "true" : "false");
        btn.addEventListener("click", () => {
          if (selectedCategory === c) return;
          selectedCategory = c;
          renderTabs();
          render();
        });
        return btn;
      })
    );
  }

  // ── 전체 렌더 ─────────────────────────────────────────────────────────────────
  function render() {
    // 부문 내에서 순위 매김 (선택된 부문 기준 1위부터)
    const inCat = selectedCategory
      ? state.entries.filter((e) => (e.group || "") === selectedCategory)
      : state.entries;
    const ranked = rankEntries(inCat);
    const catTotal = ranked.reduce((s, e) => s + e.totalVotes, 0);
    const maxTotal = ranked.length ? ranked[0].totalVotes : 0;
    const q = el.filterSearch.value.trim().toLowerCase();

    if (q) {
      // 검색 중: 포디움 숨기고 매칭 결과를 리스트로
      el.podium.hidden = true;
      el.podium.replaceChildren();
      const matched = ranked.filter((e) => e.name.toLowerCase().includes(q));
      el.list.replaceChildren(...matched.map((e) => renderRow(e, maxTotal, catTotal)));
    } else {
      // TOP 3 포디움 + 나머지(4위~) 리스트
      const top3 = ranked.slice(0, 3);
      const rest = ranked.slice(3);
      el.podium.hidden = top3.length === 0;
      el.podium.replaceChildren(...top3.map((e) => renderPodiumCard(e, catTotal)));
      el.list.replaceChildren(...rest.map((e) => renderRow(e, maxTotal, catTotal)));
    }

    // 부제: "트롯 부문 · N명"
    if (el.rankingSub) {
      const cat = selectedCategory ? groupLabel(selectedCategory) + " 부문" : "전체";
      el.rankingSub.textContent = `${cat} · ${ranked.length}명`;
    }

    const isEmpty = ranked.length === 0;
    el.empty.hidden = !isEmpty;
    if (isEmpty) {
      el.emptyText.textContent =
        state.entries.length === 0
          ? "표시할 후보가 없습니다."
          : "조건에 맞는 후보가 없습니다.";
    }

    // 다음 렌더의 순위 변동 비교를 위해 현재 순위 저장 (부문별 id 기준)
    prevRankById = new Map(ranked.map((e) => [e.id, e.rank]));
  }

  // ── 데이터 로드 (실패 경로 포함) ──────────────────────────────────────────────
  async function load() {
    if (loading) return;
    loading = true;
    updateRefreshBtn();
    setStatus("loading", "불러오는 중…");
    try {
      const result = await window.DataSource.fetchScores();
      state.entries = Array.isArray(result.entries) ? result.entries : [];
      state.sources = Array.isArray(result.sources) ? result.sources : [];
      state.fetchedAt = result.fetchedAt;
      renderTabs();
      render();
      setStatus("ok", "");
      el.updatedAt.textContent = "업데이트: " + formatTime(state.fetchedAt);
    } catch (err) {
      console.error("[MatchPoint] 데이터 로드 실패:", err);
      setStatus("error", "데이터를 불러오지 못했습니다");
    } finally {
      loading = false;
      updateRefreshBtn();
    }
  }

  // ── 새로고침: 수동 전용 + 매크로/봇 억제 ────────────────────────────────────────
  // 방어선:
  //  1) 실사용자 클릭만 허용 — 스크립트가 dispatch한 합성 클릭은 event.isTrusted=false
  //  2) 쿨다운 — 한 번 누르면 일정 시간 비활성(연타/매크로 차단)
  //  3) 단시간 과다 클릭 누적 시 장기 잠금
  //  ※ 클라이언트 방어는 우회 가능 → 서버(api/scores.js)의 IP 레이트리밋이 최종 방어선.
  function onRefresh(e) {
    // 1) 신뢰할 수 없는(스크립트 발생) 이벤트 차단
    if (e && e.isTrusted === false) {
      console.warn("[MatchPoint] 비신뢰 클릭 무시(매크로 의심).");
      return;
    }
    const now = Date.now();
    if (loading) return;
    if (now < lockUntil) return;            // 장기 잠금 중
    if (now < cooldownUntil) return;        // 쿨다운 중

    // 3) 과다 클릭 감지 (10초 내 5회 초과 → 30초 잠금)
    recentClicks = recentClicks.filter((t) => now - t < 10000);
    recentClicks.push(now);
    if (recentClicks.length > 5) {
      lockUntil = now + 30000;
      recentClicks = [];
      setStatus("error", "잠시 후 다시 시도해 주세요");
      updateRefreshBtn();
      return;
    }

    cooldownUntil = now + REFRESH_COOLDOWN_MS;
    load();
    tickRefreshBtn();
  }

  function updateRefreshBtn() {
    const now = Date.now();
    const lockRemain = Math.ceil((lockUntil - now) / 1000);
    const coolRemain = Math.ceil((cooldownUntil - now) / 1000);
    const disabled = loading || lockRemain > 0 || coolRemain > 0;
    el.refreshBtn.disabled = disabled;
    el.refreshBtn.textContent = loading
      ? "갱신 중…"
      : lockRemain > 0
      ? `잠금 (${lockRemain})`
      : coolRemain > 0
      ? `새로고침 (${coolRemain})`
      : "새로고침";
  }

  // 쿨다운/잠금 카운트다운을 1초마다 갱신 (활성 동안에만 타이머 유지)
  function tickRefreshBtn() {
    clearTimeout(cooldownTimer);
    updateRefreshBtn();
    const now = Date.now();
    if (now < cooldownUntil || now < lockUntil) {
      cooldownTimer = setTimeout(tickRefreshBtn, 300);
    }
  }

  // ── 상태 표시 ─────────────────────────────────────────────────────────────────
  // 상태 표시 UI는 제거됨. 오류 진단은 콘솔 로그로만 남김.
  function setStatus(kind, text) {
    if (kind === "error" && text) console.warn("[MatchPoint] " + text);
  }

  function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  // ── 이벤트 바인딩 ─────────────────────────────────────────────────────────────
  function init() {
    el.year.textContent = new Date().getFullYear();
    el.refreshBtn.addEventListener("click", onRefresh);
    el.filterSearch.addEventListener("input", render);

    // 최초 1회 자동 로드(사용자 클릭 아님 → 쿨다운 없음). 이후 갱신은 새로고침 버튼만.
    load();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
