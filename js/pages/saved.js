import { getBookmarks, removeBookmark, getNotes } from "../firestore.js";
import { escapeHtml } from "../router.js";
import { t, getLang } from "../i18n.js";
import { pageHero, statTile, toast, colorFor, initialOf } from "../ui.js";

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

const lnHref = (x) => `#/course/${encodeURIComponent(x.courseId)}/week/${encodeURIComponent(x.weekId)}`;

export async function renderSaved(view, isCurrent) {
  let [bookmarks, notes] = await Promise.all([getBookmarks(), getNotes()]);
  if (!isCurrent()) return;
  let tab = "terms";

  view.innerHTML = `
    ${pageHero({ icon: "⭐", cls: "ico-amber", title: t("saved.title"), sub: t("saved.sub") })}
    <div class="adm-stats stats-2">
      ${statTile({ icon: "⭐", value: bookmarks.length, label: t("saved.terms"), attr: 'id="nTerms"', i: 0 })}
      ${statTile({ icon: "✍️", value: notes.length, label: t("saved.notes"), i: 1 })}
    </div>
    <div class="seg seg-inline" id="savedTabs">
      <button data-tab="terms" class="active">⭐ ${t("saved.terms")}</button>
      <button data-tab="notes">✍️ ${t("saved.notes")}</button>
    </div>
    <div id="savedBody"></div>
  `;
  const body = view.querySelector("#savedBody");

  function draw() {
    if (tab === "terms") {
      body.innerHTML = bookmarks.length ? `
        <div class="grid">
          ${bookmarks.map((b, i) => `
            <div class="card saved-term anim-in accent-${colorFor(b.courseName)}" style="--i:${Math.min(i, 12)}">
              <div class="st-head">
                <h3>${escapeHtml(b.term)}</h3>
                <button class="star-btn on" data-unstar="${escapeHtml(b.id)}" title="${t("saved.unstar")}" aria-label="${t("saved.unstar")}">★</button>
              </div>
              <p>${escapeHtml(b.definition)}</p>
              <a class="st-from" href="${lnHref(b)}">
                <span class="nc-avatar ${colorFor(b.courseName)}">${escapeHtml(initialOf(b.courseName))}</span>
                <span>${escapeHtml(b.weekTitle)} · ${escapeHtml(b.courseName)}</span>
                <span class="go">→</span>
              </a>
            </div>`).join("")}
        </div>` : `
        <div class="empty anim-in"><p style="font-size:34px;margin:0">⭐</p><p>${t("saved.noTerms")}</p></div>`;

      body.querySelectorAll("[data-unstar]").forEach((btn) => {
        btn.onclick = async () => {
          const card = btn.closest(".saved-term");
          card.classList.add("leaving");
          try {
            await removeBookmark(btn.dataset.unstar);
            bookmarks = bookmarks.filter((x) => x.id !== btn.dataset.unstar);
            view.querySelector("#nTerms").textContent = bookmarks.length;
            setTimeout(draw, 250);
          } catch (e) {
            card.classList.remove("leaving");
            toast(e.message, "err");
          }
        };
      });
    } else {
      body.innerHTML = notes.length ? `
        <div class="notes-list">
          ${notes.map((n, i) => `
            <a class="panel saved-note anim-in" style="--i:${Math.min(i, 12)}" href="${lnHref(n)}?tab=notes">
              <div class="sn-head">
                <span class="nc-avatar ${colorFor(n.courseName)}">${escapeHtml(initialOf(n.courseName))}</span>
                <div><strong>${escapeHtml(n.weekTitle)}</strong><small>${escapeHtml(n.courseName)} · ${escapeHtml(ago(n.updatedAt))}</small></div>
                <span class="go">✎</span>
              </div>
              <p>${escapeHtml(n.text)}</p>
            </a>`).join("")}
        </div>` : `
        <div class="empty anim-in"><p style="font-size:34px;margin:0">✍️</p><p>${t("saved.noNotes")}</p></div>`;
    }
  }

  view.querySelectorAll("#savedTabs button").forEach((b) => {
    b.onclick = () => {
      tab = b.dataset.tab;
      view.querySelectorAll("#savedTabs button").forEach((x) => x.classList.toggle("active", x === b));
      draw();
    };
  });
  draw();
}
