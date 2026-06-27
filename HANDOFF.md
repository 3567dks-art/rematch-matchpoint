# 개발자 핸드오프 — OST MATCH POINT 통합 점수 게시판

## 한 줄 요약
여러 앱(리매치 + 타 앱)의 투표를 합산해 실시간 순위로 보여주는 **정적 웹사이트 + 서버리스 프록시**.
프레임워크 없음(순수 HTML/CSS/JS). 배포 타깃은 **Vercel**.

## 바로 실행해보기
- **빠른 확인**: `index.html` 더블클릭 → 더미 데이터로 동작 (프록시 없으면 자동 폴백)
- **실제 구조 그대로(프록시 포함)**:
  ```bash
  npm i -g vercel
  vercel dev      # http://localhost:3000
  ```
- **관리자 페이지**: `admin.html` (배포 시 `/admin`) — 후보 이름/사진/부문 편집

## 폴더 구조
```
index.html          공개 페이지 (헤더/부문탭/TOP3 포디움/랭킹)
admin.html          관리자 페이지 (후보·사진 관리)
styles.css / admin.css
js/
  app.js            렌더링·순위·새로고침(매크로 방지)
  dataSource.js     데이터 경계(로스터+프록시 합성). 키 없음
  roster.js         로스터 공용 헬퍼(localStorage 오버라이드)
  admin.js          관리자 로직(사진 업로드=canvas 240px 축소)
data/roster.js      후보 명단 기본값(KPOP 22 / 트롯 20)
api/scores.js       ★서버리스 프록시(보안 경계). API Key는 여기 환경변수로만
assets/             logo.svg 등 + candidates/(후보 사진 k-01..k-22.png)
vercel.json         /admin rewrite, 캐시 헤더
README.md           실행/배포/연동 가이드
API-CONTRACT.md     ★각 앱 API가 맞춰야 할 표준 스펙(연동 시 필독)
```

## 데이터/보안 핵심
- **후보 명단/이름/사진** = `data/roster.js`(운영자 관리). **득표수** = `api/scores.js` 프록시가 id별 제공.
- **API Key는 절대 프론트에 두지 않음** → `api/scores.js`에서 환경변수로만 사용(프록시 패턴). 자세한 건 `API-CONTRACT.md`.
- 새로고침은 수동 전용 + 클라이언트 쿨다운/매크로차단 + 서버 IP 레이트리밋.

## 현재 상태 / 남은 일
- ✅ UI 완성(다크 버건디 테마, 부문 탭 트롯/KPOP, TOP3 포디움+메달, 득표수+백분율)
- ✅ KPOP 22팀 실제 이름·사진 반영(피그마 추출)
- ⏳ 트롯 20팀: 이름만 반영, **사진 미반영**(피그마 트롯 프레임 채워지면 추가)
- ⏳ 실제 API 연동 전(현재 더미 득표). `API-CONTRACT.md` 기준으로 각 앱 endpoint/인증/항목ID 합의 → 환경변수 등록 → `USE_DUMMY=false`
- ⏳ 관리자 페이지 접근 제한 없음(클라이언트 전용) → 운영 시 인증/비공개 배포 권장
- 참고: 후보 사진은 사용 권한(라이선스) 확인 필요

## 연동 시 채울 환경변수 (Vercel)
`REMATCH_API_URL`, `REMATCH_API_KEY`, `PARTNER_A_API_URL`, `PARTNER_A_API_KEY`, `USE_DUMMY=false`
