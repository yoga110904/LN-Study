import { getCourses, getAllWeeks, deleteCourse, deleteWeek } from "../firestore.js";
import { escapeHtml } from "../router.js";
import { t, locale } from "../i18n.js";
import { confirmDialog, toast, debounce, pageHero, statTile, colorFor, initialOf } from "../ui.js";
import { statusBadge } from "./courses.js";

const time = (w) => (w.createdAt?.toDate ? w.createdAt.toDate().getTime() : 0);
const fmtDate = (w) =>
  w.createdAt?.toDate ? w.createdAt.toDate().toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" }) : "–";

export async function renderManage(view, isCurrent) {
  const [courses, weeks] = await Promise.all([getCourses(), getAllWeeks()]);
  if (!isCurrent()) return;

  const byCourse = {};
  for (const w of weeks) (byCourse[w.courseId] ||= []).push(w);
  Object.values(byCourse).forEach((l) => l.sort((a, b) => time(a) - time(b)));

  const trash = (attrs, label) =>
    `<button class="icon-btn" ${attrs} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">🗑</button>`;

  view.innerHTML = `
    ${pageHero({ icon: "🗂️", cls: "ico-red", title: t("manage.title"), sub: t("manage.sub") })}
    <div class="adm-stats">
      ${statTile({ icon: "📘", value: courses.length, label: t("manage.statCourses"), attr: 'id="stCourses"', i: 0 })}
      ${statTile({ icon: "📄", value: weeks.length, label: t("stats.totalLn"), attr: 'id="stWeeks"', i: 1 })}
      ${statTile({ icon: "📚", value: weeks.reduce((a, w) => a + (w.terms || []).length, 0), label: t("week.tabTerms"), attr: 'id="stTerms"', i: 2 })}
    </div>
    ${courses.length ? `
      <div class="search-box">
        <svg viewBox="0 0 24 24"><path d="m21 21-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z"/></svg><span class="search-spin" aria-hidden="true"></span>
        <input id="mFilter" type="search" autocomplete="off" placeholder="${t("manage.filterPh")}" />
      </div>
      <div class="table-wrap panel anim-in">
        <table class="mtable">
          <thead><tr>
            <th>${t("manage.colName")}</th>
            <th class="hide-sm">${t("manage.colType")}</th>
            <th>${t("manage.colInfo")}</th>
            <th class="col-act">${t("manage.colAction")}</th>
          </tr></thead>
          ${courses.map((c) => {
            const list = byCourse[c.id] || [];
            return `
            <tbody data-course="${escapeHtml(c.id)}">
              <tr class="row-course">
                <td><span class="m-course"><span class="bc-avatar sm ${colorFor(c.name)}">${escapeHtml(initialOf(c.name))}</span><strong class="m-name">${escapeHtml(c.name)}</strong></span></td>
                <td class="hide-sm"><span class="tag">${t("manage.typeCourse")}</span></td>
                <td class="m-info">${statusBadge(c)} <span class="m-count">${t("course.lnCount", { n: list.length })}</span></td>
                <td class="col-act">${trash(`data-del-course="${escapeHtml(c.id)}"`, t("del.course"))}</td>
              </tr>
              ${list.map((w) => `
              <tr class="row-ln" data-week="${escapeHtml(w.id)}">
                <td><a class="m-name" href="#/course/${encodeURIComponent(c.id)}/week/${encodeURIComponent(w.id)}">↳ ${escapeHtml(w.title)}</a></td>
                <td class="hide-sm"><span class="tag tag-ln">${t("manage.typeLn")}</span></td>
                <td class="m-info">${fmtDate(w)}</td>
                <td class="col-act">${trash(`data-del-week="${escapeHtml(w.id)}"`, t("del.week"))}</td>
              </tr>`).join("")}
            </tbody>`;
          }).join("")}
        </table>
      </div>` : `<div class="empty anim-in">${t("manage.empty")}</div>`}
  `;

  const bump = (sel, d) => {
    const el = view.querySelector(sel);
    if (el) el.textContent = Math.max(0, Number(el.textContent) + d);
  };
  const courseName = (id) => courses.find((c) => c.id === id)?.name || "";
  const fadeOut = (els) => new Promise((r) => {
    els.forEach((el) => el.classList.add("leaving"));
    setTimeout(() => { els.forEach((el) => el.remove()); r(); }, 280);
  });

  view.querySelectorAll("[data-del-course]").forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.delCourse;
      const n = (byCourse[id] || []).length;
      const ok = await confirmDialog({
        icon: "🗑️",
        title: t("del.courseTitle"),
        message: t("del.courseMsg", { name: escapeHtml(courseName(id)), n }),
        confirmText: t("del.confirm"),
        danger: true,
      });
      if (!ok) return;
      b.disabled = true;
      try {
        await deleteCourse(id);
        toast(t("del.courseDone", { name: courseName(id) }));
        const rm = byCourse[id] || [];
        bump("#stCourses", -1);
        bump("#stWeeks", -rm.length);
        bump("#stTerms", -rm.reduce((x, w) => x + (w.terms || []).length, 0));
        await fadeOut([b.closest("tbody")]);
        if (!view.querySelector("tbody[data-course]")) renderManage(view, isCurrent);
      } catch (err) {
        toast(`${t("del.fail")}: ${err.message}`, "err");
        b.disabled = false;
      }
    };
  });

  view.querySelectorAll("[data-del-week]").forEach((b) => {
    b.onclick = async () => {
      const tbody = b.closest("tbody");
      const courseId = tbody.dataset.course;
      const weekId = b.dataset.delWeek;
      const w = byCourse[courseId].find((x) => x.id === weekId);
      const ok = await confirmDialog({
        icon: "🗑️",
        title: t("del.weekTitle"),
        message: t("del.weekMsg", { name: escapeHtml(w.title) }),
        confirmText: t("del.confirm"),
        danger: true,
      });
      if (!ok) return;
      b.disabled = true;
      try {
        await deleteWeek(courseId, weekId);
        toast(t("del.weekDone"));
        bump("#stWeeks", -1);
        bump("#stTerms", -(w.terms || []).length);
        byCourse[courseId] = byCourse[courseId].filter((x) => x.id !== weekId);
        tbody.querySelector(".m-count").textContent = t("course.lnCount", { n: byCourse[courseId].length });
        await fadeOut([b.closest("tr")]);
      } catch (err) {
        toast(`${t("del.fail")}: ${err.message}`, "err");
        b.disabled = false;
      }
    };
  });

  const filter = view.querySelector("#mFilter");
  if (!filter) return;
  const box = view.querySelector(".search-box");
  const wrap = view.querySelector(".table-wrap");
  const applyFilter = debounce(() => {
    box.classList.remove("searching");
    wrap.classList.remove("searching");
    const q = filter.value.trim().toLowerCase();
    view.querySelectorAll("tbody[data-course]").forEach((tb) => {
      const courseHit = tb.querySelector(".row-course .m-name").textContent.toLowerCase().includes(q);
      let anyLn = false;
      tb.querySelectorAll(".row-ln").forEach((tr) => {
        const hit = !q || courseHit || tr.querySelector(".m-name").textContent.toLowerCase().includes(q);
        tr.hidden = !hit;
        anyLn ||= hit;
      });
      tb.hidden = !!q && !courseHit && !anyLn;
    });
    replayRows(wrap);
  });
  filter.addEventListener("input", () => {
    box.classList.add("searching");
    wrap.classList.add("searching");
    applyFilter();
  });
  filter.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyFilter.flush(); } });
}

function replayRows(wrap) {
  wrap.querySelectorAll("tbody:not([hidden]) tr:not([hidden])").forEach((tr, i) => {
    tr.style.animation = "none";
    void tr.offsetWidth;
    tr.style.animation = `fadeUp .35s ${Math.min(i, 12) * 30}ms backwards`;
  });
}
