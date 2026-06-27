/**
 * api/scores.js  —  서버리스 프록시 (Vercel)
 * -----------------------------------------------------------------------------
 * 이 함수가 이 프로젝트의 보안 경계입니다.
 *
 *   [브라우저(공개)] ──> /api/scores ──(API Key)──> [리매치 / 타 앱 API]
 *                         (여기, 서버)
 *
 * - API Key 는 절대 프론트엔드에 두지 않습니다. 이 함수에서만 사용합니다.
 *   (운영 시 Vercel 대시보드 → Settings → Environment Variables 에 등록 권장)
 * - 부문(투표)별로 [리매치 + 타 앱] 을 호출 → 후보를 "이름" 으로 합산 → 통합 JSON 반환.
 * - 한 출처가 실패해도 전체가 죽지 않도록 Promise.allSettled 사용
 *   (한쪽만 실패하면 성공한 쪽 점수만으로 표시).
 *
 * 명단/이름/사진의 원천(source of truth) = 리매치 API (scoreDataList).
 * 타앱 득표는 "이름 매칭" 으로 리매치 후보에 합산됩니다.
 *
 * 설계 문서: docs/superpowers/specs/2026-06-26-rematch-partner-integration-design.md
 * -----------------------------------------------------------------------------
 */

// ── 외부 API 설정 ─────────────────────────────────────────────────────────────
// 키는 운영에서 환경변수로 보관 권장. 환경변수가 없으면 아래 기본값으로 동작.
const REMATCH = {
  baseUrl: "https://rematchVoteStats-65s5gbk6ra-uc.a.run.app/", // 쿼리: ?campaignId=
  apiKey: process.env.REMATCH_API_KEY || "strd_rematch_b4f9e7c2a18d63f04e9b7c1a5d8e2f693ab71c4d5e8f90",
};
const PARTNER = {
  baseUrl: "https://api.jk-fandom.jp/v1/partner/events/2000016/votes", // 쿼리: ?department_id=
  apiKey: process.env.PARTNER_API_KEY || "c094e663797974b224298c",
};

// 부문(투표) 정의: 리매치 campaign ↔ 타앱 department 짝.
// group 값(KPOP/트롯)은 프론트의 GROUP_LABELS(→ 아이돌/대중가수) 탭으로 표시됨.
const VOTES = [
  { group: "KPOP", rematchCampaignId: "69d89a70820f8b2282f3fae6", partnerDepartmentId: 3000058 },
  { group: "트롯", rematchCampaignId: "69d89afc820f8b2282f3fbd1", partnerDepartmentId: 3000059 },
];

// 게시판 출처 라벨 (프론트 참고용)
const SOURCE_LABELS = [
  { id: "rematch", label: "리매치" },
  { id: "partner-a", label: "타 앱" },
];

// ── IP 레이트리밋 (매크로/봇·직접호출 방어선) ─────────────────────────────────
// 클라이언트(app.js)의 쿨다운은 우회 가능하므로, 엔드포인트 자체를 IP 단위로 제한.
// 주의: 서버리스 인스턴스는 분산/휘발성이라 in-memory 는 인스턴스별로만 정확합니다.
//       운영 강화 시 Vercel KV / Upstash Redis 등 durable 저장소나 Edge 레이트리밋 권장.
const RATE = { windowMs: 10000, max: 12 }; // 10초당 12회
const ipHits = new Map(); // ip -> number[] (timestamps)

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  const arr = (ipHits.get(ip) || []).filter((t) => now - t < RATE.windowMs);
  arr.push(now);
  ipHits.set(ip, arr);
  // 맵이 너무 커지면 오래된 항목 정리(메모리 보호)
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) {
      if (!v.length || now - v[v.length - 1] > RATE.windowMs) ipHits.delete(k);
    }
  }
  return arr.length > RATE.max;
}

export default async function handler(req, res) {
  // 같은 도메인에서 호출하므로 CORS 는 기본적으로 불필요.
  res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=10");

  // 레이트리밋 초과 시 429 (브라우저 캐시 금지)
  if (isRateLimited(clientIp(req))) {
    res.setHeader("Retry-After", "5");
    res.status(429).json({ error: "rate_limited" });
    return;
  }

  try {
    const payload = await buildFromSources();
    res.status(200).json(payload);
  } catch (err) {
    console.error("[api/scores] 처리 실패:", err);
    res.status(502).json({ error: "upstream_failed" });
  }
}

// ── 통합 빌드 ─────────────────────────────────────────────────────────────────
async function buildFromSources() {
  const perVote = await Promise.all(VOTES.map(buildVote));
  return {
    entries: perVote.flat(),
    sources: SOURCE_LABELS,
    fetchedAt: new Date().toISOString(),
  };
}

// 한 부문(투표)에 대해 리매치+타앱을 합산해 entry 배열을 만든다.
async function buildVote(vote) {
  const [rematchRes, partnerRes] = await Promise.allSettled([
    fetchRematch(vote.rematchCampaignId),
    fetchPartner(vote.partnerDepartmentId),
  ]);

  const rematchList = rematchRes.status === "fulfilled" ? rematchRes.value : null;
  const partnerList = partnerRes.status === "fulfilled" ? partnerRes.value : null;
  if (rematchRes.status !== "fulfilled")
    console.warn(`[api/scores] 리매치 '${vote.group}' 실패:`, rematchRes.reason);
  if (partnerRes.status !== "fulfilled")
    console.warn(`[api/scores] 타앱 '${vote.group}' 실패:`, partnerRes.reason);

  const now = new Date().toISOString();

  // 타앱 득표를 "정규화 이름 → 표수" 로 인덱싱 (이름 매칭용)
  const partnerByName = new Map();
  if (partnerList) {
    for (const a of partnerList) partnerByName.set(normName(a.name), a.votes);
  }

  // 원천 = 리매치. 리매치 후보를 기준으로 타앱 득표를 이름으로 합산.
  if (rematchList) {
    return rematchList.map((c) => {
      const rv = safeCount(c.score);
      const pv = safeCount(partnerByName.get(normName(c.name)) || 0);
      return {
        id: c.id,
        name: c.name,
        group: vote.group,
        imageUrl: httpUrl(c.imageUrl),
        votesBySource: { rematch: rv, "partner-a": pv },
        totalVotes: rv + pv,
        updatedAt: now,
      };
    });
  }

  // 리매치 실패 → 타앱 단독으로 표시 (성공한 쪽만)
  if (partnerList) {
    return partnerList.map((a) => {
      const pv = safeCount(a.votes);
      return {
        id: "partner-" + a.id,
        name: a.name,
        group: vote.group,
        imageUrl: null, // 타앱 응답엔 사진이 없음 → 이니셜 아바타
        votesBySource: { rematch: 0, "partner-a": pv },
        totalVotes: pv,
        updatedAt: now,
      };
    });
  }

  // 둘 다 실패 → 그 부문은 비움
  return [];
}

// ── 리매치 호출/정규화 ────────────────────────────────────────────────────────
// GET {baseUrl}?campaignId=...  (X-API-Key)
// 응답: { data: { scoreDataList: [{ id, name_ko, portraitUrl, score }] } }
async function fetchRematch(campaignId) {
  const url = withQuery(REMATCH.baseUrl, "campaignId", campaignId);
  const headers = { Accept: "application/json" };
  if (REMATCH.apiKey) headers["X-API-Key"] = REMATCH.apiKey;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`rematch ${campaignId}: HTTP ${res.status}`);
  const raw = await res.json();
  const list =
    raw && raw.data && Array.isArray(raw.data.scoreDataList)
      ? raw.data.scoreDataList
      : [];
  return list.map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name_ko ?? row.name_en ?? ""),
    imageUrl: row.portraitUrl ?? null,
    score: safeCount(row.score),
  }));
}

// ── 타앱 호출/정규화 ──────────────────────────────────────────────────────────
// GET {baseUrl}?department_id=...  (X-API-Key)
// 응답: { departments: [{ department_id, artists: [{ artist_id, artist_name, vote_count }] }] }
async function fetchPartner(departmentId) {
  const url = withQuery(PARTNER.baseUrl, "department_id", departmentId);
  const headers = { Accept: "application/json" };
  if (PARTNER.apiKey) headers["X-API-Key"] = PARTNER.apiKey;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`partner dept ${departmentId}: HTTP ${res.status}`);
  const raw = await res.json();
  const depts = raw && Array.isArray(raw.departments) ? raw.departments : [];
  const dep =
    depts.find((d) => Number(d.department_id) === Number(departmentId)) || depts[0];
  const artists = dep && Array.isArray(dep.artists) ? dep.artists : [];
  return artists.map((a) => ({
    id: String(a.artist_id ?? ""),
    name: String(a.artist_name ?? ""),
    votes: safeCount(a.vote_count),
  }));
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function withQuery(base, key, value) {
  const sep = base.includes("?") ? "&" : "?";
  return base + sep + key + "=" + encodeURIComponent(value);
}

// 이름 매칭용 정규화: NFC + 공백 제거 + 소문자.
function normName(s) {
  return String(s == null ? "" : s)
    .normalize("NFC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

// http(s) URL 만 사진으로 사용 (예: "profile138" 같은 비-URL 은 null → 이니셜 아바타)
function httpUrl(u) {
  return typeof u === "string" && /^https?:\/\//i.test(u) ? u : null;
}

function safeCount(n) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}
