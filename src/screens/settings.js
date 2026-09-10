import Alpine from 'alpinejs';
import { watchBuckets, createBucket, renameBucket, deleteBucket } from '../data/buckets.js';
import { signOutUser } from '../lib/auth.js';

const LONG_PRESS_MS = 500;

Alpine.data('settings', () => ({
  buckets: [],
  actionSheet: null, // { bucket }
  creating: false,
  newBucketIcon: '🧳',
  newBucketName: '',
  pressTimer: null,

  init() {
    this._unsubBuckets = watchBuckets((list) => {
      this.buckets = list;
    });
  },

  destroy() {
    this._unsubBuckets?.();
  },

  startPress(bucket) {
    clearTimeout(this.pressTimer);
    this.pressTimer = setTimeout(() => {
      this.actionSheet = { bucket };
    }, LONG_PRESS_MS);
  },

  cancelPress() {
    clearTimeout(this.pressTimer);
  },

  closeActionSheet() {
    this.actionSheet = null;
  },

  async doRename() {
    const { bucket } = this.actionSheet;
    this.closeActionSheet();
    const name = prompt('New name', bucket.name);
    if (!name) return;
    try {
      await renameBucket(bucket.id, name);
    } catch (err) {
      alert(`Couldn't rename: ${err.message}`);
    }
  },

  async doDelete() {
    const { bucket } = this.actionSheet;
    this.closeActionSheet();
    if (!confirm(`Delete "${bucket.name}"? This can't be undone.`)) return;
    try {
      await deleteBucket(bucket.id);
    } catch (err) {
      alert(`Couldn't delete: ${err.message}`);
    }
  },

  openNewBucket() {
    this.creating = true;
    this.newBucketIcon = '🧳';
    this.newBucketName = '';
  },

  closeNewBucket() {
    this.creating = false;
  },

  async submitNewBucket() {
    const name = this.newBucketName.trim();
    if (!name) return;
    const icon = this.newBucketIcon.trim() || '🧳';
    try {
      await createBucket({ name, icon });
      this.closeNewBucket();
    } catch (err) {
      alert(`Couldn't add bucket: ${err.message}`);
    }
  },

  signOut() {
    if (!confirm('Sign out?')) return;
    signOutUser();
  },
}));

export function renderSettings(container) {
  container.innerHTML = `
    <div class="screen" data-screen="settings" x-data="settings">
      <h2>Settings</h2>

      <section class="settings-section">
        <div class="home-list-header">
          <h3>Buckets</h3>
          <button class="btn-secondary" @click="openNewBucket()">+ New Bucket</button>
        </div>
        <p class="screen-placeholder" x-show="buckets.length === 0">No buckets yet.</p>
        <ul class="card-list">
          <template x-for="bucket in buckets" :key="bucket.id">
            <li class="card-item"
                @touchstart="startPress(bucket)" @touchend="cancelPress()" @touchmove="cancelPress()"
                @mousedown="startPress(bucket)" @mouseup="cancelPress()" @mouseleave="cancelPress()"
                @contextmenu.prevent>
              <span x-text="bucket.icon + ' ' + bucket.name"></span>
            </li>
          </template>
        </ul>
      </section>

      <section class="settings-section">
        <h3>Account</h3>
        <button class="btn-secondary" @click="signOut()">Sign out</button>
      </section>

      <div class="modal-overlay" x-show="actionSheet" x-cloak @click.self="closeActionSheet()">
        <div class="modal-sheet" x-show="actionSheet">
          <h3 x-text="actionSheet?.bucket?.name"></h3>
          <button @click="doRename()">Rename</button>
          <button class="danger" @click="doDelete()">Delete</button>
          <button class="btn-secondary" @click="closeActionSheet()">Cancel</button>
        </div>
      </div>

      <div class="modal-overlay" x-show="creating" x-cloak @click.self="closeNewBucket()">
        <div class="modal-sheet" x-show="creating">
          <h3>New Bucket</h3>
          <input type="text" class="text-input" x-model="newBucketIcon" placeholder="Icon" maxlength="4" />
          <input type="text" class="text-input" x-model="newBucketName" placeholder="Bucket name" autofocus />
          <button @click="submitNewBucket()">Add</button>
          <button class="btn-secondary" @click="closeNewBucket()">Cancel</button>
        </div>
      </div>
    </div>
  `;
}
