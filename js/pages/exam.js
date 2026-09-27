import { getCourses, getAllWeeks, saveAttempt, getAttempts } from "../firestore.js";
import { escapeHtml } from "../router.js";
import { t, locale } from "../i18n.js";
import { pageHero, statTile, confirmDialog, confetti, toast, colorFor, initialOf } from "../ui.js";
import { statusOf } from "./courses.js";

// index opsi yang benar; answer boleh teks opsi, huruf (A-D), atau index 0-based
export function correctIndex(q) {
  const opts = q.options || [];
  if (typeof q.answer === "number") return q.answer;
  const ans = String(q.answer).trim().toLowerCase();
  const byText = opts.findIndex((o) => String(o).trim().toLowerCase() === ans);
  if (byText >= 0) return byText;
  if (ans.length === 1 && ans >= "a" && ans <= "z") return ans.charCodeAt(0) - 97;
  return -1;
}

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const fmtDate = (ts) =>
  ts?.toDate ? ts.toDate().toLocaleDateString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

let activeTimer = null;
window.addEventListener("hashchange", () => { clearInterval(activeTimer); activeTimer = null; });

export async function renderExam(view, isCurrent) {
  const [courses, weeks, attempts] = await Promise.all([getCourses(), getAllWeeks(), getAttempts(50)]);
  if (!isCurrent()) return;

  const withQuiz = (c) => weeks.filter((w) => w.courseId === c.id && (w.quiz || []).length);
  const usable = courses.filter((c) => withQuiz(c).length);
  const state = {
    courseId: usable.find((c) => statusOf(c) === "in_progress")?.id || usable[0]?.id,
    weekIds: null,
    count: 10,
    minutes: 0,
  };

  // ------------------------------------------------------------------ setup
  function renderSetup() {
    clearInterval(activeTimer);
    const exams = attempts.filter((a) => a.type === "exam");
    const avg = exams.length ? Math.round(exams.reduce((s, a) => s + (a.total ? a.correct / a.total : 0), 0) / exams.length * 100) : 0;
    const best = exams.reduce((m, a) => Math.max(m, a.total ? Math.round((a.correct / a.total) * 100) : 0), 0);

    view.innerHTML = `
      ${pageHero({ icon: "📝", cls: "ico-amber", title: t("exam.title"), sub: t("exam.sub") })}
      <div class="adm-stats">
        ${statTile({ icon: "📝", value: exams.length, label: t("exam.attempts"), i: 0 })}
        ${statTile({ icon: "🎯", value: `${avg}<small>%</small>`, label: t("exam.avg"), i: 1 })}
        ${statTile({ icon: "🏆", value: `${best}<small>%</small>`, label: t("exam.best"), i: 2 })}
      </div>
      ${usable.length ? `
        <div class="ex-layout">
          <section class="panel ex-setup anim-in" style="--i:3">
            <div class="ex-block">
              <div class="ex-block-head"><span class="ex-num">1</span><div><strong>${t("exam.course")}</strong><small>${t("exam.courseHint")}</small></div></div>
              <div class="ex-courses">
                ${usable.map((c) => `
                  <button type="button" class="ex-course ${c.id === state.courseId ? "active" : ""}" data-c="${escapeHtml(c.id)}">
                    <span class="bc-avatar sm ${colorFor(c.name)}">${escapeHtml(initialOf(c.name))}</span>
                    <span class="ex-course-name">${escapeHtml(c.name)}<small>${t("exam.qAvailable", { n: withQuiz(c).reduce((s, w) => s + w.quiz.length, 0) })}</small></span>
                    <span class="ex-check">✓</span>
                  </button>`).join("")}
              </div>
            </div>

            <div class="ex-block">
              <div class="ex-block-head">
                <span class="ex-num">2</span>
                <div><strong>${t("exam.lns")}</strong><small>${t("exam.lnsHint")}</small></div>
                <button type="button" class="link-btn" id="allLn"></button>
              </div>
              <div class="chip-row" id="lnChips"></div>
            </div>

            <div class="ex-block ex-block-row">
              <div>
                <div class="ex-block-head"><span class="ex-num">3</span><div><strong>${t("exam.count")}</strong><small>${t("exam.countHint")}</small></div></div>
                <div class="seg seg-sm" id="countSeg">
                  ${[10, 20, 0].map((n) => `<button type="button" data-n="${n}">${n || t("notes.all")}</button>`).join("")}
                </div>
              </div>
              <div>
                <div class="ex-block-head"><span class="ex-num">4</span><div><strong>${t("exam.timer")}</strong><small>${t("exam.timerHint")}</small></div></div>
                <div class="seg seg-sm" id="timerSeg">
                  ${[0, 10, 20, 30].map((m) => `<button type="button" data-m="${m}">${m ? t("exam.min", { n: m }) : t("exam.noTimer")}</button>`).join("")}
                </div>
              </div>
            </div>
          </section>

          <aside class="panel ex-summary anim-in" style="--i:4">
            <strong class="ex-sum-title">🧾 ${t("exam.summary")}</strong>
            <dl class="ex-sum">
              <div><dt>${t("exam.sumCourse")}</dt><dd id="sumCourse"></dd></div>
              <div><dt>LN</dt><dd id="sumLn"></dd></div>
              <div><dt>${t("exam.sumQ")}</dt><dd id="sumQ"></dd></div>
              <div><dt>${t("exam.timer")}</dt><dd id="sumTime"></dd></div>
            </dl>
            <button class="btn btn-primary btn-block ex-start" id="startBtn"></button>
          </aside>
        </div>` : `<div class="empty anim-in">${t("exam.noQuiz")}</div>`}

      ${exams.length ? `
        <h2>${t("exam.history")}</h2>
        <div class="panel ex-history anim-in">
          ${exams.slice(0, 8).map((a) => {
            const p = a.total ? Math.round((a.correct / a.total) * 100) : 0;
            return `
            <div class="ex-hist-row">
              <span class="score-pill ${p >= 80 ? "good" : p >= 60 ? "mid" : "low"}">${p}%</span>
              <div class="ex-hist-main"><strong>${escapeHtml(a.courseName)}</strong><small>${a.correct}/${a.total} · ${fmtTime(a.durationSec)} · ${fmtDate(a.createdAt)}</small></div>
            </div>`;
          }).join("")}
        </div>` : ""}
    `;
    if (!usable.length) return;

    const lnChips = view.querySelector("#lnChips");
    const allLn = view.querySelector("#allLn");
    const startBtn = view.querySelector("#startBtn");

    const pool = () => withQuiz(usable.find((c) => c.id === state.courseId))
      .filter((w) => state.weekIds.includes(w.id))
      .flatMap((w) => w.quiz.map((q) => ({ ...q, weekId: w.id, weekTitle: w.title })))
      .filter((q) => correctIndex(q) >= 0 && (q.options || []).length > 1);

    const syncSetup = () => {
      const lns = withQuiz(usable.find((c) => c.id === state.courseId));
      if (!state.weekIds) state.weekIds = lns.map((w) => w.id);
      lnChips.innerHTML = lns.map((w) => `
        <button type="button" class="chip ${state.weekIds.includes(w.id) ? "on" : ""}" data-w="${escapeHtml(w.id)}">
          ${escapeHtml(w.title)} <small>${w.quiz.length}</small>
        </button>`).join("");
      allLn.textContent = state.weekIds.length === lns.length ? t("exam.none") : t("exam.all");
      view.querySelectorAll("#countSeg button").forEach((b) => b.classList.toggle("active", Number(b.dataset.n) === state.count));
      view.querySelectorAll("#timerSeg button").forEach((b) => b.classList.toggle("active", Number(b.dataset.m) === state.minutes));
      const n = pool().length;
      const take = state.count ? Math.min(state.count, n) : n;
      startBtn.disabled = !take;
      startBtn.textContent = take ? t("exam.start", { n: take }) : t("exam.pickLn");
      const course = usable.find((c) => c.id === state.courseId);
      view.querySelector("#sumCourse").textContent = course.name;
      view.querySelector("#sumLn").textContent = t("exam.lnSelected", { n: state.weekIds.length, total: lns.length });
      view.querySelector("#sumQ").textContent = take ? `${take} / ${n}` : "–";
      view.querySelector("#sumTime").textContent = state.minutes ? t("exam.min", { n: state.minutes }) : t("exam.unlimited");

      lnChips.querySelectorAll("[data-w]").forEach((c) => {
        c.onclick = () => {
          const id = c.dataset.w;
          state.weekIds = state.weekIds.includes(id) ? state.weekIds.filter((x) => x !== id) : [...state.weekIds, id];
          syncSetup();
        };
      });
    };

    view.querySelectorAll("[data-c]").forEach((b) => {
      b.onclick = () => {
        state.courseId = b.dataset.c;
        state.weekIds = null;
        view.querySelectorAll("[data-c]").forEach((x) => x.classList.toggle("active", x === b));
        syncSetup();
      };
    });
    allLn.onclick = () => {
      const lns = withQuiz(usable.find((c) => c.id === state.courseId));
      state.weekIds = state.weekIds.length === lns.length ? [] : lns.map((w) => w.id);
      syncSetup();
    };
    view.querySelectorAll("#countSeg button").forEach((b) => (b.onclick = () => { state.count = Number(b.dataset.n); syncSetup(); }));
    view.querySelectorAll("#timerSeg button").forEach((b) => (b.onclick = () => { state.minutes = Number(b.dataset.m); syncSetup(); }));
    startBtn.onclick = () => {
      const all = shuffle(pool());
      startRun(state.count ? all.slice(0, state.count) : all);
    };
    syncSetup();
  }

  // ------------------------------------------------------------------ run
  function startRun(questions) {
    const course = usable.find((c) => c.id === state.courseId);
    const qs = questions.map((q) => {
      const correct = correctIndex(q);
      const order = shuffle(q.options.map((_, i) => i));
      return { ...q, order, correctPos: order.indexOf(correct), chosen: null };
    });
    let cur = 0;
    const started = Date.now();
    const limitSec = state.minutes * 60;

    view.innerHTML = `
      <div class="ex-run">
        <div class="ex-top">
          <button class="btn btn-sm" id="quitBtn">✕ ${t("exam.quit")}</button>
          <span class="ex-counter" id="counter"></span>
          <span class="ex-timer ${limitSec ? "" : "up"}" id="timer">⏱ 00:00</span>
        </div>
        <div class="ex-progress"><i id="bar"></i></div>
        <div id="qBox"></div>
        <div class="ex-nav">
          <button class="btn" id="prevBtn">← ${t("exam.prev")}</button>
          <button class="btn btn-primary" id="nextBtn"></button>
        </div>
        <div class="ex-dots" id="dots"></div>
      </div>`;

    const qBox = view.querySelector("#qBox");
    const timerEl = view.querySelector("#timer");

    const tick = () => {
      const el = Math.floor((Date.now() - started) / 1000);
      if (limitSec) {
        const left = Math.max(0, limitSec - el);
        timerEl.textContent = `⏱ ${fmtTime(left)}`;
        timerEl.classList.toggle("warn", left <= 60);
        if (left === 0) { toast(t("exam.timeUp"), "info"); finish(); }
      } else {
        timerEl.textContent = `⏱ ${fmtTime(el)}`;
      }
    };
    clearInterval(activeTimer);
    activeTimer = setInterval(tick, 1000);
    tick();

    function show(dir = 0) {
      const q = qs[cur];
      view.querySelector("#counter").textContent = t("quiz.q", { i: cur + 1, n: qs.length });
      view.querySelector("#bar").style.width = `${((cur + 1) / qs.length) * 100}%`;
      qBox.innerHTML = `
        <div class="panel ex-q ${dir > 0 ? "from-right" : dir < 0 ? "from-left" : ""}">
          <span class="tag">${escapeHtml(q.weekTitle)}</span>
          <h3>${escapeHtml(q.question)}</h3>
          <div class="ex-opts-list">
            ${q.order.map((oi, pos) => `
              <button class="opt ${q.chosen === pos ? "picked" : ""}" data-pos="${pos}">
                <span class="opt-letter">${String.fromCharCode(65 + pos)}</span>${escapeHtml(q.options[oi])}
              </button>`).join("")}
          </div>
        </div>`;
      qBox.querySelectorAll("[data-pos]").forEach((b) => {
        b.onclick = () => {
          q.chosen = Number(b.dataset.pos);
          qBox.querySelectorAll("[data-pos]").forEach((x) => x.classList.toggle("picked", x === b));
          renderDots();
          if (cur < qs.length - 1) setTimeout(() => { if (qs[cur] === q) { cur++; show(1); } }, 350);
        };
      });
      view.querySelector("#prevBtn").disabled = cur === 0;
      const next = view.querySelector("#nextBtn");
      next.textContent = cur === qs.length - 1 ? `${t("exam.finish")} ✓` : `${t("exam.next")} →`;
      renderDots();
    }

    function renderDots() {
      const dots = view.querySelector("#dots");
      dots.innerHTML = qs.map((q, i) => `<button class="ex-dot ${q.chosen !== null ? "done" : ""} ${i === cur ? "cur" : ""}" data-i="${i}" aria-label="${i + 1}">${i + 1}</button>`).join("");
      dots.querySelectorAll("[data-i]").forEach((d) => (d.onclick = () => { const i = Number(d.dataset.i); const dir = i > cur ? 1 : -1; cur = i; show(dir); }));
    }

    view.querySelector("#prevBtn").onclick = () => { if (cur > 0) { cur--; show(-1); } };
    view.querySelector("#nextBtn").onclick = async () => {
      if (cur < qs.length - 1) { cur++; return show(1); }
      const left = qs.filter((q) => q.chosen === null).length;
      if (left) {
        const ok = await confirmDialog({ icon: "⚠️", title: t("exam.unansweredTitle"), message: t("exam.unansweredMsg", { n: left }), confirmText: t("exam.finish") });
        if (!ok) return;
      }
      finish();
    };
    view.querySelector("#quitBtn").onclick = async () => {
      const ok = await confirmDialog({ icon: "🚪", title: t("exam.quitTitle"), message: t("exam.quitMsg"), confirmText: t("exam.quit"), danger: true });
      if (ok) renderSetup();
    };

    let finished = false;
    async function finish() {
      if (finished) return;
      finished = true;
      clearInterval(activeTimer);
      const durationSec = Math.round((Date.now() - started) / 1000);
      const correct = qs.filter((q) => q.chosen === q.correctPos).length;
      const wrongQs = qs.filter((q) => q.chosen !== q.correctPos);
      renderResult(qs, correct, durationSec, wrongQs);
      try {
        await saveAttempt({
          type: "exam",
          courseId: course.id,
          courseName: course.name,
          weekIds: [...new Set(qs.map((q) => q.weekId))],
          total: qs.length,
          correct,
          durationSec,
          wrong: wrongQs.map((q) => ({
            q: q.question,
            chosen: q.chosen === null ? "" : q.options[q.order[q.chosen]],
            answer: q.options[q.order[q.correctPos]],
            weekId: q.weekId,
            weekTitle: q.weekTitle,
          })),
        });
        attempts.unshift({ type: "exam", courseName: course.name, total: qs.length, correct, durationSec, createdAt: { toDate: () => new Date() } });
      } catch (e) {
        toast(`${t("exam.saveFail")}: ${e.message}`, "err");
      }
    }

    show();
  }

  // ------------------------------------------------------------------ result
  function renderResult(qs, correct, durationSec, wrongQs) {
    const pct = qs.length ? Math.round((correct / qs.length) * 100) : 0;
    const msg = pct >= 80 ? t("exam.msgGreat") : pct >= 60 ? t("exam.msgOk") : t("exam.msgLow");
    view.innerHTML = `
      <div class="ex-result anim-in">
        <div class="score-ring ${pct >= 80 ? "good" : pct >= 60 ? "mid" : "low"}" style="--p:${pct}">
          <div><b>${pct}%</b><small>${correct}/${qs.length}</small></div>
        </div>
        <h1>${msg}</h1>
        <p class="sub">⏱ ${fmtTime(durationSec)} · ${t("exam.correctN", { n: correct })} · ${t("exam.wrongN", { n: wrongQs.length })}</p>
        <div class="row" style="justify-content:center">
          ${wrongQs.length ? `<button class="btn btn-accent" id="retryWrong">↻ ${t("exam.retryWrong", { n: wrongQs.length })}</button>` : ""}
          <button class="btn btn-primary" id="newExam">${t("exam.new")}</button>
        </div>
      </div>
      ${wrongQs.length ? `
        <h2>${t("exam.review")}</h2>
        ${wrongQs.map((q, i) => `
          <div class="panel ex-review anim-in" style="--i:${Math.min(i, 10)}">
            <span class="tag">${escapeHtml(q.weekTitle)}</span>
            <h3>${escapeHtml(q.question)}</h3>
            ${q.chosen !== null ? `<p class="rv rv-bad">✗ ${escapeHtml(q.options[q.order[q.chosen]])}</p>` : `<p class="rv rv-skip">— ${t("exam.skipped")}</p>`}
            <p class="rv rv-ok">✓ ${escapeHtml(q.options[q.order[q.correctPos]])}</p>
          </div>`).join("")}` : ""}
    `;
    if (pct >= 80) confetti();
    view.querySelector("#newExam").onclick = renderSetup;
    view.querySelector("#retryWrong")?.addEventListener("click", () => startRun(shuffle(wrongQs.map(({ order, correctPos, chosen, ...q }) => q))));
  }

  renderSetup();
}
