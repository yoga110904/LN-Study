import { escapeHtml } from "./router.js";
import { t } from "./i18n.js";

const PASTEL = ["c-yellow", "c-green", "c-purple", "c-pink", "c-blue"];

// Kelompokkan istilah ke cabang outline berdasarkan section summary tempat istilah itu muncul
function buildTree(outline, summary, terms) {
  const blocks = String(summary || "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const sectionText = outline.map((_, i) => {
    const byNum = blocks.find((b) => new RegExp(`^\\s*${i + 1}[.)]\\s`).test(b));
    return (byNum || "").toLowerCase();
  });
  // kalau summary tidak bernomor, cocokkan dengan judul outline saja
  const hasSections = sectionText.some(Boolean);

  const branches = outline.map((title, i) => ({ title, i, leaves: [] }));
  const other = { title: t("mm.other"), i: -1, leaves: [] };

  terms.forEach((term, ti) => {
    const names = String(term.term).split(/\s*[/&]\s*|\s*\(|\)/).map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 3);
    const hit = (txt) => names.some((n) => txt.includes(n));
    let idx = hasSections ? sectionText.findIndex(hit) : -1;
    if (idx < 0) idx = outline.findIndex((o) => hit(o.toLowerCase()));
    (idx >= 0 ? branches[idx] : other).leaves.push({ ...term, ti });
  });
  if (other.leaves.length) branches.push(other);
  return branches;
}

export function renderMindmap(title, outline, summary, terms) {
  if (!outline.length && !terms.length) return `<div class="empty">${t("mm.empty")}</div>`;
  const branches = buildTree(outline.length ? outline : [t("mm.allTerms")], summary, terms);

  return `
    <div class="mm-toolbar">
      <span class="hint" style="margin:0">💡 ${t("mm.hint")}</span>
      <div class="mm-tools">
        <button class="chip-btn" data-mm="expand">⊕ ${t("mm.expand")}</button>
        <button class="chip-btn" data-mm="collapse">⊖ ${t("mm.collapse")}</button>
      </div>
    </div>
    <div class="mm">
      <div class="mm-root anim-in"><span>🧠</span>${escapeHtml(title)}</div>
      <ul class="mm-branches">
        ${branches.map((b, n) => `
          <li class="mm-branch ${b.i < 0 ? "mm-other" : PASTEL[n % PASTEL.length]} open anim-in" style="--i:${n + 1}">
            <button class="mm-node" aria-expanded="true">
              <span class="mm-num">${b.i < 0 ? "…" : b.i + 1}</span>
              <span class="mm-title">${escapeHtml(b.title)}</span>
              <span class="mm-count">${b.leaves.length}</span>
              <span class="mm-caret">▾</span>
            </button>
            <ul class="mm-leaves">
              ${b.leaves.length
                ? b.leaves.map((l) => `<li><button type="button" class="kw mm-leaf" data-t="${l.ti}">${escapeHtml(l.term)}</button></li>`).join("")
                : `<li class="mm-none">${t("mm.noTerms")}</li>`}
            </ul>
          </li>`).join("")}
      </ul>
    </div>`;
}

export function bindMindmap(root) {
  root.querySelectorAll(".mm-node").forEach((n) => {
    n.onclick = () => {
      const li = n.closest(".mm-branch");
      const open = li.classList.toggle("open");
      n.setAttribute("aria-expanded", open);
    };
  });
  root.querySelectorAll("[data-mm]").forEach((b) => {
    b.onclick = () => {
      const open = b.dataset.mm === "expand";
      root.querySelectorAll(".mm-branch").forEach((li) => {
        li.classList.toggle("open", open);
        li.querySelector(".mm-node").setAttribute("aria-expanded", open);
      });
    };
  });
}
