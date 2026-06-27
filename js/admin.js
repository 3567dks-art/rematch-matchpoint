/**
 * js/admin.js — 관리자 페이지 로직
 * -----------------------------------------------------------------------------
 * 후보 명단(로스터)을 편집:
 *  - 이름 / 부문 / 사진(URL 또는 파일 업로드) 편집, 추가, 삭제
 *  - 저장: localStorage (이 브라우저에 즉시 반영)
 *  - roster.js 내려받기: 모두에게 영구 반영하려면 이 파일로 data/roster.js 교체 후 재배포
 *
 * 사진 업로드는 캔버스로 240px 이내로 축소해 data URL 로 저장(용량 절약).
 * ⚠️ 이 페이지는 클라이언트 전용이라 접근 제한이 없습니다. 운영 시에는
 *    서버/배포 단계에서 보호(베이직 인증, 비공개 배포 등)를 권장합니다.
 * -----------------------------------------------------------------------------
 */
(function () {
  "use strict";

  var TARGET = { "트롯": 20, "KPOP": 23 };
  var working = []; // 편집 중인 로스터 배열

  var el = {
    gridTrot: document.getElementById("grid-trot"),
    gridKpop: document.getElementById("grid-kpop"),
    countTrot: document.getElementById("count-trot"),
    countKpop: document.getElementById("count-kpop"),
    status: document.getElementById("admin-status"),
    tpl: document.getElementById("cand-template"),
    btnSave: document.getElementById("btn-save"),
    btnExport: document.getElementById("btn-export"),
    btnReset: document.getElementById("btn-reset"),
    btnImport: document.getElementById("btn-import"),
    fileImport: document.getElementById("file-import"),
  };

  // ── ID 생성 (부문별 prefix + 빈 번호) ────────────────────────────────────────
  function nextId(group) {
    var prefix = group === "KPOP" ? "k" : "t";
    var used = {};
    working.forEach(function (c) {
      var m = /^([kt])-(\d+)$/.exec(c.id || "");
      if (m && m[1] === prefix) used[parseInt(m[2], 10)] = true;
    });
    var n = 1;
    while (used[n]) n++;
    return prefix + "-" + (n < 10 ? "0" + n : "" + n);
  }

  // ── 렌더 ────────────────────────────────────────────────────────────────────
  function render() {
    el.gridTrot.replaceChildren();
    el.gridKpop.replaceChildren();
    var counts = { "트롯": 0, "KPOP": 0 };

    working.forEach(function (cand, index) {
      var group = cand.group === "KPOP" ? "KPOP" : "트롯";
      counts[group]++;
      var card = buildCard(cand, index);
      (group === "KPOP" ? el.gridKpop : el.gridTrot).append(card);
    });

    el.countTrot.textContent = counts["트롯"];
    el.countKpop.textContent = counts["KPOP"];
    el.countTrot.parentElement.classList.toggle("warn", counts["트롯"] !== TARGET["트롯"]);
    el.countKpop.parentElement.classList.toggle("warn", counts["KPOP"] !== TARGET["KPOP"]);
  }

  function buildCard(cand, index) {
    var node = el.tpl.content.firstElementChild.cloneNode(true);
    var img = node.querySelector("[data-img]");
    var empty = node.querySelector("[data-empty]");
    var nameInput = node.querySelector("[data-name]");
    var groupSel = node.querySelector("[data-group]");
    var urlInput = node.querySelector("[data-url]");
    var fileInput = node.querySelector("[data-file]");
    var idEl = node.querySelector("[data-id]");
    var delBtn = node.querySelector("[data-delete]");

    idEl.textContent = cand.id || "";
    nameInput.value = cand.name || "";
    groupSel.value = cand.group === "KPOP" ? "KPOP" : "트롯";
    urlInput.value = cand.imageUrl || "";
    setThumb(img, empty, cand.imageUrl);

    nameInput.addEventListener("input", function () { working[index].name = nameInput.value; });
    groupSel.addEventListener("change", function () {
      working[index].group = groupSel.value;
      render(); // 부문 바뀌면 섹션 이동
    });
    urlInput.addEventListener("input", function () {
      working[index].imageUrl = urlInput.value.trim();
      setThumb(img, empty, working[index].imageUrl);
    });
    fileInput.addEventListener("change", function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      downscaleToDataURL(f, 240, function (dataUrl) {
        working[index].imageUrl = dataUrl;
        urlInput.value = "(업로드한 사진)";
        setThumb(img, empty, dataUrl);
        flash("사진을 넣었습니다. 잊지 말고 [저장]을 누르세요.", false);
      });
    });
    delBtn.addEventListener("click", function () {
      working.splice(index, 1);
      render();
    });

    return node;
  }

  function setThumb(img, empty, url) {
    if (url) {
      img.src = url;
      img.hidden = false;
      empty.hidden = true;
    } else {
      img.removeAttribute("src");
      img.hidden = true;
      empty.hidden = false;
    }
  }

  // ── 사진 축소 (canvas → dataURL) ─────────────────────────────────────────────
  function downscaleToDataURL(file, maxSize, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var image = new Image();
      image.onload = function () {
        var w = image.width, h = image.height;
        var scale = Math.min(1, maxSize / Math.max(w, h));
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var canvas = document.createElement("canvas");
        canvas.width = cw; canvas.height = ch;
        canvas.getContext("2d").drawImage(image, 0, 0, cw, ch);
        try {
          cb(canvas.toDataURL("image/jpeg", 0.82));
        } catch (e) {
          cb(reader.result); // 변환 실패 시 원본 사용
        }
      };
      image.onerror = function () { flash("이미지를 읽지 못했습니다.", true); };
      image.src = reader.result;
    };
    reader.onerror = function () { flash("파일을 읽지 못했습니다.", true); };
    reader.readAsDataURL(file);
  }

  // ── 액션 ────────────────────────────────────────────────────────────────────
  function addCandidate(group) {
    working.push({ id: nextId(group), name: "", group: group, imageUrl: "", votes: 0 });
    render();
    flash("후보를 추가했습니다. 이름/사진 입력 후 [저장].", false);
  }

  function save() {
    // 빈 이름은 임시 이름 부여
    working.forEach(function (c) { if (!c.name) c.name = (c.group || "후보") + " " + c.id; });
    window.Roster.saveRoster(working);
    flash("저장됨 — 이 브라우저의 사이트에 즉시 반영됩니다. (모두에게 적용은 roster.js 내려받기 후 재배포)", false);
  }

  function exportRosterJs() {
    var body = "window.MATCHPOINT_ROSTER = " + JSON.stringify(working, null, 2) + ";\n";
    var blob = new Blob([body], { type: "text/javascript;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "roster.js";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flash("roster.js 내려받음 — data/roster.js 를 이 파일로 교체 후 재배포하세요.", false);
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var text = String(reader.result);
        var json = text;
        // roster.js 형태("window.MATCHPOINT_ROSTER = [...]")도 허용
        var m = text.match(/=\s*(\[[\s\S]*\])\s*;?\s*$/);
        if (m) json = m[1];
        var arr = JSON.parse(json);
        if (!Array.isArray(arr)) throw new Error("배열이 아님");
        working = arr.map(normalize);
        render();
        flash("불러왔습니다. 확인 후 [저장]을 누르세요.", false);
      } catch (e) {
        flash("불러오기 실패: 올바른 roster JSON/JS 파일이 아닙니다.", true);
      }
    };
    reader.readAsText(file);
  }

  function resetDefault() {
    if (!confirm("편집본을 버리고 기본 명단으로 되돌릴까요?")) return;
    window.Roster.clearOverride();
    working = window.Roster.getDefault().map(normalize);
    render();
    flash("기본 명단으로 초기화했습니다. (저장 전까지는 기존 편집본이 유지될 수 있음)", false);
  }

  function normalize(c) {
    return {
      id: String(c.id || ""),
      name: String(c.name || ""),
      group: c.group === "KPOP" ? "KPOP" : "트롯",
      imageUrl: typeof c.imageUrl === "string" ? c.imageUrl : "",
      votes: Number.isFinite(Number(c.votes)) ? Number(c.votes) : 0,
    };
  }

  function flash(msg, isWarn) {
    el.status.textContent = msg;
    el.status.classList.toggle("warn", !!isWarn);
  }

  // ── 초기화 ──────────────────────────────────────────────────────────────────
  function init() {
    working = window.Roster.getRoster().map(normalize);
    render();

    document.querySelectorAll("[data-add]").forEach(function (btn) {
      btn.addEventListener("click", function () { addCandidate(btn.getAttribute("data-add")); });
    });
    el.btnSave.addEventListener("click", save);
    el.btnExport.addEventListener("click", exportRosterJs);
    el.btnReset.addEventListener("click", resetDefault);
    el.btnImport.addEventListener("click", function () { el.fileImport.click(); });
    el.fileImport.addEventListener("change", function () {
      var f = el.fileImport.files && el.fileImport.files[0];
      if (f) importFile(f);
      el.fileImport.value = "";
    });

    if (window.Roster.hasOverride()) {
      flash("이 브라우저에 저장된 편집본을 불러왔습니다.", false);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
