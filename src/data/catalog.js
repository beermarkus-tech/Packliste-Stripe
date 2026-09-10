import { addDoc, updateDoc, deleteDoc, getDocs, onSnapshot } from 'firebase/firestore';
import { userCollection, userDoc } from '../lib/currentUser.js';

export function watchCatalog(callback) {
  return onSnapshot(userCollection('catalog'), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function getCatalog() {
  const snap = await getDocs(userCollection('catalog'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// New catalog items appear immediately for every template/trip going
// forward — they are never retroactively added to existing ones, since
// each template/trip only stores entries for items it has assigned.
export async function createCatalogItem({ category, name, icon, defaultQuantity = 1 }) {
  const ref = await addDoc(userCollection('catalog'), { category, name, icon, defaultQuantity });
  return ref.id;
}

export async function updateCatalogItem(id, { category, name, icon }) {
  await updateDoc(userDoc('catalog', id), { category, name, icon });
}

// Existing template/trip entries referencing this item just become
// invisible (their catalog lookup returns nothing) — same as deleting a
// bucket leaves harmless orphaned bucketIds elsewhere in this app.
export async function deleteCatalogItem(id) {
  await deleteDoc(userDoc('catalog', id));
}
