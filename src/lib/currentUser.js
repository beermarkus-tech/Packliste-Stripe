import { collection, doc } from 'firebase/firestore';
import { db, auth } from './firebase.js';

// Every collection now lives under users/{uid}/... — this is the single
// place that knows the current uid, so data/*.js files never need it
// threaded through their function signatures. Safe to call from anywhere
// that only runs while the app shell (or paywall) is mounted, since
// main.js never mounts either before auth.currentUser is populated.
export function getCurrentUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('No signed-in user');
  return uid;
}

export function userCollection(name) {
  return collection(db, 'users', getCurrentUid(), name);
}

export function userDoc(name, id) {
  return doc(db, 'users', getCurrentUid(), name, id);
}
