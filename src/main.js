import './styles.css';
import Alpine from 'alpinejs';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './lib/firebase.js';
import { registerRoute, getRender, startRouter, navigateTo } from './lib/router.js';
import { watchAuthState, watchUserProfile } from './lib/auth.js';
import { renderSignIn } from './screens/signin.js';
import { renderPaywall } from './screens/paywall.js';
import { renderHome } from './screens/home.js';
import { renderPrep } from './screens/prep.js';
import { renderChecklist } from './screens/checklist.js';
import { renderSettings } from './screens/settings.js';

const TABS = [
  { path: 'home', icon: '🏠', label: 'Home', render: renderHome },
  { path: 'prep', icon: '🎒', label: 'Prep', render: renderPrep },
  { path: 'checklist', icon: '✔️', label: 'Checklist', render: renderChecklist },
  { path: 'settings', icon: '⚙️', label: 'Settings', render: renderSettings },
];

TABS.forEach((tab) => registerRoute(tab.path, tab.render));

window.Alpine = Alpine;
Alpine.start();

document.getElementById('build-badge').textContent = `#${import.meta.env.VITE_BUILD_NUMBER || 'dev'}`;

const app = document.querySelector('#app');
let shellStarted = false;
let unsubProfile = null;
let profileEnsuredForUid = null;

function renderAppShell() {
  app.innerHTML = `
    <nav class="nav-tabs">
      ${TABS.map(
        (tab) => `
          <button class="nav-tab" data-path="${tab.path}">
            <span class="nav-icon">${tab.icon}</span>
            <span class="nav-label">${tab.label}</span>
          </button>
        `
      ).join('')}
    </nav>
    <main class="app-main"></main>
  `;

  const main = app.querySelector('.app-main');
  const navButtons = app.querySelectorAll('.nav-tab[data-path]');

  navButtons.forEach((button) => {
    button.addEventListener('click', () => navigateTo(button.dataset.path));
  });

  startRouter((path) => {
    getRender(path)(main);
    navButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.path === path);
    });
  });
}

// Creates the signed-in user's own profile doc the first time they're
// seen, so there's something for watchUserProfile to read. Firestore
// rules only allow a client to create an *unpaid* profile — `paid: true`
// can only ever be set by the Stripe webhook's Admin SDK call.
async function ensureProfile(user) {
  if (profileEnsuredForUid === user.uid) return;
  profileEnsuredForUid = user.uid;
  try {
    await setDoc(
      doc(db, 'users', user.uid),
      {
        paid: false,
        email: user.email,
        createdAt: serverTimestamp(),
        stripeCustomerId: null,
        stripeCheckoutSessionId: null,
      },
      { merge: true }
    );
  } catch (err) {
    console.error('Failed to create user profile', err);
  }
}

watchAuthState((user) => {
  unsubProfile?.();
  unsubProfile = null;

  if (!user) {
    shellStarted = false;
    profileEnsuredForUid = null;
    renderSignIn(app);
    return;
  }

  unsubProfile = watchUserProfile(user.uid, (profile) => {
    if (profile?.paid) {
      if (!shellStarted) {
        shellStarted = true;
        renderAppShell();
      }
      return;
    }
    shellStarted = false;
    if (profile === null) {
      ensureProfile(user);
    }
    renderPaywall(app);
  });
});
