import { getCourses, addWeek, addWeekImage, createCourse } from "../firestore.js";
import { escapeHtml, navigate } from "../router.js";
import { t } from "../i18n.js";
import { newCourseDialog, toast } from "../ui.js";
import { EXTRACT_PROMPT } from "../prompt-template.js";
import { openPdf, cropDialog, pageFromNote } from "../pdf-crop.js";

const MAX_JSON = 500_000; // Firestore max 1 MiB per dokumen
const MAX_IMG_BYTES = 700_000; // target ukuran data URL setelah kompres
const MAX_IMG_SIDE = 1600;

function validate(data) {
  const errs = [];
  if (typeof data !== "object" || Array.isArray(data) || !data) return [t("upload.errObject")];
  if (typeof data.title !== "string" || !data.title.trim()) errs.push(t("upload.errTitle"));
  if (typeof data.summary !== "string") errs.push(t("upload.errSummary"));
  if (typeof data.title === "string" && data.title.trim().length > 200) errs.push(t("upload.errLimits"));
  if ((data.outline?.length || 0) > 100 || (data.terms?.length || 0) > 500 || (data.quiz?.length || 0) > 300)
    errs.push(t("upload.errLimits"));
  if (data.outline && !(Array.isArray(data.outline) && data.outline.every((x) => typeof x === "string")))
    errs.push(t("upload.errOutline"));
  if (data.terms && !(Array.isArray(data.terms) && data.terms.every((x) => x?.term && x?.definition)))
    errs.push(t("upload.errTerms"));
  if (data.quiz && !(Array.isArray(data.quiz) && data.quiz.every((q) =>
    q?.question && Array.isArray(q.options) && q.options.length > 1 && q.answer !== undefined)))
    errs.push(t("upload.errQuiz"));
  return errs;
}

// Ambil satu/lebih objek JSON dari teks hasil AI: buang ```json fence & teks tambahan.
// Mendukung: 1 objek, array objek, atau beberapa objek berurutan.
export function extractJsons(text) {
  const raw = String(text).replace(/```(?:json)?/gi, "").trim();
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [v];
  } catch (firstErr) {
    const out = [];
    let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") { if (depth++ === 0) start = i; }
      else if (c === "}" && depth > 0 && --depth === 0) {
        try { out.push(JSON.parse(raw.slice(start, i + 1))); } catch {}
      }
    }
    if (!out.length) throw firstErr;
    return out;
  }
}

const safeUrl = (u) => (typeof u === "string" && /^https:\/\/\S+$/i.test(u.trim()) ? u.trim() : "");

// Hanya simpan field yang dikenal (field lain dari JSON diabaikan)
function cleanTerm(x, hasImage) {
  const out = { term: String(x.term), definition: String(x.definition) };
  if (typeof x.image_note === "string" && x.image_note.trim()) out.image_note = x.image_note.trim().slice(0, 1000);
  const url = safeUrl(x.image_url);
  if (url) out.image_url = url;
  if (hasImage) out.hasImage = true;
  return out;
}

// Resize + kompres ke WebP (fallback JPEG) sampai di bawah MAX_IMG_BYTES
async function compressImage(file) {
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, MAX_IMG_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  for (let attempt = 0; attempt < 8; attempt++) {
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.7, 0.55]) {
      let url = canvas.toDataURL("image/webp", q);
      if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", q);
      if (url.length <= MAX_IMG_BYTES) return url;
    }
    scale *= 0.75;
  }
  throw new Error(t("upload.imgTooBig"));
}

const kb = (n) => `${Math.round(n / 1024)} KB`;

export async function renderUpload(view, isCurrent) {
  const courses = await getCourses();
  if (!isCurrent()) return;

  const courseOptions = courses.length
    ? courses.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("")
    : `<option value="" disabled selected>${t("upload.noCourse")}</option>`;

  view.innerHTML = `
    <div class="adm-hero anim-in">
      <div class="adm-hero-ico up-hero-ico">⇪</div>
      <div>
        <h1>${t("upload.title")}</h1>
        <p class="sub" style="margin:0">${t("upload.sub")}</p>
      </div>
    </div>

    <form id="upForm" novalidate>
      <ol class="steps">
        <li class="step anim-in" data-step="1" style="--i:1">
          <span class="step-dot"><b>1</b><i>✓</i></span>
          <div class="step-body">
            <div class="step-title"><strong>${t("upload.step1")}</strong><small>${t("prompt.sub")}</small></div>
            <section class="prompt-card">
              <div class="prompt-head">
                <span class="prompt-ico">✨</span>
                <div><strong>${t("prompt.title")}</strong></div>
                <button type="button" class="btn btn-accent btn-sm" id="copyPrompt">${t("prompt.copy")}</button>
              </div>
              <pre class="prompt-body" id="promptBody">${escapeHtml(EXTRACT_PROMPT)}</pre>
              <button type="button" class="prompt-toggle" id="togglePrompt" aria-expanded="false">${t("prompt.expand")}</button>
            </section>
          </div>
        </li>

        <li class="step anim-in" data-step="2" style="--i:2">
          <span class="step-dot"><b>2</b><i>✓</i></span>
          <div class="step-body">
            <div class="step-title"><strong>${t("upload.step2")}</strong><small>${t("upload.step2Sub")}</small></div>
            <div class="select-row">
              <div class="select-wrap">
                <span class="select-ico">📘</span>
                <select id="courseSel" aria-label="${t("upload.course")}">${courseOptions}</select>
              </div>
              <button type="button" class="btn" id="newCourseBtn">${t("course.new")}</button>
            </div>
          </div>
        </li>

        <li class="step anim-in" data-step="3" style="--i:3">
          <span class="step-dot"><b>3</b><i>✓</i></span>
          <div class="step-body">
            <div class="step-title"><strong>${t("upload.step3")}</strong><small>⚡ ${t("upload.autoHint")}</small></div>
            <button type="button" class="paste-hero" id="pasteHero">
              <span class="ph-ico">📋</span>
              <span class="ph-text"><strong>${t("upload.pasteHero")}</strong><small>${t("upload.pasteHeroSub")}</small></span>
              <span class="ph-kbd hide-mobile">⌘/Ctrl + V</span>
            </button>
            <div class="editor" id="editor">
              <div class="editor-head">
                <span class="editor-dots"><i></i><i></i><i></i></span>
                <span class="editor-file">lecture-note.json</span>
                <div class="editor-tools">
                  <button type="button" class="chip-btn" id="pasteBtn">${t("editor.paste")}</button>
                  <button type="button" class="chip-btn" id="fmtBtn">${t("upload.format")}</button>
                  <button type="button" class="chip-btn" id="clearBtn">${t("editor.clear")}</button>
                </div>
              </div>
              <textarea id="json" spellcheck="false" aria-label="${t("upload.json")}" placeholder="${escapeHtml(t("upload.example"))}"></textarea>
              <div class="editor-foot">
                <span class="editor-status" id="edStatus">${t("editor.empty")}</span>
                <span id="edCount"></span>
              </div>
            </div>
          </div>
        </li>

        <li class="step anim-in" data-step="4" style="--i:4">
          <span class="step-dot"><b>4</b><i>✓</i></span>
          <div class="step-body">
            <div class="step-title"><strong>${t("upload.step4")}</strong><small id="submitHint">${t("upload.analyzeFirst")}</small></div>
            <div id="msg"></div>
            <div id="analysis"></div>
            <div class="row up-actions">
              <button type="button" class="btn btn-accent" id="analyzeBtn">${t("upload.analyze")}</button>
              <button type="submit" class="btn btn-primary" id="submitBtn" disabled>${t("upload.submit")}</button>
            </div>
          </div>
        </li>
      </ol>
    </form>`;

  const copyBtn = view.querySelector("#copyPrompt");
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(EXTRACT_PROMPT);
    } catch {
      const tmp = Object.assign(document.createElement("textarea"), { value: EXTRACT_PROMPT });
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand("copy");
      tmp.remove();
    }
    copyBtn.textContent = t("prompt.copied");
    copyBtn.classList.add("copied");
    toast(t("prompt.copiedToast"));
    setTimeout(() => { copyBtn.textContent = t("prompt.copy"); copyBtn.classList.remove("copied"); }, 1800);
  };
  const promptBody = view.querySelector("#promptBody");
  const toggle = view.querySelector("#togglePrompt");
  toggle.onclick = () => {
    const open = promptBody.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open);
    toggle.textContent = open ? t("prompt.collapse") : t("prompt.expand");
  };

  const sel = view.querySelector("#courseSel");
  const ta = view.querySelector("#json");
  const msg = view.querySelector("#msg");
  const box = view.querySelector("#analysis");
  const submitBtn = view.querySelector("#submitBtn");
  const analyzeBtn = view.querySelector("#analyzeBtn");
  const submitHint = view.querySelector("#submitHint");

  // hasil analisis terakhir
  let analyzed = null; // { data, needImages: [termIndex...] }
  const images = {}; // termIndex -> { dataUrl, size }

  const addCourseOption = (c) => {
    sel.querySelector('option[value=""]')?.remove();
    sel.add(new Option(c.name, c.id, true, true));
    courses.push({ id: c.id, name: c.name });
  };

  view.querySelector("#newCourseBtn").onclick = async () => {
    const c = await newCourseDialog();
    if (c) addCourseOption(c);
  };

  const showMsg = (cls, html) => (msg.innerHTML = html ? `<div class="${cls}" style="margin-top:16px">${html}</div>` : "");

  const parse = () => {
    try {
      const list = extractJsons(ta.value);
      if (!list.length) throw new Error(t("upload.emptyJson"));
      return list;
    } catch (e) { showMsg("error", `${t("upload.invalidJson")}: ${escapeHtml(e.message)}`); return null; }
  };
  const courseByName = (name) => courses.find((c) => c.name.trim().toLowerCase() === String(name || "").trim().toLowerCase());
  let pdfDoc = null;
  let userPickedCourse = false;

  const resetAnalysis = () => {
    if (!analyzed) return;
    analyzed = null;
    box.innerHTML = "";
    submitBtn.disabled = true;
    submitHint.hidden = false;
    for (const k in images) delete images[k];
    queueMicrotask(() => typeof syncSteps === "function" && syncSteps());
  };
  ta.addEventListener("input", resetAnalysis);

  // ---- status tiap step + editor ----
  const stepEl = (n) => view.querySelector(`.step[data-step="${n}"]`);
  const edStatus = view.querySelector("#edStatus");
  const edCount = view.querySelector("#edCount");
  const editor = view.querySelector("#editor");
  let promptCopied = false;

  function syncSteps() {
    const raw = ta.value.trim();
    let valid = false;
    let count = 0;
    if (raw) { try { count = extractJsons(raw).length; valid = count > 0; } catch {} }
    edStatus.className = `editor-status ${!raw ? "" : valid ? "ok" : "bad"}`;
    edStatus.textContent = !raw ? t("editor.empty") : valid ? (count > 1 ? t("editor.validMany", { n: count }) : t("editor.valid")) : t("editor.invalid");
    edCount.textContent = raw ? t("editor.chars", { n: raw.length.toLocaleString() }) + ` · ${raw.split("\n").length} ${t("editor.lines")}` : "";
    editor.classList.toggle("is-valid", valid);
    editor.classList.toggle("is-invalid", !!raw && !valid);
    stepEl(1).classList.toggle("done", promptCopied || !!raw);
    stepEl(2).classList.toggle("done", !!sel.value);
    stepEl(3).classList.toggle("done", valid);
    stepEl(4).classList.toggle("done", !!analyzed);
    const active = [1, 2, 3, 4].find((n) => !stepEl(n).classList.contains("done")) || 4;
    [1, 2, 3, 4].forEach((n) => stepEl(n).classList.toggle("active", n === active));
  }
  let syncTimer;
  ta.addEventListener("input", () => { clearTimeout(syncTimer); syncTimer = setTimeout(syncSteps, 250); });
  sel.addEventListener("change", () => { if (analyzed) userPickedCourse = true; syncSteps(); });

  // ⚡ analisis otomatis setiap kali JSON di-paste
  const autoAnalyze = () => setTimeout(() => {
    try { if (extractJsons(ta.value).length) analyzeBtn.click(); } catch {}
  }, 0);
  ta.addEventListener("paste", autoAnalyze);
  copyBtn.addEventListener("click", () => { promptCopied = true; syncSteps(); });

  view.querySelector("#pasteBtn").onclick = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (!txt.trim()) return toast(t("editor.clipEmpty"), "info");
      ta.value = txt;
      ta.dispatchEvent(new Event("input"));
      syncSteps();
      editor.animate([{ transform: "scale(.99)" }, { transform: "none" }], { duration: 250 });
      autoAnalyze();
    } catch {
      toast(t("editor.pasteFail"), "err");
      ta.focus();
    }
  };
  view.querySelector("#pasteHero").onclick = () => view.querySelector("#pasteBtn").click();

  view.querySelector("#clearBtn").onclick = () => {
    ta.value = "";
    ta.dispatchEvent(new Event("input"));
    showMsg();
    syncSteps();
    ta.focus();
  };

  view.querySelector("#fmtBtn").onclick = () => {
    const d = parse();
    if (d) { ta.value = JSON.stringify(d.length === 1 ? d[0] : d, null, 2); showMsg(); syncSteps(); }
  };

  analyzeBtn.onclick = async () => {
    showMsg();
    resetAnalysis();
    if (!ta.value.trim()) return showMsg("error", t("upload.emptyJson"));
    if (ta.value.length > MAX_JSON) return showMsg("error", t("upload.tooBig"));

    analyzeBtn.disabled = true;
    analyzeBtn.classList.add("loading");
    box.innerHTML = `<div class="an-loading"><span class="search-spin"></span>${t("upload.analyzing")}</div>`;
    await new Promise((r) => setTimeout(r, 450)); // biar animasinya terlihat

    const list = parse();
    analyzeBtn.disabled = false;
    analyzeBtn.classList.remove("loading");
    if (!list) { box.innerHTML = ""; return; }
    const errs = list.flatMap((d, k) => validate(d).map((e) => (list.length > 1 ? `LN #${k + 1}: ${e}` : e)));
    if (errs.length) { box.innerHTML = ""; return showMsg("error", errs.map(escapeHtml).join("<br>")); }
    userPickedCourse = false;

    if (list.length > 1) {
      analyzed = { batch: list, needImages: [] };
      queueMicrotask(syncSteps);
      renderBatch(list);
      submitBtn.disabled = false;
      submitBtn.textContent = t("upload.submitMany", { n: list.length });
      submitHint.hidden = true;
      return;
    }
    const data = list[0];
    submitBtn.textContent = t("upload.submit");

    const terms = data.terms || [];
    const needImages = terms
      .map((x, i) => (typeof x.image_note === "string" && x.image_note.trim() && !safeUrl(x.image_url) ? i : -1))
      .filter((i) => i >= 0);

    // course dari JSON ("course": "...") → pilih otomatis kalau sudah ada
    const jsonCourse = typeof data.course === "string" ? data.course.trim() : "";
    const match = jsonCourse && courseByName(jsonCourse);
    if (match) sel.value = match.id;

    analyzed = { data, needImages };
    queueMicrotask(syncSteps);
    renderAnalysis(jsonCourse, match);
    submitBtn.disabled = false;
    submitHint.hidden = true;
  };

  function renderAnalysis(jsonCourse, match) {
    const { data, needImages } = analyzed;
    const terms = data.terms || [];
    const urlImages = terms.filter((x) => safeUrl(x.image_url)).length;

    box.innerHTML = `
      <div class="analysis anim-in">
        <div class="an-head">
          <span class="an-ok">✓</span>
          <div>
            <strong>${escapeHtml(data.title)}</strong>
            <small>${t("upload.anValid")}</small>
          </div>
        </div>

        <div class="an-stats">
          <div><b>${(data.outline || []).length}</b><span>${t("week.outline")}</span></div>
          <div><b>${terms.length}</b><span>${t("week.tabTerms")}</span></div>
          <div><b>${(data.quiz || []).length}</b><span>${t("week.tabQuiz")}</span></div>
          <div><b>${needImages.length + urlImages}</b><span>${t("upload.anImages")}</span></div>
        </div>

        ${jsonCourse ? `
          <div class="an-course ${match ? "ok" : "warn"}">
            ${match
              ? t("upload.anCourseMatch", { name: escapeHtml(jsonCourse) })
              : `${t("upload.anCourseNew", { name: escapeHtml(jsonCourse) })} <b>${t("upload.anAutoCreate")}</b>
                 <button type="button" class="btn btn-sm" id="createJsonCourse">${t("upload.anCreateCourse", { name: escapeHtml(jsonCourse) })}</button>`}
          </div>` : ""}

        ${needImages.length ? `
          <h3 class="an-title">🖼️ ${t("upload.anImgTitle")} <span class="count" id="imgCount">0/${needImages.length}</span></h3>
          <p class="hint" style="margin-top:0">${t("upload.anImgHint")}</p>
          <div class="pdf-src ${pdfDoc ? "loaded" : ""}">
            <span class="pdf-ico">📄</span>
            <div class="pdf-src-text"><strong id="pdfName">${pdfDoc ? escapeHtml(pdfDoc._lnName || "PDF") : t("pdf.pick")}</strong><small>${t("pdf.pickHint")}</small></div>
            <label class="btn btn-sm btn-accent">
              <input type="file" accept="application/pdf" id="pdfInput" hidden />${pdfDoc ? t("pdf.change") : t("pdf.choose")}
            </label>
          </div>
          <div class="img-grid">
            ${needImages.map((i, n) => `
              <div class="img-slot anim-in" style="--i:${n}" data-i="${i}">
                <div class="img-meta">
                  <strong>${escapeHtml(terms[i].term)}</strong>
                  <p>${escapeHtml(terms[i].image_note)}</p>
                </div>
                <button type="button" class="btn btn-sm pdf-crop-btn" data-act="pdf">✂️ ${t("pdf.cropFrom", { n: pageFromNote(terms[i].image_note) })}</button>
                <label class="drop">
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden />
                  <span class="drop-empty">
                    <svg viewBox="0 0 24 24"><path d="M4 16l4.6-4.6a2 2 0 0 1 2.8 0L16 16m-2-2 1.6-1.6a2 2 0 0 1 2.8 0L20 14M14 8h.01M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"/></svg>
                    <b>${t("upload.dropTitle")}</b>
                    <small>${t("upload.dropSub")}</small>
                  </span>
                  <img class="drop-preview" alt="" hidden />
                  <span class="drop-busy" hidden><span class="search-spin"></span></span>
                </label>
                <div class="img-actions" hidden>
                  <small class="img-size"></small>
                  <button type="button" class="btn btn-sm" data-act="change">${t("upload.imgChange")}</button>
                  <button type="button" class="btn btn-sm btn-danger" data-act="remove">${t("upload.imgRemove")}</button>
                </div>
              </div>`).join("")}
          </div>` : ""}
      </div>`;

    box.querySelector("#createJsonCourse")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        const id = await createCourse(jsonCourse);
        addCourseOption({ id, name: jsonCourse });
        toast(t("course.created", { name: jsonCourse }));
        const el = box.querySelector(".an-course");
        el.className = "an-course ok";
        el.innerHTML = t("upload.anCourseMatch", { name: escapeHtml(jsonCourse) });
      } catch (err) {
        toast(`${t("course.createFail")}: ${err.message}`, "err");
        e.target.disabled = false;
      }
    });

    box.querySelectorAll(".img-slot").forEach(setupSlot);
    box.querySelector(".analysis")?.classList.toggle("has-pdf", !!pdfDoc);

    box.querySelector("#pdfInput")?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const row = box.querySelector(".pdf-src");
      row.classList.add("busy");
      box.querySelector("#pdfName").textContent = t("pdf.loading");
      try {
        pdfDoc = await openPdf(file);
        pdfDoc._lnName = file.name;
        row.classList.add("loaded");
        box.querySelector("#pdfName").textContent = `${file.name} · ${t("pdf.pages", { n: pdfDoc.numPages })}`;
        box.querySelector(".analysis").classList.add("has-pdf");
        toast(t("pdf.ready"));
      } catch (err) {
        box.querySelector("#pdfName").textContent = t("pdf.pick");
        toast(err.message, "err");
      }
      row.classList.remove("busy");
    });
  }

  // ---------- mode banyak LN ----------
  function renderBatch(list) {
    const withImg = list.some((d) => (d.terms || []).some((x) => typeof x.image_note === "string" && x.image_note.trim()));
    box.innerHTML = `
      <div class="analysis anim-in">
        <div class="an-head">
          <span class="an-ok">✓</span>
          <div><strong>${t("upload.batchTitle", { n: list.length })}</strong><small>${t("upload.batchSub")}</small></div>
        </div>
        <div class="batch-list">
          ${list.map((d, k) => {
            const cname = typeof d.course === "string" ? d.course.trim() : "";
            const m = cname && courseByName(cname);
            const tag = !cname ? `<span class="batch-tag sel">${t("upload.batchUseSel")}</span>`
              : m ? `<span class="batch-tag ok">✓ ${t("upload.batchExists")}</span>`
              : `<span class="batch-tag new">＋ ${t("upload.batchNew")}</span>`;
            return `
              <div class="batch-row anim-in" style="--i:${k}" data-k="${k}">
                <span class="ex-num">${k + 1}</span>
                <div class="batch-main">
                  <strong>${escapeHtml(d.title)}</strong>
                  <small>📘 ${escapeHtml(cname || sel.selectedOptions[0]?.text || "—")} · ${(d.terms || []).length} ${t("week.tabTerms").toLowerCase()} · ${(d.quiz || []).length} quiz</small>
                </div>
                ${tag}
                <span class="batch-state"></span>
              </div>`;
          }).join("")}
        </div>
        ${withImg ? `<p class="hint">🖼️ ${t("upload.batchNoImg")}</p>` : ""}
      </div>`;
  }

  async function submitBatch(list) {
    submitBtn.disabled = true;
    analyzeBtn.disabled = true;
    let done = 0;
    try {
      for (let k = 0; k < list.length; k++) {
        const d = list[k];
        const row = box.querySelector(`.batch-row[data-k="${k}"]`);
        const state = row.querySelector(".batch-state");
        state.innerHTML = `<span class="search-spin"></span>`;
        submitBtn.textContent = t("upload.sendingMany", { i: k + 1, n: list.length });
        const cname = typeof d.course === "string" ? d.course.trim() : "";
        let courseId = cname ? courseByName(cname)?.id : sel.value;
        if (cname && !courseId) {
          courseId = await createCourse(cname);
          addCourseOption({ id: courseId, name: cname });
        }
        if (!courseId) throw new Error(t("upload.needCourse"));
        await addWeek(courseId, {
          title: d.title.trim(),
          outline: d.outline || [],
          summary: d.summary,
          terms: (d.terms || []).map((x) => cleanTerm(x, false)),
          quiz: d.quiz || [],
        });
        state.textContent = "✓";
        row.classList.add("ok");
        done++;
      }
      showMsg("success", t("upload.batchDone", { n: done }));
      setTimeout(() => navigate("/courses"), 900);
    } catch (err) {
      showMsg("error", `${t("upload.fail")} (${done}/${list.length}): ${escapeHtml(err.message)}`);
      submitBtn.disabled = false;
      analyzeBtn.disabled = false;
      submitBtn.textContent = t("upload.submitMany", { n: list.length });
    }
  }

  const updateImgCount = () => {
    const el = box.querySelector("#imgCount");
    if (el) el.textContent = `${Object.keys(images).length}/${analyzed.needImages.length}`;
  };

  function setupSlot(slot) {
    const idx = Number(slot.dataset.i);
    const drop = slot.querySelector(".drop");
    const input = slot.querySelector("input");
    const preview = slot.querySelector(".drop-preview");
    const empty = slot.querySelector(".drop-empty");
    const busy = slot.querySelector(".drop-busy");
    const actions = slot.querySelector(".img-actions");

    const show = () => {
      const img = images[idx];
      preview.hidden = !img;
      empty.hidden = !!img;
      actions.hidden = !img;
      slot.classList.toggle("filled", !!img);
      if (img) {
        preview.src = img.dataUrl;
        slot.querySelector(".img-size").textContent = kb(img.size);
      }
      updateImgCount();
    };

    const handle = async (file) => {
      if (!file || !file.type.startsWith("image/")) return toast(t("upload.imgNotImage"), "err");
      busy.hidden = false;
      try {
        const dataUrl = await compressImage(file);
        images[idx] = { dataUrl, size: Math.round((dataUrl.length * 3) / 4) };
        show();
        preview.animate([{ opacity: 0, transform: "scale(.94)" }, { opacity: 1, transform: "none" }], { duration: 300 });
      } catch (err) {
        toast(err.message, "err");
      }
      busy.hidden = true;
    };

    input.onchange = () => { handle(input.files[0]); input.value = ""; };
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => handle(e.dataTransfer.files[0]));
    slot.querySelector('[data-act="pdf"]').onclick = async () => {
      if (!pdfDoc) return toast(t("pdf.needPdf"), "info");
      const term = analyzed.data.terms[idx];
      const blob = await cropDialog(pdfDoc, pageFromNote(term.image_note), term.term);
      if (blob) handle(new File([blob], "crop.png", { type: "image/png" }));
    };
    slot.querySelector('[data-act="change"]').onclick = () => input.click();
    slot.querySelector('[data-act="remove"]').onclick = () => { delete images[idx]; show(); };
  }

  // paste gambar (Ctrl/Cmd+V) → masuk ke slot kosong pertama
  view.addEventListener("paste", (e) => {
    if (e.target === ta || e.target.closest("input, textarea")) return;
    const text = e.clipboardData?.getData("text") || "";
    if (text.includes("{") && !e.clipboardData?.files?.length) {
      try {
        if (extractJsons(text).length) {
          e.preventDefault();
          ta.value = text;
          ta.dispatchEvent(new Event("input"));
          syncSteps();
          ta.scrollIntoView({ behavior: "smooth", block: "center" });
          return autoAnalyze();
        }
      } catch {}
    }
    if (!analyzed?.needImages.length) return;
    const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
    if (!file) return;
    const slot = [...box.querySelectorAll(".img-slot")].find((s) => !images[s.dataset.i]);
    if (!slot) return;
    e.preventDefault();
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = slot.querySelector("input");
    input.files = dt.files;
    input.dispatchEvent(new Event("change"));
  });

  view.querySelector("#upForm").onsubmit = async (e) => {
    e.preventDefault();
    if (!analyzed) return showMsg("error", t("upload.analyzeFirst"));
    if (analyzed.batch) return submitBatch(analyzed.batch);
    const { data } = analyzed;
    let courseId = sel.value;
    const jsonCourse = typeof data.course === "string" ? data.course.trim() : "";
    if (jsonCourse && !courseByName(jsonCourse) && (!userPickedCourse || !courseId)) {
      try {
        courseId = await createCourse(jsonCourse);
        addCourseOption({ id: courseId, name: jsonCourse });
        toast(t("course.created", { name: jsonCourse }));
      } catch (err) {
        return showMsg("error", `${t("course.createFail")}: ${escapeHtml(err.message)}`);
      }
    }
    if (!courseId) return showMsg("error", t("upload.needCourse"));

    submitBtn.disabled = true;
    analyzeBtn.disabled = true;
    submitBtn.textContent = t("upload.sending");
    try {
      const weekId = await addWeek(courseId, {
        title: data.title.trim(),
        outline: data.outline || [],
        summary: data.summary,
        terms: (data.terms || []).map((x, i) => cleanTerm(x, !!images[i])),
        quiz: data.quiz || [],
      });
      const entries = Object.entries(images);
      for (let n = 0; n < entries.length; n++) {
        const [i, img] = entries[n];
        submitBtn.textContent = t("upload.sendingImg", { i: n + 1, n: entries.length });
        await addWeekImage(courseId, weekId, i, img.dataUrl, data.terms[i].term);
      }
      showMsg("success", t("upload.success"));
      setTimeout(() => navigate(`/course/${courseId}/week/${weekId}`), 700);
    } catch (err) {
      showMsg("error", `${t("upload.fail")}: ${escapeHtml(err.message)}`);
      submitBtn.disabled = false;
      analyzeBtn.disabled = false;
      submitBtn.textContent = t("upload.submit");
    }
  };

  syncSteps();
}
