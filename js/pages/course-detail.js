import {
  getCourse, getWeeks, getWeek, setCourseStatus, getReadSet, setRead, readKey, getWeekImages,
  getBookmarks, addBookmark, removeBookmark, bookmarkId, getNote, saveNote, saveAttempt,
} from "../firestore.js";
import { debounce } from "../ui.js";
import { escapeHtml } from "../router.js";
import { PASTELS, statusOf, statusBadge, canFinish, notReadyDialog } from "./courses.js";
import { confirmDialog, toast, confetti, progressBar } from "../ui.js";
import { t, locale } from "../i18n.js";
const tr = t;
import { renderSummary, readingMinutes, bindTermPopover } from "../summary.js";

const fmtDate = (ts) =>
  ts?.toDate ? ts.toDate().toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" }) : "";

export async function renderCourseDetail(view, courseId, isCurrent) {
  const [course, weeks, readSet] = await Promise.all([getCourse(courseId), getWeeks(courseId), getReadSet()]);
  if (!isCurrent()) return;
  const isRead = (w) => readSet.has(readKey(courseId, w.id));
  if (!course) {
    view.innerHTML = `<a class="crumb" href="#/courses">${t("course.back")}</a><div class="empty">${t("course.notFound")}</div>`;
    return;
  }

  view.innerHTML = `
    <a class="crumb" href="#/courses">${t("course.back")}</a>
    <h1>${escapeHtml(course.name)}</h1>
    <div class="status-row">
      <span id="statusBadge">${statusBadge(course)}</span>
      <span class="sub" style="margin:0">${t("course.lnCount", { n: weeks.length })}</span>
      <button class="btn btn-sm" id="statusBtn"></button>
    </div>
    ${weeks.length ? `<div class="panel course-progress">${progressBar(weeks.filter(isRead).length, weeks.length)}</div>` : ""}
    ${weeks.length ? `
      <div class="grid">
        ${weeks.map((w, i) => `
          <a class="card anim-in ${PASTELS[i % PASTELS.length]} ${isRead(w) ? "is-read" : ""}" style="--i:${i}" href="#/course/${encodeURIComponent(courseId)}/week/${encodeURIComponent(w.id)}">
            <span style="display:flex;gap:6px;flex-wrap:wrap">
              <span class="tag">${t("course.lnTag", { n: i + 1 })}</span>
              ${isRead(w) ? `<span class="read-badge">${t("common.readBadge")}</span>` : ""}
              ${w.quiz?.length ? `<span class="tag">${t("course.quizCount", { n: w.quiz.length })}</span>` : ""}
              ${w.terms?.length ? `<span class="tag">${t("course.termCount", { n: w.terms.length })}</span>` : ""}
            </span>
            <h3>${escapeHtml(w.title)}</h3>
            <div class="meta"><span>${fmtDate(w.createdAt)}</span><span class="go">→</span></div>
          </a>`).join("")}
      </div>` : `<div class="empty">${t("course.noLn")} <a href="#/upload" style="color:var(--primary-2)">${t("course.uploadNow")}</a></div>`}
  `;

  const btn = view.querySelector("#statusBtn");
  const syncBtn = () => {
    btn.textContent = statusOf(course) === "done" ? t("course.markProgress") : t("course.markDone");
    view.querySelector("#statusBadge").innerHTML = statusBadge(course);
  };
  syncBtn();
  btn.onclick = async () => {
    const next = statusOf(course) === "done" ? "in_progress" : "done";
    const label = t("status." + next);
    if (next === "done") {
      const st = { read: weeks.filter(isRead).length, total: weeks.length };
      if (!canFinish(st)) return notReadyDialog(course.name, st, courseId);
    }
    const ok = await confirmDialog({
      icon: next === "done" ? "🎓" : "📖",
      title: t("courses.confirmTitle"),
      message: t("course.confirmMark", { name: escapeHtml(course.name), status: label }),
    });
    if (!ok) return;
    btn.disabled = true;
    try {
      await setCourseStatus(courseId, next);
      course.status = next;
      syncBtn();
      toast(t("course.statusToast", { status: label }));
      if (next === "done") confetti();
    } catch (e) {
      toast(t("courses.updateFail") + ": " + e.message, "err");
    }
    btn.disabled = false;
  };
}

export async function renderWeekDetail(view, courseId, weekId, isCurrent) {
  const [course, week, readSet, bookmarks, noteText] = await Promise.all([
    getCourse(courseId), getWeek(courseId, weekId), getReadSet(),
    getBookmarks().catch(() => []), getNote(courseId, weekId).catch(() => ""),
  ]);
  const starred = new Set(bookmarks.filter((b) => b.weekId === weekId).map((b) => b.id));
  if (!isCurrent()) return;
  const back = `<a class="crumb" href="#/course/${encodeURIComponent(courseId)}">← ${escapeHtml(course?.name || t("week.back"))}</a>`;
  if (!week) {
    view.innerHTML = `${back}<div class="empty">${t("week.notFound")}</div>`;
    return;
  }

  const outline = week.outline || [];
  const terms = week.terms || [];
  const quiz = week.quiz || [];

  view.innerHTML = `
    ${back}
    <h1>${escapeHtml(week.title)}</h1>
    <div class="status-row">
      <span class="sub" style="margin:0">${fmtDate(week.createdAt)} · ${t("week.readTime", { n: readingMinutes(week.summary) })}</span>
      <button class="btn btn-sm read-toggle" id="readBtn"></button>
    </div>
    <div class="tabs" role="tablist">
      <button data-tab="summary" class="active">${t("week.tabSummary")}</button>
      <button data-tab="terms">${t("week.tabTerms")} (${terms.length})</button>
      <button data-tab="quiz">${t("week.tabQuiz")} (${quiz.length})</button>
      <button data-tab="notes">✍️ ${t("week.tabNotes")}</button>
    </div>

    <section data-panel="summary">
      ${outline.length ? `
        <div class="panel c-blue" style="border:0">
          <strong>${t("week.outline")}</strong>
          <ol class="outline">${outline.map((o, i) => `<li><a href="#" data-jump="${i + 1}">${escapeHtml(o)}</a></li>`).join("")}</ol>
        </div>` : ""}
      <h2>${t("week.summary")}</h2>
      <div class="summary reading">${renderSummary(week.summary, terms) || `<p class="sub">${t("week.noSummary")}</p>`}</div>
    </section>

    <section data-panel="terms" hidden>
      ${terms.length ? `<dl style="margin:0">${terms.map((t, i) => `
        <div class="term anim-in ${PASTELS[i % PASTELS.length]}" style="--i:${i}" data-term="${i}">
          <dt>${escapeHtml(t.term)}
            <button class="star-btn ${starred.has(bookmarkId(courseId, weekId, i)) ? "on" : ""}" data-star="${i}"
              title="${escapeHtml(tr("week.star"))}" aria-label="${escapeHtml(tr("week.star"))}">${starred.has(bookmarkId(courseId, weekId, i)) ? "★" : "☆"}</button>
          </dt>
          <dd>${escapeHtml(t.definition)}</dd>
          ${t.hasImage || t.image_url ? `
            <figure class="term-fig">
              <div class="term-img sk"></div>
              ${t.image_note ? `<figcaption>${escapeHtml(t.image_note)}</figcaption>` : ""}
            </figure>` : ""}
        </div>`).join("")}</dl>` : `<div class="empty">${t("week.noTerms")}</div>`}
    </section>

    <section data-panel="quiz" hidden></section>

    <section data-panel="notes" hidden>
      <div class="panel my-note">
        <div class="mn-head"><strong>✍️ ${tr("week.myNotes")}</strong><span class="mn-status" id="noteStatus"></span></div>
        <textarea id="noteText" maxlength="20000" placeholder="${escapeHtml(tr("week.notesPh"))}">${escapeHtml(noteText)}</textarea>
        <p class="hint">${tr("week.notesHint")}</p>
      </div>
    </section>
  `;

  bindTermPopover(view.querySelector(".summary"), terms);
  view.querySelectorAll("[data-jump]").forEach((a) => {
    const target = view.querySelector(`#sum-${a.dataset.jump}`);
    if (!target) return a.replaceWith(...a.childNodes);
    a.onclick = (e) => {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.animate([{ boxShadow: "0 0 0 3px var(--primary-2)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1200 });
    };
  });

  // ⭐ bookmark istilah
  view.querySelectorAll("[data-star]").forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const i = Number(b.dataset.star);
      const id = bookmarkId(courseId, weekId, i);
      const on = !starred.has(id);
      b.disabled = true;
      try {
        if (on) {
          await addBookmark({ courseId, weekId, termIndex: i, courseName: course?.name || "", weekTitle: week.title, term: terms[i].term, definition: terms[i].definition });
          starred.add(id);
        } else {
          await removeBookmark(id);
          starred.delete(id);
        }
        b.classList.toggle("on", on);
        b.textContent = on ? "★" : "☆";
        b.animate([{ transform: "scale(1.5) rotate(-20deg)" }, { transform: "none" }], { duration: 350, easing: "cubic-bezier(.3,1.6,.5,1)" });
        toast(on ? tr("week.starred") : tr("week.unstarred"), on ? "ok" : "info");
      } catch (err) {
        toast(err.message, "err");
      }
      b.disabled = false;
    };
  });

  // ✍️ catatan pribadi (autosave)
  const noteTa = view.querySelector("#noteText");
  const noteStatus = view.querySelector("#noteStatus");
  const persistNote = debounce(async () => {
    try {
      await saveNote({ courseId, weekId, courseName: course?.name || "", weekTitle: week.title }, noteTa.value);
      noteStatus.textContent = tr("week.noteSaved");
      noteStatus.className = "mn-status ok";
    } catch (err) {
      noteStatus.textContent = err.message;
      noteStatus.className = "mn-status bad";
    }
  }, 900);
  noteTa.addEventListener("input", () => {
    noteStatus.textContent = tr("week.noteSaving");
    noteStatus.className = "mn-status";
    persistNote();
  });
  window.addEventListener("hashchange", () => persistNote.flush(), { once: true });

  view.querySelectorAll(".tabs button").forEach((btn) => {
    btn.onclick = () => {
      view.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b === btn));
      view.querySelectorAll("[data-panel]").forEach((p) => {
        p.hidden = p.dataset.panel !== btn.dataset.tab;
        if (!p.hidden) replayAnim(p);
      });
    };
  });

  const readBtn = view.querySelector("#readBtn");
  let read = readSet.has(readKey(courseId, weekId));
  const syncRead = () => {
    readBtn.classList.toggle("on", read);
    readBtn.textContent = read ? t("week.isRead") : t("week.markRead");
  };
  syncRead();
  readBtn.onclick = async () => {
    readBtn.disabled = true;
    try {
      await setRead(courseId, weekId, !read);
      read = !read;
      syncRead();
      readBtn.animate([{ transform: "scale(1.12)" }, { transform: "none" }], { duration: 300 });
      toast(read ? t("week.toastRead") : t("week.toastUnread"), read ? "ok" : "info");
    } catch (e) {
      toast(t("week.saveFail") + ": " + e.message, "err");
    }
    readBtn.disabled = false;
  };

  renderQuiz(view.querySelector('[data-panel="quiz"]'), quiz, (score, wrong) =>
    saveAttempt({
      type: "ln", courseId, courseName: course?.name || "", weekIds: [weekId],
      total: quiz.length, correct: score, durationSec: 0,
      wrong: wrong.map((q) => ({ ...q, weekId, weekTitle: week.title })),
    }).catch((e) => console.error(e))
  );
  loadTermImages(view, courseId, weekId, terms);

  // buka tab tertentu lewat ?tab=notes di URL
  const wantTab = new URLSearchParams(location.hash.split("?")[1] || "").get("tab");
  view.querySelector(`.tabs button[data-tab="${wantTab}"]`)?.click();
}

async function loadTermImages(view, courseId, weekId, terms) {
  if (!terms.some((x) => x.hasImage || x.image_url)) return;
  let stored = {};
  try {
    if (terms.some((x) => x.hasImage)) stored = await getWeekImages(courseId, weekId);
  } catch (e) {
    console.error(e);
  }
  terms.forEach((x, i) => {
    const box = view.querySelector(`[data-term="${i}"] .term-img`);
    if (!box) return;
    const src = stored[i] || (/^https:\/\//i.test(x.image_url || "") ? x.image_url : "");
    if (!src) return box.closest(".term-fig").remove();
    const img = new Image();
    img.alt = x.term;
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.onload = () => { box.replaceWith(img); img.classList.add("term-img-loaded"); };
    img.onerror = () => box.closest(".term-fig").remove();
    img.src = src;
    img.onclick = () => openLightbox(src, x.term);
  });
}

function openLightbox(src, caption) {
  const el = document.createElement("div");
  el.className = "lightbox";
  el.innerHTML = `<figure><img alt="" /><figcaption></figcaption></figure>`;
  el.querySelector("img").src = src;
  el.querySelector("figcaption").textContent = caption;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("open"));
  const close = () => {
    el.classList.remove("open");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => el.remove(), 250);
  };
  const onKey = (e) => e.key === "Escape" && close();
  document.addEventListener("keydown", onKey);
  el.onclick = close;
}

function replayAnim(root) {
  root.querySelectorAll(".anim-in").forEach((el) => {
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  });
}

function isCorrect(q, idx) {
  const a = q.answer;
  if (typeof a === "number") return idx === a;
  const opt = String(q.options[idx]).trim().toLowerCase();
  const ans = String(a).trim().toLowerCase();
  // dukung jawaban berupa teks opsi atau huruf (A/B/C/D)
  return opt === ans || (ans.length === 1 && ans.charCodeAt(0) - 97 === idx);
}

function renderQuiz(root, quiz, onFinish) {
  if (!quiz.length) {
    root.innerHTML = `<div class="empty">${t("quiz.none")}</div>`;
    return;
  }
  let answered = 0, score = 0;
  const wrong = [];

  root.innerHTML = `
    ${quiz.map((q, qi) => `
      <div class="panel quiz-q anim-in" style="--i:${qi}" data-q="${qi}">
        <span class="qnum">${t("quiz.q", { i: qi + 1, n: quiz.length })}</span>
        <h3>${escapeHtml(q.question)}</h3>
        ${(q.options || []).map((o, oi) => `
          <button class="opt" data-o="${oi}">${String.fromCharCode(65 + oi)}. ${escapeHtml(o)}</button>`).join("")}
        <div class="feedback"></div>
      </div>`).join("")}
    <div class="panel score">
      <strong id="scoreText">${t("quiz.score")}: 0 / ${quiz.length}</strong>
      <button class="btn btn-sm" id="resetQuiz">${t("quiz.retry")}</button>
    </div>`;

  root.querySelectorAll(".quiz-q").forEach((box) => {
    const q = quiz[box.dataset.q];
    const opts = [...box.querySelectorAll(".opt")];
    opts.forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.o);
        const ok = isCorrect(q, idx);
        opts.forEach((b, i) => {
          b.disabled = true;
          if (isCorrect(q, i)) b.classList.add("correct");
        });
        if (!ok) {
          btn.classList.add("wrong");
          const right = opts.findIndex((_, i) => isCorrect(q, i));
          wrong.push({ q: q.question, chosen: q.options[idx], answer: right >= 0 ? q.options[right] : "" });
        }
        const fb = box.querySelector(".feedback");
        fb.className = `feedback ${ok ? "ok" : "no"}`;
        fb.textContent = ok ? t("quiz.correct") : t("quiz.wrong");
        answered++;
        if (ok) score++;
        root.querySelector("#scoreText").textContent =
          `${t("quiz.score")}: ${score} / ${quiz.length}${answered === quiz.length ? ` — ${Math.round((score / quiz.length) * 100)}%` : ""}`;
        if (answered === quiz.length) {
          const pct = score / quiz.length;
          if (pct >= 0.8) confetti();
          onFinish?.(score, wrong);
          toast(pct >= 0.8 ? t("quiz.great") : t("quiz.finished"), pct >= 0.8 ? "ok" : "info");
        }
      };
    });
  });

  root.querySelector("#resetQuiz").onclick = () => {
    renderQuiz(root, quiz, onFinish);
    root.scrollIntoView({ behavior: "smooth" });
  };
}
