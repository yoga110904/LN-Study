import { listAllowed, addAllowed, removeAllowed } from "../firestore.js";
import { ADMIN_EMAILS, DEMO_MODE } from "../firebase-config.js";
import { getUser } from "../auth.js";
import { escapeHtml } from "../router.js";
import { t, getLang } from "../i18n.js";
import { confirmDialog, toast } from "../ui.js";
import { PASTELS } from "./courses.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const colorOf = (s) => PASTELS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PASTELS.length];
const initials = (email) => email.split("@")[0].split(/[._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

function ago(ts) {
  const d = ts?.toDate?.();
  if (!d) return "";
  const rtf = new Intl.RelativeTimeFormat(getLang() === "en" ? "en" : "id", { numeric: "auto" });
  const s = (d.getTime() - Date.now()) / 1000;
  for (const [unit, sec] of [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]]) {
    if (Math.abs(s) >= sec) return rtf.format(Math.round(s / sec), unit);
  }
  return rtf.format(0, "minute");
}

export async function renderAdmin(view, isCurrent) {
  let data = await listAllowed();
  if (!isCurrent()) return;

  const me = getUser().email.toLowerCase();
  const admins = DEMO_MODE ? [me] : ADMIN_EMAILS.map((a) => a.toLowerCase());
  let filter = "all";

  view.innerHTML = `
    <div class="adm-hero anim-in">
      <div class="adm-hero-ico">👥</div>
      <div>
        <h1>${t("admin.title")}</h1>
        <p class="sub" style="margin:0">${t("admin.sub")}</p>
      </div>
    </div>

    <div class="adm-stats">
      <div class="adm-stat anim-in" style="--i:1"><span class="adm-stat-ico">🛡️</span><b>${admins.length}</b><small>${t("admin.admins")}</small></div>
      <div class="adm-stat anim-in" style="--i:2"><span class="adm-stat-ico">✉️</span><b id="stEmails">0</b><small>${t("admin.emails")}</small></div>
      <div class="adm-stat anim-in" style="--i:3"><span class="adm-stat-ico">🌐</span><b id="stDomains">0</b><small>${t("admin.domains")}</small></div>
    </div>

    <form class="panel adm-add anim-in" style="--i:4" id="addForm" novalidate>
      <label for="addInput">${t("admin.addLabel")}</label>
      <div class="adm-input">
        <span class="adm-type" id="addType" hidden></span>
        <input id="addInput" autocomplete="off" spellcheck="false" placeholder="${t("admin.addPh")}" />
        <button class="btn btn-primary" type="submit" id="addBtn" disabled>${t("admin.add")}</button>
      </div>
      <p class="hint" id="addHint">${t("admin.addHint")}</p>
    </form>

    <div class="adm-layout">
      <section class="panel adm-list anim-in" style="--i:5">
        <div class="adm-list-head">
          <h3>${t("admin.accessList")}</h3>
          <div class="seg seg-sm" id="admFilter">
            <button data-f="all" class="active">${t("notes.all")}</button>
            <button data-f="email">✉️ ${t("admin.emails")}</button>
            <button data-f="domain">🌐 ${t("admin.domains")}</button>
          </div>
        </div>
        <ul class="people-list" id="peopleList"></ul>
      </section>

      <aside class="panel adm-admins anim-in" style="--i:6">
        <h3>🛡️ ${t("admin.admins")}</h3>
        <ul class="people-list">
          ${admins.map((a) => `
            <li class="person">
              <span class="p-avatar p-admin">${escapeHtml(initials(a))}</span>
              <div class="p-main">
                <span class="p-id">${escapeHtml(a)}</span>
                <small>${a === me ? `<span class="p-you">${t("admin.you")}</span>` : ""}</small>
              </div>
              <span class="badge-admin">${t("admin.adminBadge")}</span>
            </li>`).join("")}
        </ul>
        <p class="hint">🔒 ${t("admin.adminsHint")}</p>
      </aside>
    </div>
  `;

  const input = view.querySelector("#addInput");
  const addBtn = view.querySelector("#addBtn");
  const hint = view.querySelector("#addHint");
  const typeChip = view.querySelector("#addType");
  const list = view.querySelector("#peopleList");

  // "aaa.com" / "@aaa.com" => domain, "x@aaa.com" => email
  const parse = (raw) => {
    const v = raw.trim().toLowerCase();
    if (EMAIL_RE.test(v)) return { type: "email", id: v };
    const d = v.replace(/^@/, "");
    if (DOMAIN_RE.test(d)) return { type: "domain", id: d };
    return null;
  };

  input.addEventListener("input", () => {
    const v = input.value.trim();
    const p = parse(v);
    addBtn.disabled = !p;
    hint.classList.toggle("error-text", !!v && !p);
    typeChip.hidden = !p;
    if (p) {
      typeChip.className = `adm-type ${p.type}`;
      typeChip.textContent = p.type === "domain" ? "🌐 Domain" : "✉️ Email";
    }
    hint.textContent = !v ? t("admin.addHint")
      : !p ? t("admin.invalid")
      : p.type === "domain" ? t("admin.willDomain", { id: p.id })
      : t("admin.willEmail", { id: p.id });
  });

  view.querySelector("#addForm").onsubmit = async (e) => {
    e.preventDefault();
    const p = parse(input.value);
    if (!p) return;
    const pool = p.type === "email" ? data.emails : data.domains;
    if (pool.some((x) => x.id === p.id)) return toast(t("admin.exists"), "info");
    addBtn.disabled = true;
    try {
      await addAllowed(p.type, p.id);
      toast(t("admin.added", { id: p.id }));
      input.value = "";
      input.dispatchEvent(new Event("input"));
      data = await listAllowed();
      draw(p.id);
    } catch (err) {
      toast(`${t("admin.fail")}: ${err.message}`, "err");
      addBtn.disabled = false;
    }
  };

  view.querySelectorAll("#admFilter button").forEach((b) => {
    b.onclick = () => {
      filter = b.dataset.f;
      view.querySelectorAll("#admFilter button").forEach((x) => x.classList.toggle("active", x === b));
      draw();
    };
  });

  const itemHtml = (x, fresh, i) => {
    const isDomain = x.type === "domain";
    const label = isDomain ? "@" + x.id : x.id;
    const meta = [x.addedBy && t("admin.by", { who: escapeHtml(x.addedBy) }), escapeHtml(ago(x.addedAt))].filter(Boolean).join(" · ");
    return `
      <li class="person anim-in ${x.id === fresh ? "fresh" : ""}" style="--i:${Math.min(i, 10)}">
        <span class="p-avatar ${isDomain ? "p-domain" : colorOf(x.id)}">${isDomain ? "🌐" : escapeHtml(initials(x.id))}</span>
        <div class="p-main">
          <span class="p-id">${escapeHtml(label)}</span>
          <small>${isDomain ? `<span class="p-chip">${t("admin.allAccounts")}</span>` : ""}${meta}</small>
        </div>
        <button class="icon-btn" data-del="${x.type}" data-id="${escapeHtml(x.id)}" title="${t("admin.remove")}" aria-label="${t("admin.remove")}">
          <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/></svg>
        </button>
      </li>`;
  };

  function draw(fresh) {
    view.querySelector("#stEmails").textContent = data.emails.length;
    view.querySelector("#stDomains").textContent = data.domains.length;
    const all = [
      ...data.domains.map((x) => ({ ...x, type: "domain" })),
      ...data.emails.map((x) => ({ ...x, type: "email" })),
    ].filter((x) => filter === "all" || x.type === filter);

    list.innerHTML = all.length
      ? all.map((x, i) => itemHtml(x, fresh, i)).join("")
      : `<li class="adm-empty"><span>🫥</span><p>${data.emails.length + data.domains.length ? t("admin.none") : t("admin.emptyAll")}</p></li>`;

    list.querySelectorAll("[data-del]").forEach((b) => {
      b.onclick = async () => {
        const { del: type, id } = b.dataset;
        const label = type === "domain" ? "@" + id : id;
        const ok = await confirmDialog({
          icon: "🚫",
          title: t("admin.removeTitle"),
          message: t(type === "domain" ? "admin.removeDomainMsg" : "admin.removeEmailMsg", { id: escapeHtml(label) }),
          confirmText: t("admin.remove"),
          danger: true,
        });
        if (!ok) return;
        const li = b.closest("li");
        li.classList.add("leaving");
        try {
          await removeAllowed(type, id);
          toast(t("admin.removed", { id: label }));
          data = await listAllowed();
          setTimeout(() => draw(), 250);
        } catch (err) {
          li.classList.remove("leaving");
          toast(`${t("admin.fail")}: ${err.message}`, "err");
        }
      };
    });
  }
  draw();
}
