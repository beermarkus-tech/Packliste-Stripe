import Alpine from 'alpinejs';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase.js';
import { signOutUser } from '../lib/auth.js';

const PROCESSING_TIMEOUT_MS = 20000;

Alpine.data('paywall', (email) => ({
  status: 'idle', // 'idle' | 'redirecting' | 'processing' | 'timeout' | 'cancelled' | 'error'
  errorMessage: '',
  email,
  _timeoutId: null,

  // Stripe's success/cancel redirect lands back here with a query param —
  // that alone isn't proof of payment (the webhook write can trail the
  // redirect by a few seconds), so "success" just starts a spinner and
  // waits for main.js's live profile listener to actually promote the
  // user once `paid` flips true. A timeout avoids an infinite spinner if
  // the webhook is slow or fails.
  init() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      this.status = 'processing';
      this._timeoutId = setTimeout(() => {
        if (this.status === 'processing') this.status = 'timeout';
      }, PROCESSING_TIMEOUT_MS);
    } else if (params.get('checkout') === 'cancelled') {
      this.status = 'cancelled';
    }
    if (params.has('checkout')) {
      params.delete('checkout');
      const query = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
    }
  },

  destroy() {
    clearTimeout(this._timeoutId);
  },

  async unlock() {
    this.status = 'redirecting';
    this.errorMessage = '';
    try {
      const createCheckoutSession = httpsCallable(functions, 'createCheckoutSession');
      const { data } = await createCheckoutSession();
      window.location.href = data.url;
    } catch (err) {
      console.error('Failed to start checkout', err);
      this.status = 'error';
      this.errorMessage = "Couldn't start checkout — please try again.";
    }
  },

  retry() {
    window.location.reload();
  },

  signOut() {
    if (!confirm('Sign out?')) return;
    signOutUser();
  },
}));

export function renderPaywall(container, { email } = {}) {
  container.innerHTML = `
    <div class="signin-screen" x-data='paywall(${JSON.stringify(email || '')})'>
      <h1>🎒 Packliste</h1>

      <template x-if="status === 'processing'">
        <p class="screen-placeholder">Finishing up your purchase…</p>
      </template>

      <template x-if="status === 'timeout'">
        <div>
          <p class="screen-placeholder">Still processing — this is taking longer than expected.</p>
          <button class="btn-secondary" @click="retry()">Refresh</button>
        </div>
      </template>

      <template x-if="!['processing', 'timeout'].includes(status)">
        <div>
          <p class="screen-placeholder" x-show="status === 'cancelled'">Checkout cancelled.</p>
          <p class="screen-placeholder" x-show="status !== 'cancelled'">Unlock Packliste to start packing.</p>
          <p class="signin-error" x-show="status === 'error'" x-text="errorMessage"></p>
          <button class="btn-primary" @click="unlock()" :disabled="status === 'redirecting'">
            <span x-show="status !== 'redirecting'">Unlock Packliste — $1.00</span>
            <span x-show="status === 'redirecting'">Redirecting to checkout…</span>
          </button>
          <p class="screen-placeholder" x-show="email" style="margin-top:24px;font-size:13px;">
            Signed in as <span x-text="email"></span>.
            <a href="#" @click.prevent="signOut()">Not you? Sign out</a>
          </p>
        </div>
      </template>
    </div>
  `;
}
