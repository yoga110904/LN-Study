import { escapeHtml } from "./router.js";
import { t } from "./i18n.js";
import { createCourse } from "./firestore.js";

export function confirmDialog({ title, message, confirmText = t("common.yes"), cancelText = t("common.cancel"), icon = "❓", danger = false }) {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "modal-backdrop";
    el.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">
        <div class="modal-icon">${icon}</div>
        <h3 id="mTitle">${escapeHtml(title)}</h3>
        <p>${message}</p>
        <div class="modal-actions">
          <button class="btn" data-v="0">${escapeHtml(cancelText)}</button>
          <button class="btn ${danger ? "btn-danger-solid" : "btn-primary"}" data-v="1">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("open"));
    el.querySelector('[data-v="1"]').focus();

    const close = (v) => {
      document.removeEventListener("keydown", onKey);
      el.classList.remove("open");
      setTimeout(() => el.remove(), 250);
      resolve(v);
    };
    const onKey = (e) => e.key === "Escape" && close(false);
    document.addEventListener("keydown", onKey);
    el.addEventListener("click", (e) => {
      if (e.target === el) return close(false);
      const b = e.target.closest("[data-v]");
      if (b) close(b.dataset.v === "1");
    });
  });
}

export function toast(text, type = "ok") {
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = text;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 2400);
}

export function progressBar(read, total, label = t("common.lnRead")) {
  const pct = total ? Math.round((read / total) * 100) : 0;
  return `
    <div class="progress">
      <div class="progress-top"><span>${label} · ${read}/${total}</span><span>${pct}%</span></div>
      <div class="bar"><i style="--w:${pct}%"></i></div>
    </div>`;
}

export function highlight(text, q) {
  const safe = escapeHtml(text);
  if (!q) return safe;
  const needle = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(needle, "gi"), (m) => `<mark>${m}</mark>`);
}

const CONFETTI_COLORS = ["#f5c84b", "#a8f0c8", "#d9c4ff", "#ffb3d6", "#b8c6ff", "#6c6cf5"];

export function confetti(count = 90) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = document.createElement("div");
  box.className = "confetti";
  for (let i = 0; i < count; i++) {
    const s = document.createElement("i");
    s.style.left = Math.random() * 100 + "vw";
    s.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    s.style.setProperty("--x", (Math.random() - 0.5) * 240 + "px");
    s.style.setProperty("--r", Math.random() * 900 + "deg");
    s.style.animationDuration = 1.4 + Math.random() * 1.4 + "s";
    s.style.animationDelay = Math.random() * 0.3 + "s";
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3400);
}

// Modal "Buat course baru". Return {id, name} atau null kalau batal.
export function newCourseDialog() {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "modal-backdrop";
    el.innerHTML = `
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="ncTitle" novalidate>
        <div class="modal-icon">📘</div>
        <h3 id="ncTitle">${escapeHtml(t("course.newTitle"))}</h3>
        <label for="ncName" style="text-align:left">${escapeHtml(t("upload.newName"))}</label>
        <input id="ncName" maxlength="80" autocomplete="off" placeholder="${escapeHtml(t("upload.newPh"))}" />
        <p class="nc-err" hidden></p>
        <div class="modal-actions" style="margin-top:18px">
          <button type="button" class="btn" data-cancel>${escapeHtml(t("common.cancel"))}</button>
          <button type="submit" class="btn btn-primary" disabled>${escapeHtml(t("course.newCreate"))}</button>
        </div>
      </form>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("open"));

    const form = el.querySelector("form");
    const input = el.querySelector("#ncName");
    const submit = el.querySelector('[type="submit"]');
    const err = el.querySelector(".nc-err");
    setTimeout(() => input.focus(), 50);

    const close = (v) => {
      document.removeEventListener("keydown", onKey);
      el.classList.remove("open");
      setTimeout(() => el.remove(), 250);
      resolve(v);
    };
    const onKey = (e) => e.key === "Escape" && close(null);
    document.addEventListener("keydown", onKey);
    el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-cancel]")) close(null); });
    input.addEventListener("input", () => (submit.disabled = !input.value.trim()));

    form.onsubmit = async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      submit.disabled = true;
      err.hidden = true;
      try {
        const id = await createCourse(name);
        toast(t("course.created", { name }));
        close({ id, name });
      } catch (ex) {
        err.textContent = `${t("course.createFail")}: ${ex.message}`;
        err.hidden = false;
        submit.disabled = false;
      }
    };
  });
}

export const SEARCH_DELAY = 1200;

export function debounce(fn, ms = SEARCH_DELAY) {
  let timer;
  const d = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  d.flush = (...args) => { clearTimeout(timer); fn(...args); };
  d.cancel = () => clearTimeout(timer);
  return d;
}

export const skeletonCards = (n = 4) => `
  <div class="sk sk-count"></div>
  <div class="sk-grid">
    ${Array.from({ length: n }, (_, i) => `
      <div class="sk-card" style="--i:${i}">
        <div class="sk sk-tag"></div>
        <div class="sk sk-line"></div>
        <div class="sk sk-line short"></div>
        <div class="sk sk-bar"></div>
      </div>`).join("")}
  </div>`;

// Header halaman bergaya "hero": ikon gradien + judul + subjudul (+ aksi opsional)
export const pageHero = ({ icon, cls = "", title, sub, action = "" }) => `
  <div class="page-hero anim-in">
    <div class="hero-ico ${cls}">${icon}</div>
    <div class="hero-text">
      <h1>${title}</h1>
      <p class="sub">${sub}</p>
    </div>
    ${action ? `<div class="hero-action">${action}</div>` : ""}
  </div>`;

export const statTile = ({ icon, value, label, attr = "", i = 0 }) => `
  <div class="adm-stat anim-in" style="--i:${i}">
    <span class="adm-stat-ico">${icon}</span><b ${attr}>${value}</b><small>${label}</small>
  </div>`;

// warna pastel yang konsisten untuk satu teks (mis. nama course)
export const colorFor = (s) =>
  ["c-yellow", "c-green", "c-purple", "c-pink", "c-blue"][[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % 5];
export const initialOf = (s) => (String(s).trim()[0] || "?").toUpperCase();
