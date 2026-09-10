const routes = new Map();
let defaultRoute = null;

export function registerRoute(path, render) {
  routes.set(path, render);
  if (defaultRoute === null) defaultRoute = path;
}

export function currentPath() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return routes.has(hash) ? hash : defaultRoute;
}

export function navigateTo(path) {
  window.location.hash = `/${path}`;
}

export function startRouter(onNavigate) {
  const render = () => onNavigate(currentPath());
  window.addEventListener('hashchange', render);
  render();
}

export function getRender(path) {
  return routes.get(path);
}
