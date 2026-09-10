import { addDoc, updateDoc, getDocs, onSnapshot } from 'firebase/firestore';
import { userCollection, userDoc } from '../lib/currentUser.js';

// The single, permanent item database — one document holding every catalog
// item's preset bucket assignment. Trips can be created as a copy of it, but
// it isn't a trip itself and has no packing/exclude state of its own. It
// still lives in the "templates" collection (a holdover from when there used
// to be several of these); the app now only ever expects one document there.
export function watchDatabase(callback) {
  return onSnapshot(userCollection('templates'), (snap) => {
    const first = snap.docs[0];
    callback(first ? { id: first.id, ...first.data() } : null);
  });
}

export async function getDatabase() {
  const snap = await getDocs(userCollection('templates'));
  const first = snap.docs[0];
  return first ? { id: first.id, ...first.data() } : null;
}

// Bootstraps an empty database document. Only needed the first time the app
// is used, before any database exists yet.
export async function createDatabase() {
  const ref = await addDoc(userCollection('templates'), { name: 'Database', items: [] });
  return ref.id;
}

export async function updateDatabaseItems(id, items) {
  await updateDoc(userDoc('templates', id), { items });
}
