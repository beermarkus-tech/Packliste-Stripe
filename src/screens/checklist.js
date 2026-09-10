import Alpine from 'alpinejs';
import { onSnapshot } from 'firebase/firestore';
import { userDoc } from '../lib/currentUser.js';
import { getCurrentItem } from '../lib/store.js';
import { watchCatalog } from '../data/catalog.js';
import { watchBuckets } from '../data/buckets.js';
import { updateTripItems } from '../data/trips.js';

Alpine.data('checklist', () => ({
  currentItem: getCurrentItem(),
  itemDoc: null,
  catalog: [],
  buckets: [],
  activeBucketId: null,
  hiddenBucketIds: ['__unchecked__'], // the virtual "Unchecked" bucket starts hidden
  sortMode: 'symbol', // 'alpha' | 'symbol'

  init() {
    if (!this.currentItem || this.currentItem.type !== 'trip') return;

    this._unsubDoc = onSnapshot(userDoc('trips', this.currentItem.id), (snap) => {
      this.itemDoc = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    });
    this._unsubCatalog = watchCatalog((list) => {
      this.catalog = list;
    });
    this._unsubBuckets = watchBuckets((list) => {
      this.buckets = list;
      if (!this.activeBucketId && list.length > 0) {
        this.activeBucketId = list[0].id;
      }
    });
  },

  destroy() {
    this._unsubDoc?.();
    this._unsubCatalog?.();
    this._unsubBuckets?.();
  },

  selectBucket(bucketId) {
    this.activeBucketId = bucketId;
  },

  // A synthetic bucket, not stored anywhere, that aggregates every unchecked
  // item across every real bucket. It flows through the same chip/panel
  // machinery as a real bucket (see displayBuckets) so it gets identical
  // styling and mobile/tablet behavior for free.
  get unpackedBucket() {
    return { id: '__unchecked__', name: 'Unchecked', icon: '🔲', type: 'virtual' };
  },

  get displayBuckets() {
    return [...this.buckets, this.unpackedBucket];
  },

  bucketIcon(bucketId) {
    return this.buckets.find((b) => b.id === bucketId)?.icon || '';
  },

  // Tablet shows every bucket's checklist at once as a grid of panels,
  // so a chip click there toggles that one panel's visibility instead
  // of switching which single panel is shown (the phone behavior).
  get isTabletLayout() {
    return window.matchMedia('(min-width: 768px)').matches;
  },

  onBucketChipClick(bucketId) {
    if (this.isTabletLayout) {
      this.toggleBucketHidden(bucketId);
    } else {
      this.selectBucket(bucketId);
    }
  },

  toggleBucketHidden(bucketId) {
    const idx = this.hiddenBucketIds.indexOf(bucketId);
    if (idx === -1) {
      this.hiddenBucketIds.push(bucketId);
    } else {
      this.hiddenBucketIds.splice(idx, 1);
    }
  },

  isBucketHidden(bucketId) {
    return this.hiddenBucketIds.includes(bucketId);
  },

  showAllBuckets() {
    this.hiddenBucketIds = [];
  },

  toggleSortMode() {
    this.sortMode = this.sortMode === 'alpha' ? 'symbol' : 'alpha';
  },

  async unpackAll() {
    if (!confirm('Uncheck all items across every checklist? This cannot be undone.')) return;
    const items = this.itemDoc?.items || [];
    const next = items.map((e) => ({ ...e, bucketIds: [...e.bucketIds], checked: {} }));
    try {
      await updateTripItems(this.currentItem.id, next);
    } catch (err) {
      console.error('Failed to unpack all', err);
    }
  },

  // Trips own a dead-copy snapshot of the catalog from the moment they were
  // created (see data/trips.js) — that's checked first, so a later rename
  // via the shared catalog never changes what's already shown here. Falling
  // back to the live catalog only covers trips created before this snapshot
  // existed; the one-time migration in Settings backfills those too.
  catalogFor(itemId) {
    return (
      (this.itemDoc?.localCatalog || []).find((c) => c.id === itemId) ||
      this.catalog.find((c) => c.id === itemId)
    );
  },

  get kofferBucket() {
    return this.buckets.find((bucket) => bucket.name === 'Koffer');
  },

  get hinreiseBucket() {
    return this.buckets.find((bucket) => bucket.name === 'Hinreise');
  },

  isChecked(entry, bucketId) {
    return !!entry.checked?.[bucketId];
  },

  // An item counts as "in" a bucket either via bucketIds, or via the
  // Koffer/Hinreise combo toggle on Prep (which is tracked separately).
  isInBucket(entry, bucketId) {
    if (entry.bucketIds?.includes(bucketId)) return true;
    if (entry.comboSide === 'koffer' && bucketId === this.kofferBucket?.id) return true;
    if (entry.comboSide === 'hinreise' && bucketId === this.hinreiseBucket?.id) return true;
    return false;
  },

  rowsForBucket(bucketId) {
    return (this.itemDoc?.items || [])
      .filter((entry) => !entry.excluded && this.isInBucket(entry, bucketId))
      .map((entry) => ({ entry, catalogItem: this.catalogFor(entry.itemId), bucketId }))
      .filter((row) => !!row.catalogItem);
  },

  // Flat alphabetical (or symbol) order — Checklist shows no category
  // headers, so grouping by category would make the order look arbitrary.
  // checkedLast sinks checked items to the bottom of a real bucket's own
  // list; the virtual "Unchecked" view has nothing checked in it by
  // construction, so it skips that pass.
  sortRows(rows, { checkedLast }) {
    return [...rows].sort((a, b) => {
      if (checkedLast) {
        const checkedA = this.isChecked(a.entry, a.bucketId);
        const checkedB = this.isChecked(b.entry, b.bucketId);
        if (checkedA !== checkedB) return checkedA ? 1 : -1;
      }
      if (this.sortMode === 'symbol') {
        return (
          a.catalogItem.icon.localeCompare(b.catalogItem.icon) ||
          a.catalogItem.name.localeCompare(b.catalogItem.name, 'de')
        );
      }
      return a.catalogItem.name.localeCompare(b.catalogItem.name, 'de');
    });
  },

  itemsForBucket(bucketId) {
    if (bucketId === this.unpackedBucket.id) {
      const rows = this.buckets.flatMap((bucket) =>
        this.rowsForBucket(bucket.id).filter((row) => !this.isChecked(row.entry, row.bucketId))
      );
      return this.sortRows(rows, { checkedLast: false });
    }
    return this.sortRows(this.rowsForBucket(bucketId), { checkedLast: true });
  },

  progressFor(bucketId) {
    const rows = this.itemsForBucket(bucketId);
    const done = rows.filter((row) => this.isChecked(row.entry, bucketId)).length;
    return `${done}/${rows.length}`;
  },

  panelProgressLabel(bucket) {
    if (bucket.id === this.unpackedBucket.id) {
      return `${this.itemsForBucket(bucket.id).length} remaining`;
    }
    return `${this.progressFor(bucket.id)} packed`;
  },

  isBucketComplete(bucketId) {
    const rows = this.itemsForBucket(bucketId);
    return rows.length > 0 && rows.every((row) => this.isChecked(row.entry, bucketId));
  },

  // null for an empty bucket — nothing to show a percentage of. Also null
  // for the virtual "Unchecked" bucket: every row in it is by construction
  // unchecked, so the badge could only ever show a stuck 0% until the list
  // empties, which is more confusing than useful.
  percentFor(bucketId) {
    if (bucketId === this.unpackedBucket.id) return null;
    const rows = this.itemsForBucket(bucketId);
    if (rows.length === 0) return null;
    const done = rows.filter((row) => this.isChecked(row.entry, bucketId)).length;
    return Math.round((done / rows.length) * 100);
  },

  async toggleChecked(entry, bucketId) {
    const items = this.itemDoc?.items || [];
    const next = items.map((e) => {
      if (e.itemId !== entry.itemId) return e;
      const checked = { ...(e.checked || {}) };
      checked[bucketId] = !checked[bucketId];
      return { ...e, bucketIds: [...e.bucketIds], checked };
    });
    try {
      await updateTripItems(this.currentItem.id, next);
    } catch (err) {
      console.error('Failed to save checked state', err);
    }
  },
}));

export function renderChecklist(container) {
  const currentItem = getCurrentItem();

  if (!currentItem || currentItem.type !== 'trip') {
    container.innerHTML = `
      <div class="screen" data-screen="checklist">
        <h2>Checklist</h2>
        <p class="screen-placeholder">Checklists are only available on trips. Open a trip from Home.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="screen" data-screen="checklist" x-data="checklist">
      <div class="prep-header">
        <h2 x-text="itemDoc?.name || '…'"></h2>
        <div class="prep-header-actions">
          <button class="btn-secondary header-action-mobile-only" @click="unpackAll()">Unpack all</button>
        </div>
      </div>

      <div class="bucket-tabs">
        <template x-for="bucket in displayBuckets" :key="bucket.id">
          <button
            class="filter-chip"
            :class="(!isTabletLayout && activeBucketId === bucket.id ? 'filter-chip-active ' : '') + (isTabletLayout && isBucketHidden(bucket.id) ? 'filter-chip-hidden ' : (isBucketComplete(bucket.id) ? 'filter-chip-complete' : ''))"
            @click="onBucketChipClick(bucket.id)">
            <span x-text="bucket.icon"></span>
            <span x-text="bucket.name"></span>
            <span class="filter-chip-percent" x-show="percentFor(bucket.id) !== null" x-text="percentFor(bucket.id) + '%'"></span>
          </button>
        </template>
        <button
          class="filter-chip"
          :class="sortMode === 'alpha' ? 'filter-chip-active' : ''"
          @click="toggleSortMode()"
        >🔤 Sort alphabetically</button>
        <button class="filter-chip filter-chip-reset" x-show="hiddenBucketIds.length > 0" @click="showAllBuckets()">Show all</button>
        <button class="btn-secondary header-action-tablet-only" @click="unpackAll()">Unpack all</button>
      </div>

      <div class="bucket-panels">
        <template x-for="bucket in displayBuckets" :key="bucket.id">
          <div class="bucket-panel" :class="(activeBucketId === bucket.id ? 'bucket-panel-active ' : '') + (isBucketHidden(bucket.id) ? 'bucket-panel-hidden' : '')">
            <div class="bucket-panel-header">
              <span x-text="bucket.icon + ' ' + bucket.name"></span>
              <span class="bucket-progress" x-text="panelProgressLabel(bucket)"></span>
            </div>
            <p class="screen-placeholder" x-show="itemsForBucket(bucket.id).length === 0">Nothing here yet.</p>
            <ul class="checklist-list">
              <template x-for="row in itemsForBucket(bucket.id)" :key="row.entry.itemId + ':' + row.bucketId">
                <li class="checklist-row"
                    :class="isChecked(row.entry, row.bucketId) ? 'checklist-row-checked' : ''"
                    @click="toggleChecked(row.entry, row.bucketId)">
                  <span class="checklist-checkbox" :class="isChecked(row.entry, row.bucketId) ? 'checklist-checkbox-checked' : ''">
                    <span x-show="isChecked(row.entry, row.bucketId)">✓</span>
                  </span>
                  <span class="checklist-icon" x-text="row.catalogItem.icon"></span>
                  <span class="checklist-name" x-text="row.catalogItem.name"></span>
                  <span class="checklist-source-icon" x-show="bucket.id === '__unchecked__'" x-text="bucketIcon(row.bucketId)"></span>
                  <span class="qty-badge" x-text="'×' + row.entry.quantity"></span>
                </li>
              </template>
            </ul>
          </div>
        </template>
      </div>
    </div>
  `;
}
