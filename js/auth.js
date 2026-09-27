import { auth, DEMO_MODE, ADMIN_EMAILS } from "./firebase-config.js";
import { clearReadCache, checkAccess } from "./firestore.js";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let currentUser = null;
let access = { allowed: false, admin: false };
let ready;
const readyPromise = new Promise((r) => (ready = r));

const DEMO_USER = { displayName: "Demo User", email: "demo@ln-study.local", photoURL: "" };
let changeCb = () => { };

export const isAdminEmail = (email = "") =>
  DEMO_MODE || ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email.toLowerCase());

async function resolveAccess(user) {
  if (!user) return { allowed: false, admin: false };
  const admin = isAdminEmail(user.email);
  const allowed = admin || (await checkAccess(user.email));
  return { allowed, admin };
}

async function setUser(user) {
  currentUser = user;
  access = await resolveAccess(user);
  ready();
  changeCb(user);
}

export function initAuth(onChange) {
  changeCb = onChange;
  if (DEMO_MODE) {
    setUser(DEMO_USER);
    return;
  }
  onAuthStateChanged(auth, (user) => setUser(user));
}

export const whenReady = () => readyPromise;
export const getUser = () => currentUser;
export const getAccess = () => access;

export async function recheckAccess() {
  access = await resolveAccess(currentUser);
  changeCb(currentUser);
  return access.allowed;
}

export async function signInWithGoogle() {
  if (DEMO_MODE) return setUser(DEMO_USER);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithPopup(auth, provider);
}

export async function logout() {
  clearReadCache();
  if (DEMO_MODE) return setUser(null);
  await signOut(auth);
}
