import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAAaID9LzQVpaf9hZGZamIWYhS4VmPyEys",
  authDomain: "ln-study-39728.firebaseapp.com",
  projectId: "ln-study-39728",
  storageBucket: "ln-study-39728.firebasestorage.app",
  messagingSenderId: "467779414243",
  appId: "1:467779414243:web:f461e2be9cfc01a26f7dd6",
};

export const ADMIN_EMAILS = [
  "yoga110011@gmail.com",
];

export const DEMO_MODE = firebaseConfig.apiKey.startsWith("PASTE");

export const app = DEMO_MODE ? null : initializeApp(firebaseConfig);
export const auth = DEMO_MODE ? null : getAuth(app);
export const db = DEMO_MODE ? null : getFirestore(app);
