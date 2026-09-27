import { getAttempts, getActivityDays, todayKey } from "../firestore.js";
import { escapeHtml } from "../router.js";
import { t, locale } from "../i18n.js";
import { pageHero, statTile } from "../ui.js";

const DAY = 86400000;

function streaks(daySet) {
  const d = new Date();
  if (!daySet.has(todayKey(d))) d.setTime(d.getTime() - DAY); // streak masih hidup kalau kemarin aktif
  let current = 0;
  while (daySet.has(todayKey(d))) { current++; d.setTime(d.getTime() - DAY); }

  const sorted = [...daySet].sort();
  let longest = 0, run = 0, prev = null;
  for (const k of sorted) {
    const cur = new Date(k + "T12:00:00");
    run = prev && Math.round((cur - prev) / DAY) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = cur;
  }
  return { current, longest };
}

export async function renderStats(view, isCurrent) {
  const [attempts, days] = await Promise.all([getAttempts(200), getActivityDays()]);
  if (!isCurrent()) return;

  const daySet = new Set(days);
  attempts.forEach((a) => { const d = a.createdAt?.toDate?.(); if (d) daySet.add(todayKey(d)); });
  const { current, longest } = streaks(daySet);
  const avg = attempts.length ? Math.round(attempts.reduce((s, a) => s + (a.total ? a.correct / a.total : 0), 0) / attempts.length * 100) : 0;

  // --- heatmap 14 minggu terakhir (kolom = minggu, baris = Sen..Min)
  const perDay = {};
  attempts.forEach((a) => { const d = a.createdAt?.toDate?.(); if (d) perDay[todayKey(d)] = (perDay[todayKey(d)] || 0) + 1; });
  const WEEKS = 14;
  const end = new Date();
  const start = new Date(end.getTime() - ((WEEKS - 1) * 7 + ((end.getDay() + 6) % 7)) * DAY);
  const cells = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + DAY)) {
    const k = todayKey(d);
    const lvl = Math.min(4, (daySet.has(k) ? 1 : 0) + (perDay[k] || 0));
    cells.push({ k, lvl, label: d.toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" }) });
  }
  const dayNames = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: "narrow" }));

  // --- skor 12 percobaan terakhir (lama → baru)
  const recent = attempts.slice(0, 12).reverse();

  // --- LN yang paling sering salah
  const wrongMap = {};
  attempts.forEach((a) => (a.wrong || []).forEach((w) => {
    const key = w.weekId || w.weekTitle;
    wrongMap[key] ||= { title: w.weekTitle, course: a.courseName, courseId: a.courseId, weekId: w.weekId, n: 0 };
    wrongMap[key].n++;
  }));
  const topWrong = Object.values(wrongMap).sort((a, b) => b.n - a.n).slice(0, 5);
  const maxWrong = topWrong[0]?.n || 1;

  view.innerHTML = `
    ${pageHero({ icon: "📈", cls: "ico-teal", title: t("stats.title"), sub: t("stats.sub") })}
    <div class="adm-stats stats-4">
      ${statTile({ icon: "🔥", value: current, label: t("stats.streak"), i: 0 })}
      ${statTile({ icon: "🏆", value: longest, label: t("stats.longest"), i: 1 })}
      ${statTile({ icon: "📝", value: attempts.length, label: t("stats.quizDone"), i: 2 })}
      ${statTile({ icon: "🎯", value: `${avg}<small>%</small>`, label: t("stats.avgScore"), i: 3 })}
    </div>

    <section class="panel st-block anim-in" style="--i:4">
      <div class="st-head-row"><strong>🗓️ ${t("stats.activity")}</strong><small>${t("stats.activitySub", { n: WEEKS })}</small></div>
      <div class="heat-wrap">
        <div class="heat-days">${dayNames.map((d, i) => `<span>${i % 2 === 0 ? d : ""}</span>`).join("")}</div>
        <div class="heatmap" style="--weeks:${WEEKS}">
          ${cells.map((c, i) => `<i class="lv${c.lvl}" style="--d:${i * 6}ms" title="${escapeHtml(c.label)}"></i>`).join("")}
        </div>
      </div>
      <div class="heat-legend"><span>${t("stats.less")}</span><i class="lv0"></i><i class="lv1"></i><i class="lv2"></i><i class="lv3"></i><i class="lv4"></i><span>${t("stats.more")}</span></div>
    </section>

    <div class="st-grid">
      <section class="panel st-block anim-in" style="--i:5">
        <div class="st-head-row"><strong>📊 ${t("stats.scores")}</strong><small>${t("stats.scoresSub")}</small></div>
        ${recent.length ? `
          <div class="score-chart">
            ${recent.map((a, i) => {
              const p = a.total ? Math.round((a.correct / a.total) * 100) : 0;
              const d = a.createdAt?.toDate?.();
              return `
                <div class="sc-col" title="${escapeHtml(a.courseName)} · ${a.correct}/${a.total}${d ? " · " + d.toLocaleDateString(locale(), { day: "numeric", month: "short" }) : ""}">
                  <span class="sc-val">${p}</span>
                  <span class="sc-track"><i class="${a.type}" style="--h:${Math.max(p, 2)}%;--d:${i * 50}ms"></i></span>
                  <span class="sc-lbl">${a.type === "exam" ? "📝" : "📄"}</span>
                </div>`;
            }).join("")}
          </div>
          <div class="heat-legend"><i class="sw-exam"></i><span>${t("stats.legendExam")}</span><i class="sw-ln"></i><span>${t("stats.legendLn")}</span></div>` : `<p class="chart-empty">${t("stats.noAttempts")}</p>`}
      </section>

      <section class="panel st-block anim-in" style="--i:6">
        <div class="st-head-row"><strong>🎯 ${t("stats.weak")}</strong><small>${t("stats.weakSub")}</small></div>
        ${topWrong.length ? topWrong.map((w) => `
          <a class="weak-row" href="${w.courseId && w.weekId ? `#/course/${encodeURIComponent(w.courseId)}/week/${encodeURIComponent(w.weekId)}` : "#/notes"}">
            <span class="weak-name"><strong>${escapeHtml(w.title)}</strong><small>${escapeHtml(w.course)}</small></span>
            <span class="weak-track"><i style="--w:${(w.n / maxWrong) * 100}%"></i></span>
            <span class="weak-n">${w.n}×</span>
          </a>`).join("") : `<p class="chart-empty">${t("stats.noWeak")}</p>`}
      </section>
    </div>
  `;
}
