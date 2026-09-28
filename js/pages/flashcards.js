import { getCourses, getAllWeeks, getSrs, reviewCard, cardId, todayKey, logActivity } from "../firestore.js";
import { escapeHtml } from "../router.js";
import { t } from "../i18n.js";
import { pageHero, statTile, confetti, toast, colorFor, initialOf } from "../ui.js";
import { statusOf } from "./courses.js";

const NEW_PER_SESSION = 20;

const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// semua kartu + status SRS-nya
export async function loadDeck() {
  const [courses, weeks, srs] = await Promise.all([getCourses(), getAllWeeks(), getSrs()]);
  const byId = Object.fromEntries(courses.map((c) => [c.id, c]));
  const today = todayKey();
  const cards = weeks
    .filter((w) => byId[w.courseId])
    .flatMap((w) => (w.terms || []).map((term, i) => {
      const id = cardId(w.courseId, w.id, i);
      const s = srs[id];
      return {
        id, term: term.term, definition: term.definition,
        course: byId[w.courseId], weekTitle: w.title,
        box: s?.box || 0, due: s?.due || null,
        state: !s ? "new" : s.due <= today ? "due" : "later",
      };
    }));
  return { courses, cards };
}

export async function renderFlashcards(view, isCurrent) {
  const { courses, cards } = await loadDeck();
  if (!isCurrent()) return;

  const withCards = courses.filter((c) => cards.some((x) => x.course.id === c.id));
  let scope = "active"; // "active" | "all" | courseId

  const inScope = () => cards.filter((c) =>
    scope === "all" ? true : scope === "active" ? statusOf(c.course) === "in_progress" : c.course.id === scope);

  // --------------------------------------------------------------- setup
  function renderSetup() {
    const pool = inScope();
    const due = pool.filter((c) => c.state === "due").length;
    const fresh = pool.filter((c) => c.state === "new").length;
    const mastered = pool.filter((c) => c.box >= 4).length;
    const sessionSize = due + Math.min(fresh, NEW_PER_SESSION);

    view.innerHTML = `
      ${pageHero({ icon: "🃏", cls: "ico-pink", title: t("fc.title"), sub: t("fc.sub") })}
      <div class="adm-stats stats-4">
        ${statTile({ icon: "⏰", value: due, label: t("fc.due"), i: 0 })}
        ${statTile({ icon: "✨", value: fresh, label: t("fc.new"), i: 1 })}
        ${statTile({ icon: "🧠", value: mastered, label: t("fc.mastered"), i: 2 })}
        ${statTile({ icon: "🃏", value: pool.length, label: t("fc.total"), i: 3 })}
      </div>

      ${cards.length ? `
        <section class="panel fc-setup anim-in" style="--i:4">
          <div class="ex-block-head"><span class="ex-num">1</span><div><strong>${t("fc.scope")}</strong><small>${t("fc.scopeHint")}</small></div></div>
          <div class="chip-row">
            <button class="chip ${scope === "active" ? "on" : ""}" data-s="active">🟡 ${t("fc.scopeActive")}</button>
            <button class="chip ${scope === "all" ? "on" : ""}" data-s="all">📚 ${t("fc.scopeAll")}</button>
            ${withCards.map((c) => `<button class="chip ${scope === c.id ? "on" : ""}" data-s="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button>`).join("")}
          </div>

          <div class="fc-boxes">
            ${[1, 2, 3, 4, 5].map((b) => {
              const n = pool.filter((c) => c.box === b).length;
              return `<div class="fc-box b${b}" title="Box ${b}"><b>${n}</b><small>Box ${b}</small><i style="--h:${pool.length ? (n / pool.length) * 100 : 0}%"></i></div>`;
            }).join("")}
          </div>
          <p class="hint">${t("fc.boxHint")}</p>

          <div class="fc-actions">
            <button class="btn btn-primary ex-start" id="startDue" ${sessionSize ? "" : "disabled"}>
              ${sessionSize ? t("fc.startDue", { n: sessionSize }) : t("fc.allDone")}
            </button>
            <button class="btn" id="startAll" ${pool.length ? "" : "disabled"}>🔀 ${t("fc.practiceAll", { n: pool.length })}</button>
          </div>
        </section>
        <p class="hint fc-keys hide-mobile">⌨️ ${t("fc.keys")}</p>` : `<div class="empty anim-in">${t("fc.empty")}</div>`}
    `;

    view.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => { scope = b.dataset.s; renderSetup(); }));
    view.querySelector("#startDue")?.addEventListener("click", () => {
      const p = inScope();
      startSession([
        ...shuffle(p.filter((c) => c.state === "due")),
        ...shuffle(p.filter((c) => c.state === "new")).slice(0, NEW_PER_SESSION),
      ], true);
    });
    view.querySelector("#startAll")?.addEventListener("click", () => startSession(shuffle(inScope()), false));
  }

  // --------------------------------------------------------------- session
  function startSession(deck, track) {
    let i = 0, known = 0, again = 0, flipped = false, busy = false;
    const retry = [];

    view.innerHTML = `
      <div class="fc-run">
        <div class="ex-top">
          <button class="btn btn-sm" id="fcQuit">✕ ${t("exam.quit")}</button>
          <span class="ex-counter" id="fcCounter"></span>
          <span class="fc-score"><span class="ok">✓ <b id="fcKnown">0</b></span><span class="bad">↺ <b id="fcAgain">0</b></span></span>
        </div>
        <div class="ex-progress"><i id="fcBar"></i></div>
        <div class="fc-stage">
          <div class="fc-hint-left">↺ ${t("fc.again")}</div>
          <div class="fc-hint-right">${t("fc.known")} ✓</div>
          <div class="fc-card" id="fcCard" tabindex="0" role="button" aria-label="${t("fc.flip")}">
            <div class="fc-inner">
              <div class="fc-face fc-front"></div>
              <div class="fc-face fc-back"></div>
            </div>
          </div>
        </div>
        <p class="fc-tap">${t("fc.tapHint")}</p>
        <div class="fc-btns">
          <button class="btn fc-again" id="btnAgain">↺ ${t("fc.again")}</button>
          <button class="btn" id="btnFlip">🔄 ${t("fc.flip")}</button>
          <button class="btn fc-known" id="btnKnown">✓ ${t("fc.known")}</button>
        </div>
      </div>`;

    const cardEl = view.querySelector("#fcCard");
    const front = cardEl.querySelector(".fc-front");
    const back = cardEl.querySelector(".fc-back");

    function show() {
      const c = deck[i];
      flipped = false;
      cardEl.classList.remove("flipped");
      cardEl.style.transform = "";
      cardEl.className = `fc-card ${colorFor(c.course.name)}`;
      front.innerHTML = `
        <span class="fc-meta"><span class="nc-avatar ${colorFor(c.course.name)}">${escapeHtml(initialOf(c.course.name))}</span>${escapeHtml(c.weekTitle)}</span>
        <h2>${escapeHtml(c.term)}</h2>
        <span class="fc-state ${c.state}">${c.state === "new" ? "✨ " + t("fc.new") : "Box " + (c.box || 1)}</span>`;
      back.innerHTML = `
        <span class="fc-meta">${escapeHtml(c.term)}</span>
        <p>${escapeHtml(c.definition)}</p>`;
      view.querySelector("#fcCounter").textContent = `${i + 1} / ${deck.length}`;
      view.querySelector("#fcBar").style.width = `${(i / deck.length) * 100}%`;
      cardEl.animate([{ opacity: 0, transform: "translateY(24px) scale(.96)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
    }

    const flip = () => { flipped = !flipped; cardEl.classList.toggle("flipped", flipped); };

    async function answer(ok) {
      if (busy) return;
      busy = true;
      const c = deck[i];
      const dir = ok ? 1 : -1;
      const anim = cardEl.animate(
        [{ transform: cardEl.style.transform || "none" }, { transform: `translateX(${dir * 140}%) rotate(${dir * 18}deg)`, opacity: 0 }],
        { duration: 320, easing: "cubic-bezier(.4,0,.8,.4)", fill: "forwards" }
      );
      ok ? known++ : again++;
      view.querySelector("#fcKnown").textContent = known;
      view.querySelector("#fcAgain").textContent = again;
      if (!ok) retry.push(c);
      if (track) {
        reviewCard(c.id, c.box, ok).then((r) => { c.box = r.box; c.state = "later"; }).catch((e) => toast(e.message, "err"));
      }
      await anim.finished;
      anim.cancel();
      busy = false;
      i++;
      if (i < deck.length) show();
      else finish();
    }

    // ---- swipe / drag
    let sx = 0, dx = 0, dragging = false;
    cardEl.addEventListener("pointerdown", (e) => { sx = e.clientX; dx = 0; dragging = true; cardEl.setPointerCapture(e.pointerId); });
    cardEl.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dx = e.clientX - sx;
      if (Math.abs(dx) < 4) return;
      cardEl.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      view.querySelector(".fc-stage").dataset.lean = dx > 40 ? "right" : dx < -40 ? "left" : "";
    });
    const release = () => {
      if (!dragging) return;
      dragging = false;
      view.querySelector(".fc-stage").dataset.lean = "";
      if (Math.abs(dx) > 110) return answer(dx > 0);
      if (Math.abs(dx) < 6) flip();
      cardEl.style.transition = "transform .25s";
      cardEl.style.transform = "";
      setTimeout(() => (cardEl.style.transition = ""), 260);
    };
    cardEl.addEventListener("pointerup", release);
    cardEl.addEventListener("pointercancel", release);

    view.querySelector("#btnFlip").onclick = flip;
    view.querySelector("#btnKnown").onclick = () => answer(true);
    view.querySelector("#btnAgain").onclick = () => answer(false);
    view.querySelector("#fcQuit").onclick = () => { document.removeEventListener("keydown", onKey); renderSetup(); };

    const onKey = (e) => {
      if (!view.querySelector("#fcCard")) return document.removeEventListener("keydown", onKey);
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
      else if (e.key === "ArrowRight") answer(true);
      else if (e.key === "ArrowLeft") answer(false);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", () => document.removeEventListener("keydown", onKey), { once: true });

    function finish() {
      document.removeEventListener("keydown", onKey);
      if (track) logActivity();
      const pct = deck.length ? Math.round((known / deck.length) * 100) : 0;
      if (pct >= 80) confetti();
      view.innerHTML = `
        <div class="ex-result anim-in">
          <div class="score-ring ${pct >= 80 ? "good" : pct >= 60 ? "mid" : "low"}" style="--p:${pct}">
            <div><b>${known}</b><small>/ ${deck.length}</small></div>
          </div>
          <h1>${pct >= 80 ? t("fc.doneGreat") : t("fc.doneOk")}</h1>
          <p class="sub">✓ ${t("fc.knownN", { n: known })} · ↺ ${t("fc.againN", { n: again })}</p>
          <div class="row" style="justify-content:center">
            ${retry.length ? `<button class="btn btn-accent" id="fcRetry">↺ ${t("fc.retry", { n: retry.length })}</button>` : ""}
            <button class="btn btn-primary" id="fcBack">${t("fc.back")}</button>
          </div>
        </div>`;
      view.querySelector("#fcBack").onclick = async () => {
        const fresh = await loadDeck();
        cards.splice(0, cards.length, ...fresh.cards);
        renderSetup();
      };
      view.querySelector("#fcRetry")?.addEventListener("click", () => startSession(shuffle(retry), false));
    }

    show();
  }

  renderSetup();
}
