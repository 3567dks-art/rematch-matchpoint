# OST MATCH POINT 통합 점수 게시판

여러 앱(우리 **리매치** 앱 + 타 앱들)의 **투표를 실시간으로 합산**해
하나의 통합 순위판으로 보여주는 웹사이트입니다.

- 프론트엔드: 의존성 없는 정적 HTML/CSS/JS
- 데이터: 서버리스 프록시(`/api/scores`)가 각 앱 API 를 호출·합산
- 배포: Vercel (정적 + 서버리스 함수)
- 실시간: 폴링(기본 8초) — 우상단 "실시간" 토글로 on/off


## 폴더 구조

```
매치포인트/
├─ index.html          # 진입점 (헤더 + 순위판 UI)
├─ styles.css          # 스타일 (반응형: 데스크톱=테이블, 모바일=카드)
├─ js/
│  ├─ dataSource.js    # 프론트 데이터 경계. /api/scores 호출 + 검증(키 없음)
│  └─ app.js           # UI 렌더링 / 필터 / 순위·실시간 폴링
├─ api/
│  └─ scores.js        # ★ 서버리스 프록시. 여기서만 API Key 사용(환경변수)
├─ vercel.json         # 배포 설정 (캐시 헤더)
├─ API-CONTRACT.md     # 백엔드/파트너에 넘길 API 표준 스펙
└─ README.md
```

## 보안 구조 (중요)

```
[브라우저(공개 링크)] ──> /api/scores ──(API Key)──> [리매치 / 타 앱 API]
        키 없음              키는 서버 환경변수에만        투표 원본
```

공개 링크로 내보내는 사이트이므로 **API Key 를 프론트엔드에 절대 두지 않습니다.**
키는 Vercel 환경변수에 보관하고, 서버리스 함수 `api/scores.js` 에서만 사용합니다.

## 로컬 실행

### 빠른 미리보기 (더미 데이터)
`index.html` 을 더블클릭하면, 프록시가 없으므로 **내장 더미 데이터로 폴백**해 화면이 동작합니다.

### 프록시까지 포함해 로컬 실행 (실제 구조와 동일)
```bash
npm i -g vercel
vercel dev        # http://localhost:3000 — /api/scores 도 함께 동작
```

## 배포 (Vercel)

```bash
vercel            # 미리보기 배포
vercel --prod     # 운영 배포 (공개 링크 생성)
```

## 실제 API 연동 절차

현재 `api/scores.js` 는 실제 앱 API 문서가 확정되기 전이라 더미를 반환합니다(`USE_DUMMY=true`).
연동 시:

1. **스펙 합의** — `API-CONTRACT.md` 를 각 앱(백엔드)에 전달, 표준 응답/항목 ID 체계 합의
2. **환경변수 등록** (Vercel → Settings → Environment Variables):
   `REMATCH_API_URL`, `REMATCH_API_KEY`, `PARTNER_A_API_URL`, `PARTNER_A_API_KEY`, … , `USE_DUMMY=false`
3. **프록시 작성** — `api/scores.js` 의 `SOURCES`(URL/인증)와 필요 시 `normalizeSource()` 매핑
4. 배포 후 확인

> Netlify 로 배포한다면 `api/scores.js` 를 `netlify/functions/scores.js` 로 옮기고
> `exports.handler` 시그니처로 감싸면 됩니다.
