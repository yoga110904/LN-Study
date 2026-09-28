import { initAuth, whenReady, getUser, getAccess } from "./auth.js";
import { t, applyStatic } from "./i18n.js";
import { renderProfile } from "./pages/profile.js";
import { renderLogin } from "./pages/login.js";
import { renderCourses } from "./pages/courses.js";
import { renderCourseDetail, renderWeekDetail } from "./pages/course-detail.js";
import { renderUpload } from "./pages/upload.js";
import { renderNotes } from "./pages/notes.js";
import { renderNoAccess } from "./pages/no-access.js";
import { renderAdmin } from "./pages/admin.js";
import { renderManage } from "./pages/manage.js";
import { renderExam } from "./pages/exam.js";
import { renderSaved } from "./pages/saved.js";
import { renderStats } from "./pages/stats.js";
import { renderFlashcards } from "./pages/flashcards.js";

const view = document.getElementById("view");
const chrome = ["sidebar", "bottomNav"].map((id) => document.getElementById(id));

const routes = [
  { re: /^\/login$/, page: renderLogin, public: true },
  { re: /^\/no-access$/, page: renderNoAccess, noAccess: true },
  { re: /^\/admin$/, page: renderAdmin, nav: "admin", admin: true },
  { re: /^\/courses$/, page: renderCourses, nav: "courses" },
  { re: /^\/course\/([^/]+)$/, page: renderCourseDetail, nav: "courses" },
  { re: /^\/course\/([^/]+)\/week\/([^/]+)$/, page: renderWeekDetail, nav: "courses" },
  { re: /^\/notes$/, page: renderNotes, nav: "notes" },
  { re: /^\/manage$/, page: renderManage, nav: "manage" },
  { re: /^\/exam$/, page: renderExam, nav: "exam" },
  { re: /^\/saved$/, page: renderSaved, nav: "saved" },
  { re: /^\/stats$/, page: renderStats, nav: "stats" },
  { re: /^\/flashcards$/, page: renderFlashcards, nav: "flashcards" },
  { re: /^\/upload$/, page: renderUpload, nav: "upload" },
  { re: /^\/profile$/, page: renderProfile, nav: "profile" },
];

export const navigate = (path) => (location.hash = "#" + path);

let renderId = 0;

const splash = document.getElementById("splash");
const topProgress = document.getElementById("topProgress");

function hideSplash() {
  if (!splash || splash.classList.contains("hide")) return;
  splash.classList.add("hide");
  setTimeout(() => splash.remove(), 600);
}

// kerangka shimmer sementara data diambil
const SKELETON = `
  <div class="skeleton" aria-busy="true">
    <div class="sk sk-title"></div>
    <div class="sk sk-sub"></div>
    <div class="sk-grid">
      ${Array.from({ length: 6 }, (_, i) => `
        <div class="sk-card" style="--i:${i}">
          <div class="sk sk-tag"></div>
          <div class="sk sk-line"></div>
          <div class="sk sk-line short"></div>
          <div class="sk sk-bar"></div>
        </div>`).join("")}
    </div>
  </div>`;

async function render() {
  await whenReady();
  const path = location.hash.slice(1).split("?")[0] || "/courses";
  const user = getUser();
  const route = routes.find((r) => r.re.test(path));

  const acc = getAccess();
  const home = !user ? "/login" : acc.allowed ? "/courses" : "/no-access";

  if (!route) return navigate(home);
  if (!user && !route.public) return navigate("/login");
  if (user && !acc.allowed && !route.noAccess) return navigate("/no-access");
  if (user && acc.allowed && (route.public || route.noAccess)) return navigate("/courses");
  if (route.admin && !acc.admin) return navigate(home);

  applyStatic();
  chrome.forEach((el) => (el.hidden = !(user && acc.allowed)));
  document.querySelectorAll(".admin-only").forEach((el) => (el.hidden = !acc.admin));
  document.querySelectorAll("[data-nav]").forEach((a) =>
    a.classList.toggle("active", a.dataset.nav === route.nav)
  );
  if (user) {
    const src = user.photoURL || initialsAvatar(user.displayName || user.email);
    document.querySelectorAll(".js-avatar").forEach((img) => {
      if (img.src !== src) img.src = src;
      img.title = `${user.displayName || ""} (${user.email})`;
    });
  }

  const id = ++renderId;
  view.innerHTML = SKELETON;
  topProgress.classList.remove("done");
  topProgress.classList.add("run");
  window.scrollTo(0, 0);
  try {
    const params = path.match(route.re).slice(1).map(decodeURIComponent);
    await route.page(view, ...params, () => id === renderId);
    if (id === renderId) {
      topProgress.classList.add("done");
      hideSplash();
      view.classList.remove("page-enter");
      void view.offsetWidth;
      view.classList.add("page-enter");
    }
  } catch (err) {
    console.error(err);
    if (id === renderId) {
      topProgress.classList.add("done");
      hideSplash();
      view.innerHTML = `<div class="error">${t("common.loadFail")}: ${escapeHtml(err.message)}</div>`;
    }
  }
}

// Avatar inisial dibuat lokal (tidak mengirim nama user ke layanan pihak ketiga)
function initialsAvatar(name) {
  const initials = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "U";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#6c6cf5"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="700" fill="#fff">${escapeHtml(initials)}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

export function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

window.addEventListener("hashchange", render);
export const rerender = render;
initAuth(() => render());
