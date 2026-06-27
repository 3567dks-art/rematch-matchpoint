/**
 * data/roster.js
 * -----------------------------------------------------------------------------
 * 후보 명단(로스터) — "운영자 관리 데이터"의 기본값.
 *   각 후보: { id, name, group('트롯'|'KPOP'), imageUrl, votes(데모 득표) }
 *
 * - 이 파일이 배포본의 기본 명단입니다. 관리자 페이지(admin.html)에서 편집하면
 *   브라우저 localStorage 에 저장되어 그 브라우저에서 즉시 반영됩니다.
 * - 모두에게 영구 반영하려면 관리자 페이지의 "roster.js 내려받기"로 받은 파일로
 *   이 파일을 교체한 뒤 재배포하세요. (정적 사이트 운영 방식)
 *
 * KPOP 23팀: 이름·사진은 피그마 "후보 프로필 프레임"에서 가져옴.
 *            사진은 assets/candidates/k-01..k-23.png (피그마 400×400 프레임 추출).
 *            k-23(TRIPLE S)은 이미지 업로드 전 — 자리표시(첫 글자 아바타).
 * 트롯 20팀: 이름·사진은 피그마 "후보 프로필 프레임"에서 가져옴.
 *            사진은 assets/candidates/t-01..t-20.png (피그마 400×400 프레임 추출).
 * 득표(votes)는 데모 정렬용 — 실연동 시 API 가 id별로 채움.
 * -----------------------------------------------------------------------------
 */
window.MATCHPOINT_ROSTER = (function () {
  // ── KPOP 23팀 (피그마에서 이름·이미지 반영) ─────────────────────────────────
  var kpopNames = [
    "TEMPEST", "AHOF", "PLAVE", "ISEGYE IDOL", "HADES",
    "QWER", "AND2BL", "RESCENE", "n.SSign", "LUN8",
    "ONEPACT", "ALPHA DRIVE ONE", "NCHIVE", "POW", "DKB",
    "TNX", "XODIAC", "LNGSHOT", "KIIRAS", "TUNEXX",
    "FLARE U", "In A Minute", "TRIPLE S",
  ];
  var pad = function (i) { return i < 10 ? "0" + i : "" + i; };
  var list = kpopNames.map(function (name, idx) {
    var i = idx + 1;
    return {
      id: "k-" + pad(i),
      name: name,
      group: "KPOP",
      imageUrl: "./assets/candidates/k-" + pad(i) + ".png",
      votes: 600 + ((i * 137) % 2400), // 데모 정렬용
    };
  });

  // ── 트롯 20팀 (피그마에서 이름·이미지 반영) ─────────────────────────────────
  var trotNames = [
    "강문경", "성리", "김용빈", "송민준", "빈예서",
    "김다현", "김의영", "장한별", "진해성", "에녹",
    "신승태", "김중연", "김수찬", "전유진", "손태진",
    "박창근", "이솔로몬", "신성", "두리", "손빈아",
  ];
  trotNames.forEach(function (name, idx) {
    var j = idx + 1;
    list.push({
      id: "t-" + pad(j),
      name: name,
      group: "트롯",
      imageUrl: "./assets/candidates/t-" + pad(j) + ".png",
      votes: 600 + ((j * 113) % 2400),
    });
  });

  return list;
})();
