import { addDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { userCollection, userDoc } from '../lib/currentUser.js';

// A small collection of category names, kept separate from the catalog
// items themselves so a category can exist (and be deleted) even with no
// items in it yet. Catalog items still just carry a plain `category`
// string — this collection exists purely so "add category"/"delete
// category" have something concrete to act on.
export function watchCategories(callback) {
  return onSnapshot(userCollection('categories'), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createCategory(name) {
  const ref = await addDoc(userCollection('categories'), { name });
  return ref.id;
}

export async function deleteCategory(id) {
  await deleteDoc(userDoc('categories', id));
}
