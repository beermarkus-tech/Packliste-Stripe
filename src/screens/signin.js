import { signIn } from '../lib/auth.js';

export function renderSignIn(container) {
  container.innerHTML = `
    <div class="signin-screen">
      <h1>🎒 Packliste</h1>
      <p class="screen-placeholder">Sign in to access your packing lists.</p>
      <button class="btn-primary" id="signin-btn">Sign in with Google</button>
    </div>
  `;

  container.querySelector('#signin-btn').addEventListener('click', () => {
    signIn().catch((err) => {
      console.error('Sign-in failed', err);
    });
  });
}
