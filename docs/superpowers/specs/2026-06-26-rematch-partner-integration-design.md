# MATCH POINT — 리매치 + 타앱 통합 점수 연동 설계

작성일: 2026-06-26

## 목표

통합 점수 게시판(`/api/scores`)이 **리매치 2개 투표**와 **타앱(JK Fandom) 2개 부문**을
호출해, 부문별로 후보 득표를 **이름 기준으로 합산**해 반환한다.

- 부문(투표) 매핑:
  - `KPOP`(아이돌): 리매치 campaign `69d89a70820f8b2282f3fae6` + 타앱 `department_id=1`
  - `트롯`(대중가수): 리매치 campaign `69d89afc820f8b2282f3fbd1` + 타앱 `department_id=2`
- 명단·이름·사진의 **원천(source of truth) = 리매치 API**.
- 후보 합산 키 = **이름 자동 매칭**(정규화 비교).

## 외부 API 계약 (확인된 실제 형태)

### 리매치 — `GET {baseUrl}?campaignId={id}`
- 인증: 헤더 `X-API-Key: <REMATCH_API_KEY>`
- 응답:
  ```json
  { "resultCode": "ok", "data": {
      "campaignId": "...", "campaignName": "...",
      "scoreDataList": [
        { "id": "69w88lExUhNVUzqomehj", "name_ko": "김수찬",
          "portraitUrl": "https://...", "score": 0, "rank": 1 }
      ] } }
  ```
- `portraitUrl`은 http URL이 아닐 수 있음(예: `"profile138"`) → http(s)로 시작할 때만 사용.

### 타앱 — `GET {baseUrl}?department_id={n}`  (baseUrl = `.../v1/partner/events/2/votes`)
- 인증: 헤더 `X-API-Key: <PARTNER_API_KEY>`
- 응답:
  ```json
  { "event_id": 2, "event_name": "...",
    "departments": [
      { "department_id": 1, "department_name": "...",
        "artists": [
          { "artist_id": 1, "artist_name": "...", "vote_count": 253215, "rank": 1 }
        ] } ] }
  ```
- 단일 부문 호출 시 `departments` 배열에 해당 부문 1개만 담겨 옴.

> 주의: 제공된 테스트 키(`c094e663797974b224298c`)로는 운영에서 event 2 호출이 404가 떴다.
> 통합 로직은 위 **샘플 응답 형태**에 맞춰 구현하고, 유효한 키/엔드포인트로 실연동 검증이 필요하다.

## 설정 구조 (`api/scores.js`)

```js
const REMATCH = { baseUrl, apiKey: process.env.REMATCH_API_KEY };
const PARTNER = { baseUrl, apiKey: process.env.PARTNER_API_KEY };
const VOTES = [
  { group: "KPOP", rematchCampaignId: "69d89a70820f8b2282f3fae6", partnerDepartmentId: 1 },
  { group: "트롯", rematchCampaignId: "69d89afc820f8b2282f3fbd1", partnerDepartmentId: 2 },
];
```

- 키는 Vercel 환경변수로 보관 권장. 즉시 동작을 위해 기존 값을 fallback 기본값으로 둔다.
- `group` 값을 `KPOP`/`트롯`으로 두어 프론트 기존 `GROUP_LABELS`(→ 아이돌/대중가수) 탭이 그대로 동작.

## 합산 로직

각 VOTE에 대해 리매치·타앱을 병렬 호출(전체 4호출 `Promise.allSettled`):

1. 이름 정규화: `String(x).normalize("NFC").trim().replace(/\s+/g,"").toLowerCase()`.
2. 타앱 부문 `artists` → `정규화이름 → vote_count` 맵.
3. 리매치 `scoreDataList`의 각 후보로 entry 생성:
   - `id` = 리매치 `id`, `name` = `name_ko`, `group` = VOTE.group
   - `imageUrl` = `portraitUrl`이 `http`로 시작하면 그 값, 아니면 `null`
   - `votesBySource = { rematch: score, "partner-a": 매칭 vote_count || 0 }`
   - `totalVotes = score + 매칭 vote_count`
4. 타앱에만 있고 리매치에 없는 아티스트는 표시하지 않음.

### 부분 실패 처리 (한쪽 실패 시 성공한 쪽만)
- 타앱 실패 → 리매치 단독 점수로 표시(이름·사진 정상).
- 리매치 실패 → 타앱 단독으로 표시: `id="partner-{artist_id}"`, `name=artist_name`,
  `imageUrl=null`(이니셜 아바타), `group=VOTE.group`, `totalVotes=vote_count`.
- 둘 다 실패 → 그 부문은 비움.

## 출력 (프록시 → 프론트)

```json
{
  "sources": [{ "id": "rematch", "label": "리매치" }, { "id": "partner-a", "label": "타 앱" }],
  "entries": [{ "id": "...", "name": "...", "group": "트롯", "imageUrl": "https://...|null",
               "votesBySource": { "rematch": 0, "partner-a": 0 }, "totalVotes": 0,
               "updatedAt": "..." }],
  "fetchedAt": "..."
}
```

## 프론트엔드 (`js/dataSource.js`)

- 프록시 entry에 `name`이 있으면 그대로 사용(`id/name/group/imageUrl/totalVotes`).
- 프록시 미가용(file:// 등)일 때만 기존 roster 데모 폴백.
- `app.js`·roster·CSS·HTML 변경 없음.

## 범위
- 수정: `api/scores.js`(핵심 재작성), `js/dataSource.js`(프록시 entry 우선), `API-CONTRACT.md`(실연동 반영).
- 변경 없음: `js/app.js`, `data/roster.js`, `js/roster.js`, CSS, HTML.
