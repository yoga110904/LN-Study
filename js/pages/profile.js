import { getUser, getAccess, logout } from "../auth.js";
import { escapeHtml, rerender } from "../router.js";
import { t, getLang, setLang } from "../i18n.js";
import { getCourses, getAllWeeks, getReadSet, readKey } from "../firestore.js";
import { confirmDialog } from "../ui.js";

export function getTheme() {
  return document.documentElement.dataset.theme || "dark";
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("theme", theme); } catch {}
}

const themePreview = (mode) => `
  <span class="tp tp-${mode}" aria-hidden="true">
    <span class="tp-side"></span>
    <span class="tp-main"><i></i><i></i><span class="tp-cards"><b></b><b></b><b></b></span></span>
  </span>`;

export async function renderProfile(view, isCurrent) {
  const user = getUser();
  const { admin } = getAccess();
  const avatar = document.getElementById("userAvatar").src;

  let stats = null;
  try {
    const [courses, weeks, readSet] = await Promise.all([getCourses(), getAllWeeks(), getReadSet()]);
    const read = weeks.filter((w) => readSet.has(readKey(w.courseId, w.id))).length;
    stats = { courses: courses.length, done: courses.filter((c) => c.status === "done").length, read, total: weeks.length };
  } catch (e) {
    console.error(e);
  }
  if (!isCurrent()) return;

  view.innerHTML = `
    <section class="pf-card anim-in">
      <div class="pf-banner" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="pf-body">
        <img class="pf-avatar" src="${escapeHtml(avatar)}" alt="" referrerpolicy="no-referrer" />
        <div class="pf-id">
          <h1>${escapeHtml(user.displayName || t("profile.student"))}</h1>
          <p>${escapeHtml(user.email)}</p>
          <span class="pf-role ${admin ? "admin" : ""}">${admin ? "🛡️ " + t("profile.roleAdmin") : "🎓 " + t("profile.roleMember")}</span>
        </div>
      </div>
      ${stats ? `
        <div class="pf-stats">
          <div><b>${stats.courses}</b><small>${t("manage.statCourses")}</small></div>
          <div><b>${stats.done}</b><small>${t("stats.done")}</small></div>
          <div><b>${stats.read}<em>/${stats.total}</em></b><small>${t("common.lnRead")}</small></div>
        </div>` : ""}
    </section>

    <section class="pf-section anim-in" style="--i:1">
      <div class="pf-sec-head">
        <span class="pf-sec-ico">🧭</span>
        <div><h2>${t("profile.moreMenu")}</h2><small>${t("profile.moreMenuSub")}</small></div>
      </div>
      <div class="pf-rows">
        <a class="pf-row" href="#/flashcards">
          <span class="pf-row-ico"><svg viewBox="0 0 24 24"><path d="M8 4h11a1 1 0 0 1 1 1v12M5 7h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Zm4 6h3"/></svg></span>
          <span class="pf-row-text"><strong>${t("nav.flashcards")}</strong><small>${t("menu.fcDesc")}</small></span>
          <span class="pf-row-go">→</span>
        </a>
        <a class="pf-row" href="#/stats">
          <span class="pf-row-ico"><svg viewBox="0 0 24 24"><path d="M4 20V10m6 10V4m6 16v-7m4 7H3"/></svg></span>
          <span class="pf-row-text"><strong>${t("nav.stats")}</strong><small>${t("menu.statsDesc")}</small></span>
          <span class="pf-row-go">→</span>
        </a>
        <a class="pf-row" href="#/saved">
          <span class="pf-row-ico"><svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg></span>
          <span class="pf-row-text"><strong>${t("nav.saved")}</strong><small>${t("menu.savedDesc")}</small></span>
          <span class="pf-row-go">→</span>
        </a>
        <a class="pf-row" href="#/upload">
          <span class="pf-row-ico"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0-5 5m5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg></span>
          <span class="pf-row-text"><strong>${t("nav.upload")}</strong><small>${t("menu.uploadDesc")}</small></span>
          <span class="pf-row-go">→</span>
        </a>
        <a class="pf-row" href="#/manage">
          <span class="pf-row-ico"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"/></svg></span>
          <span class="pf-row-text"><strong>${t("nav.manage")}</strong><small>${t("menu.manageDesc")}</small></span>
          <span class="pf-row-go">→</span>
        </a>
        ${admin ? `
        <a class="pf-row" href="#/admin">
          <span class="pf-row-ico"><svg viewBox="0 0 24 24"><path d="M16 19a4 4 0 0 0-8 0M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6-1a2.5 2.5 0 1 0 0-5M21 19a3.5 3.5 0 0 0-3-3.5M6 11a2.5 2.5 0 1 1 0-5M3 19a3.5 3.5 0 0 1 3-3.5"/></svg></span>
          <span class="pf-row-text"><strong>${t("nav.admin")}</strong><small>${t("menu.adminDesc")}</small></span>
          <span class="pf-row-go">→</span>
        </a>
        ` : ""}
      </div>
    </section>

    <section class="pf-section anim-in" style="--i:2">
      <div class="pf-sec-head">
        <span class="pf-sec-ico">🎨</span>
        <div><h2>${t("profile.appearance")}</h2><small>${t("profile.appearanceSub")}</small></div>
      </div>
      <div class="choice-grid" id="themeSeg" role="radiogroup" aria-label="${t("profile.appearance")}">
        <button class="choice" data-theme="dark" role="radio">${themePreview("dark")}<span class="choice-label">${t("profile.dark")}</span><span class="choice-check">✓</span></button>
        <button class="choice" data-theme="light" role="radio">${themePreview("light")}<span class="choice-label">${t("profile.light")}</span><span class="choice-check">✓</span></button>
      </div>
    </section>

    <section class="pf-section anim-in" style="--i:2">
      <div class="pf-sec-head">
        <span class="pf-sec-ico">🌏</span>
        <div><h2>${t("profile.language")}</h2><small>${t("profile.languageSub")}</small></div>
      </div>
      <div class="choice-grid" id="langSeg" role="radiogroup" aria-label="${t("profile.language")}">
        <button class="choice choice-lang" data-lang="id" role="radio"><span class="flag">🇮🇩</span><span class="choice-label">Bahasa Indonesia<small>Indonesia</small></span><span class="choice-check">✓</span></button>
        <button class="choice choice-lang" data-lang="en" role="radio"><span class="flag">🇬🇧</span><span class="choice-label">English<small>Inggris / English</small></span><span class="choice-check">✓</span></button>
      </div>
    </section>

    <section class="pf-section anim-in" style="--i:3">
      <div class="pf-sec-head">
        <span class="pf-sec-ico">👤</span>
        <div><h2>${t("profile.account")}</h2><small>${t("profile.accountSub")}</small></div>
      </div>
      <button class="pf-row danger" id="logoutBtn">
        <span class="pf-row-ico">↩</span>
        <span class="pf-row-text"><strong>${t("profile.logoutLabel")}</strong><small>${escapeHtml(user.email)}</small></span>
        <span class="pf-row-go">→</span>
      </button>
    </section>
  `;

  const syncChoices = () => {
    view.querySelectorAll("#themeSeg .choice").forEach((b) => {
      const on = b.dataset.theme === getTheme();
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", on);
    });
    view.querySelectorAll("#langSeg .choice").forEach((b) => {
      const on = b.dataset.lang === getLang();
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", on);
    });
  };
  view.querySelectorAll("#themeSeg .choice").forEach((b) => (b.onclick = () => { setTheme(b.dataset.theme); syncChoices(); }));
  view.querySelectorAll("#langSeg .choice").forEach((b) => {
    b.onclick = () => {
      if (b.dataset.lang === getLang()) return;
      setLang(b.dataset.lang);
      rerender();
    };
  });
  syncChoices();

  view.querySelector("#logoutBtn").onclick = async () => {
    const ok = await confirmDialog({
      icon: "👋",
      title: t("profile.logoutTitle"),
      message: t("profile.logoutMsg"),
      confirmText: t("profile.logoutLabel"),
      danger: true,
    });
    if (ok) logout();
  };
}
