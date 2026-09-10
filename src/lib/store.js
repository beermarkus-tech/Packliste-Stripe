const STORAGE_KEY = 'packliste:currentItem';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let currentItem = load();
const listeners = new Set();

// { type: 'template' | 'trip', id: string } | null
export function getCurrentItem() {
  return currentItem;
}

export function setCurrentItem(item) {
  currentItem = item;
  try {
    if (item) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(item));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable (private mode etc.) — in-memory state still works this session.
  }
  listeners.forEach((fn) => fn(currentItem));
}

export function onCurrentItemChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
