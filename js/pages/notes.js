import { getCourses, getAllWeeks, getReadSet, readKey } from "../firestore.js";
import { escapeHtml } from "../router.js";
import { highlight, debounce, skeletonCards, pageHero, statTile, colorFor, initialOf } from "../ui.js";
import { t, locale } from "../i18n.js";
import { PASTELS, statusOf } from "./courses.js";

const FILTERS = ["all", "in_progress", "done"];
const filterLabel = (k) => (k === "all" ? t("notes.all") : t("status." + k));

const time = (w) => (w.createdAt?.toDate ? w.createdAt.toDate().getTime() : 0);
const fmtDate = (w) =>
  w.createdAt?.toDate ? w.createdAt.toDate().toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" }) : "";

export async function renderNotes(view, isCurrent) {
  const [courses, weeks, readSet] = await Promise.all([getCourses(), getAllWeeks(), getReadSet()]);
  if (!isCurrent()) return;

  const courseMap = Object.fromEntries(courses.map((c, i) => [c.id, { ...c, color: PASTELS[i % PASTELS.length] }]));
  const items = weeks
    .filter((w) => courseMap[w.courseId])
    .sort((a, b) => time(b) - time(a))
    .map((w) => ({ ...w, course: courseMap[w.courseId], read: readSet.has(readKey(w.courseId, w.id)) }));

  let q = "";
  let filter = "all";
  const count = (f) => (f === "all" ? items.length : items.filter((w) => statusOf(w.course) === f).length);

  view.innerHTML = `
    ${pageHero({ icon: "🔎", cls: "ico-teal", title: t("notes.title"), sub: t("notes.sub") })}
    <div class="adm-stats">
      ${statTile({ icon: "📄", value: items.length, label: t("stats.totalLn"), i: 0 })}
      ${statTile({ icon: "✅", value: items.filter((w) => w.read).length, label: t("notes.readCount"), i: 1 })}
      ${statTile({ icon: "⏳", value: items.filter((w) => !w.read).length, label: t("notes.unreadCount"), i: 2 })}
    </div>
    <div class="search-box search-lg">
      <svg viewBox="0 0 24 24"><path d="m21 21-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z"/></svg><span class="search-spin" aria-hidden="true"></span>
      <input id="q" type="search" placeholder="${t("notes.placeholder")}" autocomplete="off" />
      <kbd class="hide-mobile" title="${t("notes.searchHint")}">/</kbd>
    </div>
    <div class="seg seg-inline" id="filters">
      ${FILTERS.map((f) => `<button data-f="${f}" class="${f === filter ? "active" : ""}">${filterLabel(f)} <small>${count(f)}</small></button>`).join("")}
    </div>
    <div id="results"></div>
  `;

  const input = view.querySelector("#q");
  const results = view.querySelector("#results");

  const draw = () => {
    const needle = q.trim().toLowerCase();
    const list = items
      .filter((w) => filter === "all" || statusOf(w.course) === filter)
      .map((w) => {
        if (!needle) return { w, terms: [], inSummary: false };
        const inTitle = w.title.toLowerCase().includes(needle) || w.course.name.toLowerCase().includes(needle);
        const terms = (w.terms || []).filter(
          (t) => t.term.toLowerCase().includes(needle) || t.definition.toLowerCase().includes(needle)
        );
        const inSummary = (w.summary || "").toLowerCase().includes(needle);
        return inTitle || terms.length || inSummary ? { w, terms, inSummary } : null;
      })
      .filter(Boolean);

    results.innerHTML = `
      <p class="result-count">${t("notes.count", { n: list.length })}${needle ? t("notes.matching", { q: escapeHtml(q.trim()) }) : ""}</p>
      ${list.length ? `<div class="grid">${list.map(({ w, terms, inSummary }, i) => `
        <a class="card note-card anim-in ${w.read ? "is-read" : "is-unread"} accent-${colorFor(w.course.name)}" style="--i:${Math.min(i, 12)}"
           href="#/course/${encodeURIComponent(w.courseId)}/week/${encodeURIComponent(w.id)}">
          <span class="note-tags">
            <span class="nc-course"><span class="nc-avatar ${colorFor(w.course.name)}">${escapeHtml(initialOf(w.course.name))}</span>${highlight(w.course.name, q.trim())}</span>
            ${w.read ? `<span class="read-badge">${t("common.readBadge")}</span>` : `<span class="unread-dot" title="${t("notes.unreadCount")}"></span>`}
          </span>
          <h3>${highlight(w.title, q.trim())}</h3>
          ${terms.length ? `<ul class="term-hits">${terms.slice(0, 3).map((t) =>
            `<li><b>${highlight(t.term, q.trim())}</b> — ${highlight(t.definition, q.trim())}</li>`).join("")}
            ${terms.length > 3 ? `<li class="more">${t("notes.moreTerms", { n: terms.length - 3 })}</li>` : ""}</ul>` : ""}
          ${!terms.length && inSummary ? `<p class="hit-note">${t("notes.inSummary")}</p>` : ""}
          <div class="meta">
            <span class="nc-meta">${fmtDate(w)}<span>·</span>📚 ${(w.terms || []).length}<span>·</span>❓ ${(w.quiz || []).length}</span>
            <span class="go">→</span>
          </div>
        </a>`).join("")}</div>`
      : `<div class="empty anim-in">${items.length ? t("notes.noMatch") : t("notes.noNotes")}</div>`}
    `;
  };

  const box = view.querySelector(".search-box");
  const runSearch = debounce(() => {
    q = input.value;
    box.classList.remove("searching");
    draw();
  });
  input.addEventListener("input", () => {
    if (input.value === q) { runSearch.cancel(); box.classList.remove("searching"); return; }
    box.classList.add("searching");
    results.innerHTML = skeletonCards(4);
    runSearch();
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runSearch.flush(); } });
  view.querySelectorAll("[data-f]").forEach((b) => {
    b.onclick = () => {
      filter = b.dataset.f;
      q = input.value;
      runSearch.cancel();
      box.classList.remove("searching");
      view.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("active", x === b));
      draw();
    };
  });
  draw();
  if (matchMedia("(min-width: 900px)").matches) input.focus();
}

// tekan "/" di mana saja untuk langsung ke search
document.addEventListener("keydown", (e) => {
  if (e.key !== "/" || e.target.closest("input, textarea, select")) return;
  e.preventDefault();
  if (location.hash === "#/notes") document.getElementById("q")?.focus();
  else location.hash = "#/notes";
});
