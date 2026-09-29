import { t } from "./i18n.js";

// PDF.js dimuat hanya saat dibutuhkan. PDF dibaca di browser, tidak diupload ke mana pun.
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
let libPromise = null;

function loadLib() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return (libPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PDFJS + "pdf.min.js";
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    s.onerror = () => { libPromise = null; reject(new Error(t("pdf.loadFail"))); };
    document.head.appendChild(s);
  }));
}

export async function openPdf(file) {
  const lib = await loadLib();
  const data = await file.arrayBuffer();
  return lib.getDocument({ data, isEvalSupported: false }).promise;
}

// "(di PDF halaman 3)" / "page 3" → 3
export const pageFromNote = (note) => {
  const m = String(note || "").match(/(?:halaman|hal\.?|page|pg\.?|p\.)\s*(\d+)/i);
  return m ? Number(m[1]) : 1;
};

// Modal: pilih halaman, drag untuk memilih area, return Blob PNG (atau null kalau batal)
export function cropDialog(pdf, startPage, label) {
  return new Promise((resolve) => {
    const total = pdf.numPages;
    let page = Math.min(Math.max(1, startPage), total);
    let sel = null; // {x,y,w,h} dalam px CSS relatif ke canvas
    let renderTask = null;

    const el = document.createElement("div");
    el.className = "modal-backdrop crop-backdrop";
    el.innerHTML = `
      <div class="crop-modal" role="dialog" aria-modal="true">
        <div class="crop-head">
          <div class="crop-title"><strong>✂️ ${t("pdf.cropTitle")}</strong><small></small></div>
          <div class="crop-nav">
            <button type="button" class="chip-btn" data-nav="-1" aria-label="prev">◀</button>
            <span class="crop-page"></span>
            <button type="button" class="chip-btn" data-nav="1" aria-label="next">▶</button>
          </div>
        </div>
        <div class="crop-stage">
          <div class="crop-canvas-wrap">
            <canvas></canvas>
            <div class="crop-overlay"><div class="crop-sel" hidden></div></div>
            <div class="crop-loading"><span class="search-spin"></span></div>
          </div>
        </div>
        <div class="crop-foot">
          <span class="hint" style="margin:0">${t("pdf.dragHint")}</span>
          <div class="crop-btns">
            <button type="button" class="btn" data-act="cancel">${t("common.cancel")}</button>
            <button type="button" class="btn btn-primary" data-act="use" disabled>${t("pdf.use")}</button>
          </div>
        </div>
      </div>`;
    el.querySelector(".crop-title small").textContent = label;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("open"));

    const stage = el.querySelector(".crop-stage");
    const canvas = el.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const overlay = el.querySelector(".crop-overlay");
    const selEl = el.querySelector(".crop-sel");
    const loading = el.querySelector(".crop-loading");
    const useBtn = el.querySelector('[data-act="use"]');
    const pageEl = el.querySelector(".crop-page");

    function drawSel() {
      selEl.hidden = !sel;
      useBtn.disabled = !sel;
      if (!sel) return;
      Object.assign(selEl.style, { left: sel.x + "px", top: sel.y + "px", width: sel.w + "px", height: sel.h + "px" });
    }

    async function render() {
      sel = null;
      drawSel();
      loading.hidden = false;
      pageEl.textContent = t("pdf.pageOf", { n: page, total });
      el.querySelector('[data-nav="-1"]').disabled = page <= 1;
      el.querySelector('[data-nav="1"]').disabled = page >= total;
      const p = await pdf.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const cssScale = Math.min((stage.clientWidth - 4) / base.width, 2.2);
      const dpr = window.devicePixelRatio || 1;
      const vp = p.getViewport({ scale: cssScale * dpr });
      renderTask?.cancel();
      canvas.width = vp.width;
      canvas.height = vp.height;
      canvas.style.width = base.width * cssScale + "px";
      canvas.style.height = base.height * cssScale + "px";
      renderTask = p.render({ canvasContext: ctx, viewport: vp });
      try { await renderTask.promise; } catch { return; }
      loading.hidden = true;
      stage.scrollTop = 0;
    }

    // drag untuk seleksi
    let start = null;
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: Math.min(Math.max(0, e.clientX - r.left), r.width), y: Math.min(Math.max(0, e.clientY - r.top), r.height) };
    };
    overlay.addEventListener("pointerdown", (e) => {
      overlay.setPointerCapture(e.pointerId);
      start = pos(e);
      sel = { x: start.x, y: start.y, w: 0, h: 0 };
      drawSel();
    });
    overlay.addEventListener("pointermove", (e) => {
      if (!start) return;
      const p = pos(e);
      sel = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
      drawSel();
    });
    const end = () => {
      if (!start) return;
      start = null;
      if (sel && (sel.w < 12 || sel.h < 12)) sel = null;
      drawSel();
    };
    overlay.addEventListener("pointerup", end);
    overlay.addEventListener("pointercancel", end);

    async function exportCrop() {
      useBtn.disabled = true;
      useBtn.textContent = t("pdf.cropping");
      const p = await pdf.getPage(page);
      const hi = p.getViewport({ scale: 3 });
      const full = document.createElement("canvas");
      full.width = hi.width;
      full.height = hi.height;
      await p.render({ canvasContext: full.getContext("2d"), viewport: hi }).promise;
      const k = hi.width / canvas.clientWidth;
      const out = document.createElement("canvas");
      out.width = Math.round(sel.w * k);
      out.height = Math.round(sel.h * k);
      out.getContext("2d").drawImage(full, sel.x * k, sel.y * k, out.width, out.height, 0, 0, out.width, out.height);
      return new Promise((r) => out.toBlob(r, "image/png"));
    }

    const close = (v) => {
      renderTask?.cancel();
      document.removeEventListener("keydown", onKey);
      el.classList.remove("open");
      setTimeout(() => el.remove(), 250);
      resolve(v);
    };
    const go = (d) => { const n = page + d; if (n >= 1 && n <= total) { page = n; render(); } };
    const onKey = (e) => {
      if (e.key === "Escape") close(null);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    document.addEventListener("keydown", onKey);
    el.querySelectorAll("[data-nav]").forEach((b) => (b.onclick = () => go(Number(b.dataset.nav))));
    el.querySelector('[data-act="cancel"]').onclick = () => close(null);
    el.addEventListener("click", (e) => { if (e.target === el) close(null); });
    useBtn.onclick = async () => close(await exportCrop());

    render();
  });
}
