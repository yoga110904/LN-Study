import { getCourses, setCourseStatus, getAllWeeks, getReadSet, readKey } from "../firestore.js";
import { escapeHtml, rerender } from "../router.js";
import { confirmDialog, toast, confetti, progressBar, newCourseDialog, pageHero, statTile, colorFor, initialOf } from "../ui.js";
import { getUser } from "../auth.js";
import { t } from "../i18n.js";

export const PASTELS = ["c-yellow", "c-green", "c-purple", "c-pink", "c-blue"];

export const statusOf = (c) => (c.status === "done" ? "done" : "in_progress");
export const statusBadge = (c) =>
  statusOf(c) === "done"
    ? `<span class="status status-done">${t("status.badgeDone")}</span>`
    : `<span class="status status-progress">${t("status.badgeProgress")}</span>`;

const COLUMNS = [
  { key: "in_progress", cls: "col-progress" },
  { key: "done", cls: "col-done" },
];

const DONE_LIMIT = 3;

const cardHtml = (c, i, st = { read: 0, total: 0 }) => `
  <a class="card board-card anim-in" style="--i:${i}" draggable="false"
     data-id="${escapeHtml(c.id)}" data-status="${statusOf(c)}" href="#/course/${encodeURIComponent(c.id)}">
    <div class="bc-head">
      <span class="bc-avatar ${colorFor(c.name)}">${escapeHtml(initialOf(c.name))}</span>
      <div class="bc-title">
        <h3>${escapeHtml(c.name)}</h3>
        <small>${t("course.lnCount", { n: st.total })}</small>
      </div>
      <span class="bc-grip" aria-hidden="true">⋮⋮</span>
    </div>
    ${progressBar(st.read, st.total)}
  </a>`;

// LN pertama yang belum dibaca dari course In Progress
function nextUnread(courses, weeks, readSet) {
  const active = courses.filter((c) => statusOf(c) === "in_progress").sort((a, b) => a.name.localeCompare(b.name));
  const time = (w) => (w.createdAt?.toDate ? w.createdAt.toDate().getTime() : 0);
  for (const c of active) {
    const w = weeks
      .filter((x) => x.courseId === c.id && !readSet.has(readKey(c.id, x.id)))
      .sort((a, b) => time(a) - time(b))[0];
    if (w) return { course: c, week: w };
  }
  return null;
}

function continueHtml(next, anyWeeks) {
  if (!anyWeeks) return "";
  if (!next) return `
    <div class="continue-card all-done anim-in">
      <span class="cc-ico">🎉</span>
      <div class="cc-text"><small>${t("cont.label")}</small><strong>${t("cont.allDone")}</strong></div>
    </div>`;
  return `
    <a class="continue-card anim-in" href="#/course/${encodeURIComponent(next.course.id)}/week/${encodeURIComponent(next.week.id)}">
      <span class="cc-ico">📖</span>
      <div class="cc-text">
        <small>${t("cont.label")}</small>
        <strong>${escapeHtml(next.week.title)}</strong>
        <span>${escapeHtml(next.course.name)}</span>
      </div>
      <span class="cc-go">${t("cont.read")} →</span>
    </a>`;
}

export async function renderCourses(view, isCurrent) {
  const [courses, weeks, readSet] = await Promise.all([getCourses(), getAllWeeks(), getReadSet()]);
  if (!isCurrent()) return;

  const stats = {};
  for (const w of weeks) {
    const st = (stats[w.courseId] ||= { read: 0, total: 0 });
    st.total++;
    if (readSet.has(readKey(w.courseId, w.id))) st.read++;
  }

  view.innerHTML = `
    ${pageHero({
      icon: "📚",
      title: t("courses.hello", { name: escapeHtml((getUser()?.displayName || "").split(" ")[0] || t("profile.student")) }),
      sub: t("courses.sub"),
      action: `<button class="btn btn-primary" data-new-course>${t("course.new")}</button>`,
    })}
    ${continueHtml(nextUnread(courses, weeks, readSet), weeks.length > 0)}
    <div id="statsWrap">${courses.length ? statsHtml(courses, stats) : ""}</div>
    ${courses.length ? `
      <div class="board">
        ${COLUMNS.map((col, ci) => {
          const list = courses.filter((c) => statusOf(c) === col.key);
          return `
          <section class="board-col ${col.cls} anim-in" style="--i:${ci}" data-status="${col.key}">
            <header><span class="dot"></span>${t("status." + col.key)}<span class="count">${list.length}</span></header>
            <div class="board-list">
              ${list.map((c, i) => cardHtml(c, i, stats[c.id])).join("")}
              <div class="board-empty">${t("courses.dropHere")}</div>
            </div>
            ${col.key === "done" ? `<button class="more-btn" hidden></button>` : ""}
          </section>`;
        }).join("")}
      </div>` : `
      <div class="empty anim-in">
        <p>${t("courses.empty")}</p>
        <div class="row" style="justify-content:center">
          <button class="btn btn-primary" data-new-course>${t("course.new")}</button>
          <a class="btn" href="#/upload">${t("courses.uploadFirst")}</a>
        </div>
      </div>`}
  `;

  view.querySelectorAll("[data-new-course]").forEach((b) => {
    b.onclick = async () => { if (await newCourseDialog()) rerender(); };
  });

  const board = view.querySelector(".board");
  if (!board) return;
  enableChartTooltip(view.querySelector(".chart"));
  const byId = Object.fromEntries(courses.map((c) => [c.id, c]));
  const refreshStats = () => {
    const wrap = view.querySelector("#statsWrap");
    wrap.innerHTML = statsHtml(courses, stats);
    enableChartTooltip(wrap.querySelector(".chart"));
  };

  // kolom Done cuma tampil max 3 kartu, sisanya bisa di-expand
  let doneExpanded = false;
  const doneCol = board.querySelector(".col-done");
  const moreBtn = doneCol.querySelector(".more-btn");
  const applyDoneLimit = () => {
    const cards = [...doneCol.querySelectorAll(".board-card")];
    cards.forEach((c, i) => c.classList.toggle("is-hidden", !doneExpanded && i >= DONE_LIMIT));
    const extra = cards.length - DONE_LIMIT;
    moreBtn.hidden = extra <= 0;
    moreBtn.textContent = doneExpanded ? t("courses.less") : t("courses.more", { n: extra });
  };
  moreBtn.onclick = () => { doneExpanded = !doneExpanded; applyDoneLimit(); };
  applyDoneLimit();

  const updateCounts = () => {
    board.querySelectorAll(".board-col").forEach((col) => {
      const n = col.querySelectorAll(".board-card").length;
      col.querySelector(".count").textContent = n;
      const tile = view.querySelector(`[data-stat="${col.dataset.status}"]`);
      if (tile) tile.textContent = n;
    });
    applyDoneLimit();
  };

  enableDragDrop(board, async (card, col) => {
    const name = card.querySelector("h3").textContent;
    const target = COLUMNS.find((c) => c.key === col.dataset.status);
    const label = t("status." + target.key);
    if (target.key === "done") {
      const st = stats[card.dataset.id] || { read: 0, total: 0 };
      if (!canFinish(st)) {
        card.animate(
          [{ transform: "translateX(0)" }, { transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "translateX(0)" }],
          { duration: 350 }
        );
        return notReadyDialog(name, st, card.dataset.id);
      }
    }
    const ok = await confirmDialog({
      icon: target.key === "done" ? "🎓" : "📖",
      title: t("courses.confirmTitle"),
      message: t("courses.confirmMove", { name: escapeHtml(name), status: label }),
      confirmText: t("courses.confirmMoveYes"),
    });
    if (!ok) return;

    const fromList = card.parentElement;
    const next = card.nextSibling;
    const toList = col.querySelector(".board-list");
    // yang baru Done taruh paling atas biar tetap kelihatan
    moveAnimated(card, toList, target.key === "done" ? toList.firstElementChild : undefined);
    card.dataset.status = target.key;
    byId[card.dataset.id].status = target.key;
    updateCounts();
    refreshStats();
    try {
      await setCourseStatus(card.dataset.id, target.key);
      toast(`${name} → ${label}`);
      if (target.key === "done") confetti();
    } catch (e) {
      moveAnimated(card, fromList, next);
      card.dataset.status = fromList.closest(".board-col").dataset.status;
      byId[card.dataset.id].status = card.dataset.status;
      updateCounts();
      refreshStats();
      toast(t("courses.updateFail") + ": " + e.message, "err");
    }
  });
}

function statsHtml(courses, stats) {
  const all = Object.values(stats);
  const total = all.reduce((a, s) => a + s.total, 0);
  const read = all.reduce((a, s) => a + s.read, 0);
  const pct = total ? Math.round((read / total) * 100) : 0;
  const nDone = courses.filter((c) => statusOf(c) === "done").length;
  const rows = courses.filter((c) => statusOf(c) === "in_progress").sort((a, b) => a.name.localeCompare(b.name));

  return `
    <div class="adm-stats stats-4">
      ${statTile({ icon: "🟡", value: courses.length - nDone, label: t("stats.inProgress"), attr: 'data-stat="in_progress"', i: 0 })}
      ${statTile({ icon: "✅", value: nDone, label: t("stats.done"), attr: 'data-stat="done"', i: 1 })}
      ${statTile({ icon: "📄", value: total, label: t("stats.totalLn"), i: 2 })}
      ${statTile({ icon: "📖", value: `${pct}<small>%</small>`, label: t("stats.readPct"), i: 3 })}
    </div>
    <figure class="panel chart anim-in" style="--i:4">
      <figcaption><strong>${t("chart.title")}</strong><span>${t("chart.sub")}</span></figcaption>
      ${rows.length ? "" : `<p class="chart-empty">${t("chart.empty")}</p>`}
      <div class="chart-rows" role="list">
        ${rows.map((c, i) => {
          const s = stats[c.id] || { read: 0, total: 0 };
          const p = s.total ? Math.round((s.read / s.total) * 100) : 0;
          const tip = s.total ? t("chart.tip", { read: s.read, total: s.total }) : t("chart.noLn");
          return `
          <div class="chart-row" role="listitem" data-tip="${escapeHtml(c.name)}|${escapeHtml(tip)}">
            <span class="chart-name">${escapeHtml(c.name)}</span>
            <span class="chart-track"><i style="--w:${p}%;--d:${i * 70}ms"></i></span>
            <span class="chart-val">${s.total ? p + "%" : "–"}</span>
          </div>`;
        }).join("")}
      </div>
      <div class="chart-axis" aria-hidden="true" ${rows.length ? "" : "hidden"}><span></span><span class="axis-ticks"><span>0%</span><span>50%</span><span>100%</span></span><span></span></div>
    </figure>`;
}

function enableChartTooltip(chart) {
  if (!chart) return;
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  chart.appendChild(tip);
  let active = null;
  const hide = () => { tip.classList.remove("show"); active?.classList.remove("hover"); active = null; };
  chart.addEventListener("pointermove", (e) => {
    const row = e.target.closest(".chart-row");
    if (!row) return hide();
    if (row !== active) {
      active?.classList.remove("hover");
      active = row;
      row.classList.add("hover");
      const [name, text] = row.dataset.tip.split("|");
      tip.innerHTML = `<b>${escapeHtml(name)}</b>${escapeHtml(text)}`;
    }
    const box = chart.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - box.left, 90), box.width - 90);
    tip.style.left = x + "px";
    tip.style.top = row.offsetTop - 8 + "px";
    tip.classList.add("show");
  });
  chart.addEventListener("pointerleave", hide);
}

// Course baru boleh Done kalau punya LN dan semuanya sudah ditandai dibaca
export const canFinish = (st) => st.total > 0 && st.read >= st.total;

export async function notReadyDialog(name, st, courseId) {
  const go = await confirmDialog({
    icon: "📖",
    title: t("done.blockedTitle"),
    message: st.total
      ? t("done.blockedMsg", { name: escapeHtml(name), read: st.read, total: st.total, left: st.total - st.read })
      : t("done.blockedEmpty", { name: escapeHtml(name) }),
    confirmText: st.total ? t("done.openCourse") : t("courses.uploadFirst"),
    cancelText: t("done.ok"),
  });
  if (go) location.hash = st.total ? `#/course/${encodeURIComponent(courseId)}` : "#/upload";
}

// FLIP: kartu meluncur dari posisi lama ke posisi baru
function moveAnimated(card, list, before = list.querySelector(".board-empty")) {
  const first = card.getBoundingClientRect();
  list.insertBefore(card, before);
  const last = card.getBoundingClientRect();
  card.animate(
    [
      { transform: `translate(${first.left - last.left}px, ${first.top - last.top}px) scale(1.03)` },
      { transform: "none" },
    ],
    { duration: 420, easing: "cubic-bezier(.2,.9,.3,1.2)" }
  );
}

// Drag pakai Pointer Events supaya jalan di mouse & layar sentuh.
// Touch: tahan ~250ms dulu, supaya scroll biasa tetap bisa.
function enableDragDrop(board, onDrop) {
  board.querySelectorAll(".board-card").forEach((card) => {
    card.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const isTouch = e.pointerType !== "mouse";
      const sx = e.clientX, sy = e.clientY;
      let dragging = false, ghost, offX, offY, overCol = null;
      let timer = isTouch ? setTimeout(begin, 250) : null;
      if (isTouch) card.classList.add("pressing");

      function begin() {
        dragging = true;
        card.classList.remove("pressing");
        const r = card.getBoundingClientRect();
        offX = sx - r.left; offY = sy - r.top;
        ghost = card.cloneNode(true);
        ghost.classList.remove("anim-in");
        ghost.classList.add("ghost");
        ghost.style.width = r.width + "px";
        ghost.style.left = r.left + "px";
        ghost.style.top = r.top + "px";
        document.body.appendChild(ghost);
        card.classList.add("placeholder");
        document.body.classList.add("is-dragging");
        navigator.vibrate?.(15);
      }

      function move(ev) {
        const dist = Math.hypot(ev.clientX - sx, ev.clientY - sy);
        if (!dragging) {
          if (isTouch && dist > 8) return end();
          if (!isTouch && dist > 6) begin();
          else return;
        }
        ghost.style.left = ev.clientX - offX + "px";
        ghost.style.top = ev.clientY - offY + "px";
        const col = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".board-col");
        if (col !== overCol) {
          overCol?.classList.remove("over");
          overCol = col && col.dataset.status !== card.dataset.status ? col : null;
          overCol?.classList.add("over");
        }
      }

      function blockScroll(ev) { if (dragging) ev.preventDefault(); }

      function end() {
        clearTimeout(timer);
        card.classList.remove("pressing");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", end);
        window.removeEventListener("touchmove", blockScroll);
        if (!dragging) return;
        // cegah klik navigasi setelah drag
        const stop = (c) => { c.preventDefault(); c.stopPropagation(); };
        card.addEventListener("click", stop, { capture: true, once: true });
        setTimeout(() => card.removeEventListener("click", stop, { capture: true }), 60);
        ghost.remove();
        card.classList.remove("placeholder");
        document.body.classList.remove("is-dragging");
        overCol?.classList.remove("over");
      }

      function up() {
        const target = overCol;
        const wasDragging = dragging;
        end();
        if (wasDragging && target) onDrop(card, target);
      }

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", end);
      window.addEventListener("touchmove", blockScroll, { passive: false });
    });
  });
}
