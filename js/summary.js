import { escapeHtml } from "./router.js";

// Mengubah summary teks polos jadi HTML yang enak dibaca:
//  "1. JUDUL: isi"        -> kartu section dengan nomor + judul
//  "(a) Nama - penjelasan" -> daftar poin, nama ditebalkan
//  kalimat panjang        -> dipecah jadi paragraf 2 kalimat
//  istilah dari tab Istilah -> disorot, bisa di-tap untuk lihat definisi

const SECTION_RE = /^\s*(\d{1,2})[.)]\s*([^:\n]{2,90}?)\s*:\s*([\s\S]*)$/;

const titleCase = (s) =>
  s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s/(&-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : s;

const splitSentences = (s) => s.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((x) => x.trim()).filter(Boolean) || [];

// Gabungkan per 2 kalimat biar paragraf tidak terlalu panjang/pendek
function paragraphs(text) {
  const sents = splitSentences(text);
  const out = [];
  for (let i = 0; i < sents.length; i += 2) out.push(sents.slice(i, i + 2).join(" "));
  return out;
}

function buildTermRegex(terms) {
  const names = [];
  terms.forEach((t, i) => {
    String(t.term)
      .split(/\s*[/&]\s*|\s*\(|\)/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 3)
      .forEach((n) => names.push({ n, i }));
  });
  if (!names.length) return null;
  names.sort((a, b) => b.n.length - a.n.length);
  const esc = (s) => escapeHtml(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const map = new Map(names.map((x) => [escapeHtml(x.n).toLowerCase(), x.i]));
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map((x) => esc(x.n)).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  return { re, map };
}

export function renderSummary(summary, terms = []) {
  const text = String(summary || "").replace(/\s*->\s*/g, " → ").trim();
  if (!text) return "";
  const termRx = buildTermRegex(terms);
  const seen = new Set(); // sorot tiap istilah sekali per section saja

  // teks sudah di-escape; sisipkan <button class="kw"> untuk istilah
  const rich = (raw) => {
    let html = escapeHtml(raw).replace(/&#39;([^&]{1,60}?)&#39;/g, "<q>$1</q>");
    if (!termRx) return html;
    return html.replace(termRx.re, (m) => {
      const i = termRx.map.get(m.toLowerCase());
      if (i === undefined || seen.has(i)) return m;
      seen.add(i);
      return `<button type="button" class="kw" data-t="${i}">${m}</button>`;
    });
  };

  const body = (content) => {
    const firstItem = content.search(/\(\s*[a-z]\s*\)\s/);
    if (firstItem < 0) return paragraphs(content).map((p) => `<p>${rich(p)}</p>`).join("");

    const intro = content.slice(0, firstItem).replace(/[;,\s]+$/, "");
    const parts = content.slice(firstItem).split(/\(\s*[a-z]\s*\)\s*/).filter((x) => x.trim());
    let outro = "";
    const last = parts.length - 1;
    const cut = parts[last].search(/\.\s+(?=\p{Lu})/u);
    if (cut > 0) {
      outro = parts[last].slice(cut + 1).trim();
      parts[last] = parts[last].slice(0, cut + 1);
    }
    const items = parts.map((p) => {
      p = p.trim().replace(/[;,]\s*(dan|and)?\s*$/i, "").replace(/;$/, "");
      const m = p.match(/^([^-–:]{2,60}?)\s*[-–:]\s+([\s\S]+)$/);
      return m
        ? `<li><strong>${rich(m[1])}</strong><span>${rich(m[2])}</span></li>`
        : `<li><span>${rich(p)}</span></li>`;
    });
    return [
      intro && paragraphs(intro).map((p) => `<p>${rich(p)}</p>`).join(""),
      `<ul class="sum-list">${items.join("")}</ul>`,
      outro && paragraphs(outro).map((p) => `<p>${rich(p)}</p>`).join(""),
    ].join("");
  };

  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  let n = 0;
  return blocks
    .map((b) => {
      seen.clear();
      const m = b.match(SECTION_RE);
      if (!m) return `<div class="sum-plain">${body(b)}</div>`;
      n++;
      return `
        <section class="sum-sec anim-in" id="sum-${n}" style="--i:${n}">
          <header><span class="sum-num">${escapeHtml(m[1])}</span><h3>${escapeHtml(titleCase(m[2].trim()))}</h3></header>
          <div class="sum-body">${body(m[3])}</div>
        </section>`;
    })
    .join("");
}

export const readingMinutes = (s) => Math.max(1, Math.round(String(s || "").split(/\s+/).length / 200));

// popover definisi saat istilah yang disorot di-tap
export function bindTermPopover(root, terms) {
  let pop = null;
  const close = () => { pop?.remove(); pop = null; };
  root.addEventListener("click", (e) => {
    const kw = e.target.closest(".kw");
    if (!kw) return close();
    e.stopPropagation();
    const t = terms[kw.dataset.t];
    if (!t) return;
    const same = pop?.dataset.for === kw.dataset.t;
    close();
    if (same) return;
    pop = document.createElement("div");
    pop.className = "kw-pop";
    pop.dataset.for = kw.dataset.t;
    pop.innerHTML = `<strong></strong><p></p>`;
    pop.querySelector("strong").textContent = t.term;
    pop.querySelector("p").textContent = t.definition;
    document.body.appendChild(pop);
    const r = kw.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 24);
    pop.style.width = w + "px";
    pop.style.left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12)) + "px";
    const below = r.bottom + 10 + pop.offsetHeight < window.innerHeight;
    pop.style.top = (below ? r.bottom + 10 : r.top - pop.offsetHeight - 10) + window.scrollY + "px";
  });
  document.addEventListener("click", close);
  window.addEventListener("hashchange", close, { once: true });
}
