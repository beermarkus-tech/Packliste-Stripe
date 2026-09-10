import { addDoc, updateDoc, deleteDoc, getDocs, query, orderBy, onSnapshot } from 'firebase/firestore';
import { userCollection, userDoc } from '../lib/currentUser.js';

function bucketsQuery() {
  return query(userCollection('buckets'), orderBy('order'));
}

export function watchBuckets(callback) {
  return onSnapshot(bucketsQuery(), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// New buckets append to the end — order is just "current max + 1", no
// manual reordering support.
export async function createBucket({ name, icon }) {
  const snap = await getDocs(bucketsQuery());
  const maxOrder = snap.docs.reduce((max, d) => Math.max(max, d.data().order || 0), 0);
  const ref = await addDoc(userCollection('buckets'), { name, icon, order: maxOrder + 1 });
  return ref.id;
}

export async function renameBucket(id, name) {
  await updateDoc(userDoc('buckets', id), { name });
}

// Existing item entries referencing this bucket's id just become harmless
// orphaned bucketIds elsewhere in this app — same pattern as deleting a
// catalog item (see catalog.js).
export async function deleteBucket(id) {
  await deleteDoc(userDoc('buckets', id));
}
