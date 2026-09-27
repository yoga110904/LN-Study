import { db, auth, DEMO_MODE } from "./firebase-config.js";
import { demoCourses, demoAllowed, demoStore } from "./demo-data.js";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc, deleteDoc, writeBatch,
  query, orderBy, where, limit, serverTimestamp, arrayUnion, arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Semua konten disimpan per akun:
//   users/{uid}                              { read: ["courseId/weekId", ...] }
//   users/{uid}/courses/{courseId}           { name, status, createdAt }
//   users/{uid}/courses/{courseId}/weeks/{w} { title, outline, summary, terms, quiz, createdAt }
// Rules memastikan user hanya bisa baca/tulis miliknya sendiri.
const uid = () => auth.currentUser.uid;
const userDoc = () => doc(db, "users", uid());
const coursesCol = () => collection(db, "users", uid(), "courses");
const courseDoc = (id) => doc(db, "users", uid(), "courses", id);
const weeksCol = (id) => collection(db, "users", uid(), "courses", id, "weeks");
const weekDoc = (id, w) => doc(db, "users", uid(), "courses", id, "weeks", w);
// gambar istilah: users/{uid}/courses/{c}/weeks/{w}/images/{termIndex} { data: "data:image/webp;base64,...", term, createdAt }
const imagesCol = (id, w) => collection(db, "users", uid(), "courses", id, "weeks", w, "images");

const findDemo = (id) => demoCourses.find((c) => c.id === id);

export async function getCourses() {
  if (DEMO_MODE) return [...demoCourses].sort((a, b) => a.name.localeCompare(b.name));
  const snap = await getDocs(query(coursesCol(), orderBy("name")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getCourse(courseId) {
  if (DEMO_MODE) return findDemo(courseId) || null;
  const snap = await getDoc(courseDoc(courseId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createCourse(name) {
  if (DEMO_MODE) {
    const id = "c" + Date.now();
    demoCourses.push({ id, name, status: "in_progress", weeks: [] });
    return id;
  }
  const ref = await addDoc(coursesCol(), { name, status: "in_progress", createdAt: serverTimestamp() });
  return ref.id;
}

// status: "in_progress" | "done"
export async function setCourseStatus(courseId, status) {
  if (DEMO_MODE) {
    findDemo(courseId).status = status;
    return;
  }
  await updateDoc(courseDoc(courseId), { status });
}

export async function getWeeks(courseId) {
  if (DEMO_MODE) return findDemo(courseId)?.weeks || [];
  const snap = await getDocs(query(weeksCol(courseId), orderBy("createdAt", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getWeek(courseId, weekId) {
  if (DEMO_MODE) return findDemo(courseId)?.weeks.find((w) => w.id === weekId) || null;
  const snap = await getDoc(weekDoc(courseId, weekId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function addWeek(courseId, data) {
  const week = {
    title: data.title,
    outline: data.outline,
    summary: data.summary,
    terms: data.terms,
    quiz: data.quiz,
  };
  if (DEMO_MODE) {
    const id = "w" + Date.now();
    const now = new Date();
    findDemo(courseId).weeks.push({ id, ...week, createdAt: { toDate: () => now } });
    return id;
  }
  const ref = await addDoc(weeksCol(courseId), { ...week, createdAt: serverTimestamp() });
  return ref.id;
}

export async function addWeekImage(courseId, weekId, termIndex, dataUrl, term) {
  if (DEMO_MODE) {
    const w = findDemo(courseId).weeks.find((x) => x.id === weekId);
    (w.images ||= {})[termIndex] = dataUrl;
    return;
  }
  await setDoc(doc(imagesCol(courseId, weekId), String(termIndex)), {
    data: dataUrl,
    term: String(term).slice(0, 200),
    createdAt: serverTimestamp(),
  });
}

// { termIndex: dataUrl }
export async function getWeekImages(courseId, weekId) {
  if (DEMO_MODE) return { ...(findDemo(courseId)?.weeks.find((x) => x.id === weekId)?.images || {}) };
  const snap = await getDocs(imagesCol(courseId, weekId));
  const out = {};
  snap.docs.forEach((d) => {
    const data = d.data().data;
    if (typeof data === "string" && /^data:image\/(webp|jpeg|png);base64,/.test(data)) out[d.id] = data;
  });
  return out;
}

// Semua LN milik user ini (1 query per course)
export async function getAllWeeks() {
  if (DEMO_MODE) return demoCourses.flatMap((c) => c.weeks.map((w) => ({ ...w, courseId: c.id })));
  const courses = await getDocs(coursesCol());
  const lists = await Promise.all(
    courses.docs.map(async (c) => {
      const snap = await getDocs(weeksCol(c.id));
      return snap.docs.map((d) => ({ id: d.id, courseId: c.id, ...d.data() }));
    })
  );
  return lists.flat();
}

// ---------- tanda sudah dibaca ----------
let readCache = null;
export const readKey = (courseId, weekId) => `${courseId}/${weekId}`;

export function clearReadCache() {
  readCache = null;
}

export async function getReadSet() {
  if (readCache) return readCache;
  let arr = [];
  if (DEMO_MODE) {
    try { arr = JSON.parse(localStorage.getItem("demoRead") || "[]"); } catch {}
  } else {
    const snap = await getDoc(userDoc());
    arr = snap.exists() ? snap.data().read || [] : [];
  }
  readCache = new Set(arr);
  return readCache;
}

export async function setRead(courseId, weekId, read) {
  const key = readKey(courseId, weekId);
  const set = await getReadSet();
  if (DEMO_MODE) {
    read ? set.add(key) : set.delete(key);
    try { localStorage.setItem("demoRead", JSON.stringify([...set])); } catch {}
    return;
  }
  await setDoc(userDoc(), { read: read ? arrayUnion(key) : arrayRemove(key) }, { merge: true });
  read ? set.add(key) : set.delete(key);
  if (read) logActivity();
}

async function forgetRead(keys) {
  if (!keys.length) return;
  const set = await getReadSet();
  keys.forEach((k) => set.delete(k));
  if (DEMO_MODE) {
    try { localStorage.setItem("demoRead", JSON.stringify([...set])); } catch {}
    return;
  }
  await setDoc(userDoc(), { read: arrayRemove(...keys) }, { merge: true });
}

// ---------- hapus ----------
async function batchDelete(refs) {
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

export async function deleteWeek(courseId, weekId) {
  if (DEMO_MODE) {
    const c = findDemo(courseId);
    c.weeks = c.weeks.filter((w) => w.id !== weekId);
  } else {
    const imgs = await getDocs(imagesCol(courseId, weekId));
    await batchDelete([...imgs.docs.map((d) => d.ref), weekDoc(courseId, weekId)]);
  }
  await forgetRead([readKey(courseId, weekId)]);
  await forgetSaved("weekId", weekId);
}

// Firestore tidak otomatis menghapus subcollection, jadi weeks dihapus dulu.
export async function deleteCourse(courseId) {
  if (DEMO_MODE) {
    const c = findDemo(courseId);
    demoCourses.splice(demoCourses.indexOf(c), 1);
    await forgetRead(c.weeks.map((w) => readKey(courseId, w.id)));
    await forgetSaved("courseId", courseId);
    return;
  }
  const weeks = await getDocs(weeksCol(courseId));
  const imgs = await Promise.all(weeks.docs.map((w) => getDocs(imagesCol(courseId, w.id))));
  await batchDelete([
    ...imgs.flatMap((s) => s.docs.map((d) => d.ref)),
    ...weeks.docs.map((d) => d.ref),
    courseDoc(courseId),
  ]);
  await forgetRead(weeks.docs.map((d) => readKey(courseId, d.id)));
  await forgetSaved("courseId", courseId);
}

// ---------- whitelist ----------
// allowedUsers/{email}    { allowed: true, addedBy, addedAt }
// allowedDomains/{domain} { allowed: true, addedBy, addedAt }   contoh: "aaa.com"
export const domainOf = (email) => email.toLowerCase().split("@")[1] || "";

async function readAllowed(coll, id) {
  try {
    const snap = await getDoc(doc(db, coll, id));
    return snap.exists() && snap.data().allowed === true;
  } catch {
    return false; // ditolak rules = bukan whitelist
  }
}

export async function checkAccess(email) {
  const e = email.toLowerCase();
  if (DEMO_MODE) return demoAllowed.emails.includes(e) || demoAllowed.domains.includes(domainOf(e));
  const [byEmail, byDomain] = await Promise.all([
    readAllowed("allowedUsers", e),
    readAllowed("allowedDomains", domainOf(e)),
  ]);
  return byEmail || byDomain;
}

export async function listAllowed() {
  if (DEMO_MODE) {
    const wrap = (id) => ({ id, addedBy: "demo" });
    return { emails: demoAllowed.emails.map(wrap), domains: demoAllowed.domains.map(wrap) };
  }
  const [u, d] = await Promise.all([getDocs(collection(db, "allowedUsers")), getDocs(collection(db, "allowedDomains"))]);
  const map = (snap) => snap.docs.map((x) => ({ id: x.id, ...x.data() })).sort((a, b) => a.id.localeCompare(b.id));
  return { emails: map(u), domains: map(d) };
}

const COLL = { email: "allowedUsers", domain: "allowedDomains" };
const DEMO_KEY = { email: "emails", domain: "domains" };

export async function addAllowed(type, id) {
  id = id.toLowerCase();
  if (DEMO_MODE) {
    const list = demoAllowed[DEMO_KEY[type]];
    if (!list.includes(id)) list.push(id);
    return;
  }
  await setDoc(doc(db, COLL[type], id), {
    allowed: true,
    addedBy: auth.currentUser.email,
    addedAt: serverTimestamp(),
  });
}

export async function removeAllowed(type, id) {
  if (DEMO_MODE) {
    const list = demoAllowed[DEMO_KEY[type]];
    list.splice(list.indexOf(id), 1);
    return;
  }
  await deleteDoc(doc(db, COLL[type], id));
}

// =====================================================================
// Latihan ujian, bookmark, catatan, aktivitas harian (semua per akun)
//   users/{uid}                 { read: [...], days: ["2026-09-27", ...] }
//   users/{uid}/attempts/{id}   hasil quiz LN & latihan ujian
//   users/{uid}/bookmarks/{id}  istilah yang ditandai (id = course_week_term)
//   users/{uid}/notes/{id}      catatan pribadi per LN (id = course_week)
// =====================================================================

const sub = (name) => collection(db, "users", uid(), name);
const subDoc = (name, id) => doc(db, "users", uid(), name, id);
const demoTs = () => { const d = new Date(); return { toDate: () => d }; };

export const todayKey = (d = new Date()) => d.toLocaleDateString("sv-SE"); // YYYY-MM-DD (lokal)

let loggedToday = null;
export async function logActivity() {
  const day = todayKey();
  if (loggedToday === day) return;
  loggedToday = day;
  if (DEMO_MODE) {
    if (!demoStore.days.includes(day)) demoStore.days.push(day);
    return;
  }
  try {
    await setDoc(userDoc(), { days: arrayUnion(day) }, { merge: true });
  } catch (e) {
    loggedToday = null;
    console.error(e);
  }
}

export async function getActivityDays() {
  if (DEMO_MODE) return [...demoStore.days];
  const snap = await getDoc(userDoc());
  return snap.exists() ? snap.data().days || [] : [];
}

// ---------- attempts ----------
const clip = (v, n) => String(v ?? "").slice(0, n);

export async function saveAttempt(a) {
  const rec = {
    type: a.type === "ln" ? "ln" : "exam",
    courseId: clip(a.courseId, 100),
    courseName: clip(a.courseName, 100),
    weekIds: (a.weekIds || []).slice(0, 200).map((x) => clip(x, 100)),
    total: Math.max(0, Math.min(1000, a.total | 0)),
    correct: Math.max(0, Math.min(a.total | 0, a.correct | 0)),
    durationSec: Math.max(0, a.durationSec | 0),
    wrong: (a.wrong || []).slice(0, 300).map((w) => ({
      q: clip(w.q, 500), chosen: clip(w.chosen, 300), answer: clip(w.answer, 300),
      weekId: clip(w.weekId, 100), weekTitle: clip(w.weekTitle, 200),
    })),
  };
  logActivity();
  if (DEMO_MODE) {
    demoStore.attempts.unshift({ id: "a" + Date.now(), ...rec, createdAt: demoTs() });
    return;
  }
  await addDoc(sub("attempts"), { ...rec, createdAt: serverTimestamp() });
}

export async function getAttempts(max = 200) {
  if (DEMO_MODE) return demoStore.attempts.slice(0, max);
  const snap = await getDocs(query(sub("attempts"), orderBy("createdAt", "desc"), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------- bookmarks ----------
export const bookmarkId = (courseId, weekId, termIndex) => `${courseId}_${weekId}_${termIndex}`;

export async function getBookmarks() {
  if (DEMO_MODE) return [...demoStore.bookmarks];
  const snap = await getDocs(query(sub("bookmarks"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addBookmark(b) {
  const id = bookmarkId(b.courseId, b.weekId, b.termIndex);
  const rec = {
    courseId: b.courseId, weekId: b.weekId, termIndex: b.termIndex | 0,
    courseName: clip(b.courseName, 100), weekTitle: clip(b.weekTitle, 200),
    term: clip(b.term, 300), definition: clip(b.definition, 3000),
  };
  if (DEMO_MODE) {
    demoStore.bookmarks = demoStore.bookmarks.filter((x) => x.id !== id);
    demoStore.bookmarks.unshift({ id, ...rec, createdAt: demoTs() });
    return id;
  }
  await setDoc(subDoc("bookmarks", id), { ...rec, createdAt: serverTimestamp() });
  return id;
}

export async function removeBookmark(id) {
  if (DEMO_MODE) { demoStore.bookmarks = demoStore.bookmarks.filter((x) => x.id !== id); return; }
  await deleteDoc(subDoc("bookmarks", id));
}

// ---------- catatan ----------
export const noteId = (courseId, weekId) => `${courseId}_${weekId}`;

export async function getNote(courseId, weekId) {
  const id = noteId(courseId, weekId);
  if (DEMO_MODE) return demoStore.notes.find((n) => n.id === id)?.text || "";
  const snap = await getDoc(subDoc("notes", id));
  return snap.exists() ? snap.data().text || "" : "";
}

export async function getNotes() {
  if (DEMO_MODE) return [...demoStore.notes];
  const snap = await getDocs(query(sub("notes"), orderBy("updatedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// teks kosong = hapus catatan
export async function saveNote(meta, text) {
  const id = noteId(meta.courseId, meta.weekId);
  const clean = String(text).slice(0, 20000);
  if (DEMO_MODE) {
    demoStore.notes = demoStore.notes.filter((n) => n.id !== id);
    if (clean.trim()) demoStore.notes.unshift({ id, ...meta, text: clean, updatedAt: demoTs() });
    return;
  }
  if (!clean.trim()) return deleteDoc(subDoc("notes", id));
  await setDoc(subDoc("notes", id), {
    courseId: meta.courseId, weekId: meta.weekId,
    courseName: clip(meta.courseName, 100), weekTitle: clip(meta.weekTitle, 200),
    text: clean, updatedAt: serverTimestamp(),
  });
}

// hapus bookmark & catatan milik LN/course yang dihapus
async function forgetSaved(field, value) {
  if (DEMO_MODE) {
    demoStore.bookmarks = demoStore.bookmarks.filter((x) => x[field] !== value);
    demoStore.notes = demoStore.notes.filter((x) => x[field] !== value);
    return;
  }
  try {
    const [b, n] = await Promise.all([
      getDocs(query(sub("bookmarks"), where(field, "==", value))),
      getDocs(query(sub("notes"), where(field, "==", value))),
    ]);
    await batchDelete([...b.docs, ...n.docs].map((d) => d.ref));
  } catch (e) {
    console.error(e);
  }
}
