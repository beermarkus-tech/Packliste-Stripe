import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, googleProvider, db } from './firebase.js';

export function signIn() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutUser() {
  return signOut(auth);
}

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

// Live so a payment completing (the Cloud Function webhook flipping
// `paid` to true) is picked up automatically, without a manual refresh.
// Fires with `null` if the profile doc doesn't exist yet (brand-new user,
// before the client has created its own unpaid profile — see main.js).
export function watchUserProfile(uid, callback) {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}
