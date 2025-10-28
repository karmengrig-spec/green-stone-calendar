import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, getDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyACYY5Or9OGv98y9fDxVUqEUzro2CbpoVE",
  authDomain: "green-stone-calendar.firebaseapp.com",
  projectId: "green-stone-calendar",
  storageBucket: "green-stone-calendar.firebasestorage.app",
  messagingSenderId: "946090298149",
  appId: "1:946090298149:web:8a8aa5d4c63d511b1c68cc",
  measurementId: "G-8YDMZ2SNGS"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence);

export async function createAccount(email, password) {
  return await createUserWithEmailAndPassword(auth, email, password);
}
export async function signIn(email, password) {
  return await signInWithEmailAndPassword(auth, email, password);
}
export function signOutNow() { return signOut(auth); }
export { onAuthStateChanged };

export async function userIsAdmin(uid) {
  if (!uid) return false;
  const snap = await getDoc(doc(db, "admins", uid));
  return snap.exists();
}

export const bookingsCol = collection(db, "bookings");
export { addDoc, doc, getDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp };
