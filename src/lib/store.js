// Namespaced (not plain 'packliste:currentItem') because production
// Packliste is served from the same origin (just a different path) and
// localStorage is scoped by origin, not path — an unnamespaced key would
// let the two apps clobber each other's "currently open trip" pointer.
const STORAGE_KEY = 'packliste-stripe:currentItem';

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
