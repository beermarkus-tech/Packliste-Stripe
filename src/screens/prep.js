import Alpine from 'alpinejs';
import { onSnapshot } from 'firebase/firestore';
import { userDoc } from '../lib/currentUser.js';
import { getCurrentItem } from '../lib/store.js';
import { watchCatalog, createCatalogItem, updateCatalogItem, deleteCatalogItem } from '../data/catalog.js';
import { watchCategories, createCategory, deleteCategory } from '../data/categories.js';
import { watchBuckets } from '../data/buckets.js';
import { updateDatabaseItems } from '../data/database.js';
import {
  updateTripItems,
  addLocalCatalogItem,
  updateLocalCatalogItem,
  deleteLocalCatalogItem,
} from '../data/trips.js';

function findEntry(items, itemId) {
  return items.find((entry) => entry.itemId === itemId);
}

function upsertEntry(items, itemId, patch, catalogItem) {
  const next = items.map((entry) => ({ ...entry, bucketIds: [...entry.bucketIds] }));
  const existing = next.find((entry) => entry.itemId === itemId);
  if (existing) {
    Object.assign(existing, patch);
  } else {
    next.push({
      itemId,
      bucketIds: [],
      quantity: catalogItem?.defaultQuantity || 1,
      ...patch,
    });
  }
  return next;
}

Alpine.data('prep', () => ({
  currentItem: getCurrentItem(),
  itemDoc: null,
  catalog: [],
  categories: [],
  buckets: [],
  selectedCategories: [],
  comboFilterActive: false,
  hideExcluded: false,
  sortMode: 'symbol', // 'alpha' | 'symbol'
  addingItem: false,
  newItemIcon: '📦',
  newItemName: '',
  newItemCategory: '',
  newItemNewCategory: '',
  quantityModal: null, // catalog item currently being edited, or null
  bucketModal: null, // catalog item currently being edited, or null
  editItemModal: null, // catalog item currently being edited, or null
  editItemIcon: '',
  editItemName: '',
  editItemCategory: '',
  editItemNewCategory: '',
  categoryModalOpen: false,

  init() {
    if (!this.currentItem) return;

    const collectionName = this.currentItem.type === 'template' ? 'templates' : 'trips';
    this._unsubDoc = onSnapshot(userDoc(collectionName, this.currentItem.id), (snap) => {
      this.itemDoc = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    });
    this._unsubCatalog = watchCatalog((list) => {
      this.catalog = list;
    });
    this._unsubCategories = watchCategories((list) => {
      this.categories = list;
    });
    this._unsubBuckets = watchBuckets((list) => {
      this.buckets = list;
    });
  },

  destroy() {
    this._unsubDoc?.();
    this._unsubCatalog?.();
    this._unsubCategories?.();
    this._unsubBuckets?.();
  },

  // Every trip owns a dead-copy snapshot of the catalog, taken the moment it
  // was created (see data/trips.js) — that's the trip's whole item list from
  // then on, fully independent of the shared catalog and the database.
  // Falling back to the live catalog for any id missing there covers trips
  // created before this snapshot existed; run the one-time migration in
  // Settings to backfill those too.
  get effectiveCatalog() {
    if (this.isDatabase) return this.catalog;
    const local = this.itemDoc?.localCatalog || [];
    const localIds = new Set(local.map((item) => item.id));
    const fallback = this.catalog.filter((item) => !localIds.has(item.id));
    return [...local, ...fallback];
  },

  isLocalItem(catalogItem) {
    return !this.isDatabase && (this.itemDoc?.localCatalog || []).some((item) => item.id === catalogItem.id);
  },

  // Merges the stored categories collection (which can hold empty
  // categories with no items yet) with any category names still only
  // implied by existing items — so nothing already in use disappears.
  get categoryNames() {
    const fromDocs = this.categories.map((c) => c.name);
    const fromItems = this.effectiveCatalog.map((item) => item.category);
    return [...new Set([...fromDocs, ...fromItems])].sort((a, b) => a.localeCompare(b, 'de'));
  },

  get filteredItems() {
    let items =
      this.selectedCategories.length === 0
        ? this.effectiveCatalog
        : this.effectiveCatalog.filter((item) => this.selectedCategories.includes(item.category));
    if (this.comboFilterActive) {
      items = items.filter((item) => this.comboStateFor(item));
    }
    if (this.hideExcluded) {
      items = items.filter((item) => !this.isExcluded(item));
    }
    return [...items].sort((a, b) =>
      this.sortMode === 'symbol'
        ? a.icon.localeCompare(b.icon) || a.name.localeCompare(b.name, 'de')
        : a.name.localeCompare(b.name, 'de')
    );
  },

  // Keeps the categories collection in sync whenever a brand-new category
  // name is typed via "+ New category…" on either modal, so it becomes a
  // real, deletable category rather than just an implied one.
  async ensureCategoryDoc(name) {
    const exists = this.categories.some((c) => c.name.toLowerCase() === name.toLowerCase());
    if (exists) return;
    try {
      await createCategory(name);
    } catch (err) {
      console.error('Failed to save new category', err);
    }
  },

  isCategorySelected(category) {
    return this.selectedCategories.includes(category);
  },

  toggleCategoryFilter(category) {
    this.selectedCategories = this.isCategorySelected(category)
      ? this.selectedCategories.filter((c) => c !== category)
      : [...this.selectedCategories, category];
  },

  toggleComboFilter() {
    this.comboFilterActive = !this.comboFilterActive;
  },

  toggleHideExcluded() {
    this.hideExcluded = !this.hideExcluded;
  },

  toggleSortMode() {
    this.sortMode = this.sortMode === 'alpha' ? 'symbol' : 'alpha';
  },

  get hasActiveFilters() {
    return this.selectedCategories.length > 0 || this.comboFilterActive || this.hideExcluded;
  },

  resetFilters() {
    this.selectedCategories = [];
    this.comboFilterActive = false;
    this.hideExcluded = false;
  },

  entryFor(itemId) {
    const items = this.itemDoc?.items || [];
    return findEntry(items, itemId);
  },

  quantityFor(catalogItem) {
    return this.entryFor(catalogItem.id)?.quantity ?? catalogItem.defaultQuantity ?? 1;
  },

  isAssigned(catalogItem, bucketId) {
    return !!this.entryFor(catalogItem.id)?.bucketIds?.includes(bucketId);
  },

  // Koffer/Hinreise are represented by the combo chip instead when the item
  // is in any combo state (including "beide", where they're both directly
  // in bucketIds) — excluded here so they aren't shown twice.
  assignedBuckets(catalogItem) {
    const ids = this.entryFor(catalogItem.id)?.bucketIds || [];
    const comboIds = new Set();
    if (this.comboStateFor(catalogItem)) {
      if (this.kofferBucket) comboIds.add(this.kofferBucket.id);
      if (this.hinreiseBucket) comboIds.add(this.hinreiseBucket.id);
    }
    return this.buckets.filter((bucket) => ids.includes(bucket.id) && !comboIds.has(bucket.id));
  },

  get kofferBucket() {
    return this.buckets.find((bucket) => bucket.name === 'Koffer');
  },

  get hinreiseBucket() {
    return this.buckets.find((bucket) => bucket.name === 'Hinreise');
  },

  // 'koffer' | 'hinreise' | 'beide' | null. "beide" means the item is
  // assigned directly to both buckets (bucketIds contains both ids, no
  // comboSide) — reached via the row chip's 3rd tap, or by toggling both
  // buckets individually in the modal. It's checked independently in each
  // bucket's own checklist, same as any other multi-bucket item.
  comboStateFor(catalogItem) {
    const entry = this.entryFor(catalogItem.id);
    if (!entry) return null;
    if (entry.comboSide === 'koffer' || entry.comboSide === 'hinreise') return entry.comboSide;
    if (this.kofferBucket && this.hinreiseBucket) {
      const hasKoffer = entry.bucketIds?.includes(this.kofferBucket.id);
      const hasHinreise = entry.bucketIds?.includes(this.hinreiseBucket.id);
      if (hasKoffer && hasHinreise) return 'beide';
    }
    return null;
  },

  // Used only by the bucket-modal's combined "Koffer/Hinreise" button, which
  // stays a simple on/off for the comboSide-based states — "beide" is always
  // reached via the two individual bucket buttons or the row chip's 3rd tap,
  // never through this one, so it shouldn't react to a "beide" it didn't set.
  isComboSideActive(catalogItem) {
    const side = this.entryFor(catalogItem.id)?.comboSide;
    return side === 'koffer' || side === 'hinreise';
  },

  // Row-level chip: cycles Koffer -> Hinreise -> Beide (both, ticked off
  // independently in each list) -> back to Koffer.
  async toggleComboBucket(catalogItem) {
    const state = this.comboStateFor(catalogItem);
    if (!state || !this.kofferBucket || !this.hinreiseBucket) return;
    const items = this.itemDoc?.items || [];
    const existing = findEntry(items, catalogItem.id);
    const others = (existing?.bucketIds || []).filter(
      (id) => id !== this.kofferBucket.id && id !== this.hinreiseBucket.id
    );
    let patch;
    if (state === 'koffer') {
      patch = { comboSide: 'hinreise', bucketIds: others };
    } else if (state === 'hinreise') {
      patch = { comboSide: null, bucketIds: [...others, this.kofferBucket.id, this.hinreiseBucket.id] };
    } else {
      patch = { comboSide: 'koffer', bucketIds: others };
    }
    const next = upsertEntry(items, catalogItem.id, patch, catalogItem);
    await this.persist(next).catch((err) => console.error('Failed to toggle Koffer/Hinreise', err));
  },

  // Modal row: selecting the combo (default Koffer) clears any direct
  // Koffer/Hinreise bucket assignment; tapping again clears the combo.
  async toggleComboSelection(catalogItem) {
    if (!this.kofferBucket || !this.hinreiseBucket) return;
    const items = this.itemDoc?.items || [];
    const existing = findEntry(items, catalogItem.id);
    const alreadyCombo = this.isComboSideActive(catalogItem);
    const excludeIds = new Set([this.kofferBucket.id, this.hinreiseBucket.id]);
    const nextBucketIds = (existing?.bucketIds || []).filter((id) => !excludeIds.has(id));
    const patch = alreadyCombo
      ? { comboSide: null, bucketIds: nextBucketIds }
      : { comboSide: 'koffer', bucketIds: nextBucketIds };
    const next = upsertEntry(items, catalogItem.id, patch, catalogItem);
    await this.persist(next).catch((err) => console.error('Failed to toggle Koffer/Hinreise', err));
  },

  // The database has no exclude/pack state — every item in it is always "in".
  get isDatabase() {
    return this.currentItem?.type === 'template';
  },

  isExcluded(catalogItem) {
    return !this.isDatabase && this.entryFor(catalogItem.id)?.excluded === true;
  },

  async toggleExcluded(catalogItem) {
    if (this.isDatabase) return;
    const items = this.itemDoc?.items || [];
    const next = upsertEntry(
      items,
      catalogItem.id,
      { excluded: !this.isExcluded(catalogItem) },
      catalogItem
    );
    await this.persist(next).catch((err) => console.error('Failed to save excluded state', err));
  },

  async persist(items) {
    if (this.isDatabase) {
      await updateDatabaseItems(this.currentItem.id, items);
    } else {
      await updateTripItems(this.currentItem.id, items);
    }
  },

  async toggleBucket(catalogItem, bucketId) {
    const items = this.itemDoc?.items || [];
    const existing = findEntry(items, catalogItem.id);
    const currentBucketIds = existing?.bucketIds || [];
    const turningOn = !currentBucketIds.includes(bucketId);
    const nextBucketIds = turningOn
      ? [...currentBucketIds, bucketId]
      : currentBucketIds.filter((id) => id !== bucketId);
    const patch = { bucketIds: nextBucketIds };
    const isComboMember = bucketId === this.kofferBucket?.id || bucketId === this.hinreiseBucket?.id;
    if (isComboMember && turningOn && existing?.comboSide) {
      patch.comboSide = null;
    }
    const next = upsertEntry(items, catalogItem.id, patch, catalogItem);
    await this.persist(next).catch((err) => console.error('Failed to save bucket assignment', err));
  },

  async changeQuantity(catalogItem, delta) {
    const current = this.quantityFor(catalogItem);
    const nextQty = Math.max(1, current + delta);
    const items = this.itemDoc?.items || [];
    const next = upsertEntry(items, catalogItem.id, { quantity: nextQty }, catalogItem);
    await this.persist(next).catch((err) => console.error('Failed to save quantity', err));
  },

  openQuantityModal(catalogItem) {
    this.quantityModal = catalogItem;
  },

  closeQuantityModal() {
    this.quantityModal = null;
  },

  openEditItem() {
    if (!this.quantityModal) return;
    const item = this.quantityModal;
    this.closeQuantityModal();
    this.editItemModal = item;
    this.editItemIcon = item.icon;
    this.editItemName = item.name;
    this.editItemCategory = item.category;
    this.editItemNewCategory = '';
  },

  closeEditItem() {
    this.editItemModal = null;
  },

  async submitEditItem() {
    if (!this.editItemModal) return;
    const name = this.editItemName.trim();
    if (!name) return;
    const category =
      this.editItemCategory === '__new__' ? this.editItemNewCategory.trim() : this.editItemCategory;
    if (!category) return;
    const icon = this.editItemIcon.trim() || '📦';
    try {
      if (this.editItemCategory === '__new__') await this.ensureCategoryDoc(category);
      if (this.isLocalItem(this.editItemModal)) {
        await updateLocalCatalogItem(this.currentItem.id, this.editItemModal.id, { name, category, icon });
      } else {
        await updateCatalogItem(this.editItemModal.id, { name, category, icon });
      }
      this.closeEditItem();
    } catch (err) {
      alert(`Couldn't save changes: ${err.message}`);
    }
  },

  async deleteEditItem() {
    if (!this.editItemModal) return;
    const scope = this.isLocalItem(this.editItemModal) ? 'this checklist' : 'the catalog';
    if (!confirm(`Delete "${this.editItemModal.name}" from ${scope}? This can't be undone.`)) return;
    try {
      if (this.isLocalItem(this.editItemModal)) {
        await deleteLocalCatalogItem(this.currentItem.id, this.editItemModal.id);
      } else {
        await deleteCatalogItem(this.editItemModal.id);
      }
      this.closeEditItem();
    } catch (err) {
      alert(`Couldn't delete item: ${err.message}`);
    }
  },

  openBucketModal(catalogItem) {
    this.bucketModal = catalogItem;
  },

  closeBucketModal() {
    this.bucketModal = null;
  },

  get isTripFromDatabase() {
    return this.currentItem?.type === 'trip' && !!this.itemDoc?.sourceTemplateId;
  },

  async updateDatabaseFromTrip() {
    if (!confirm("Overwrite the database's items with this trip's current assignments? Checked/excluded state is not affected.")) {
      return;
    }
    const items = (this.itemDoc.items || []).map(({ itemId, bucketIds, quantity, comboSide }) => ({
      itemId,
      bucketIds: [...bucketIds],
      quantity,
      ...(comboSide ? { comboSide } : {}),
    }));
    try {
      await updateDatabaseItems(this.itemDoc.sourceTemplateId, items);
      alert('Database updated.');
    } catch (err) {
      alert(`Couldn't update database: ${err.message}`);
    }
  },

  openAddItem() {
    this.addingItem = true;
    this.newItemIcon = '📦';
    this.newItemName = '';
    this.newItemCategory = this.categoryNames[0] || '__new__';
    this.newItemNewCategory = '';
  },

  closeAddItem() {
    this.addingItem = false;
  },

  async submitNewItem() {
    const name = this.newItemName.trim();
    if (!name) return;
    const category =
      this.newItemCategory === '__new__' ? this.newItemNewCategory.trim() : this.newItemCategory;
    if (!category) return;
    const icon = this.newItemIcon.trim() || '📦';
    try {
      if (this.newItemCategory === '__new__') await this.ensureCategoryDoc(category);
      if (this.isDatabase) {
        await createCatalogItem({ category, name, icon, defaultQuantity: 1 });
      } else {
        await addLocalCatalogItem(this.currentItem.id, { category, name, icon, defaultQuantity: 1 });
      }
      this.closeAddItem();
    } catch (err) {
      alert(`Couldn't add item: ${err.message}`);
    }
  },

  async openAddCategory() {
    if (!this.isDatabase) return;
    const name = prompt('New category name');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (this.categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      alert(`"${trimmed}" already exists.`);
      return;
    }
    try {
      await createCategory(trimmed);
    } catch (err) {
      alert(`Couldn't add category: ${err.message}`);
    }
  },

  itemCountForCategory(name) {
    return this.effectiveCatalog.filter((item) => item.category === name).length;
  },

  openDeleteCategory() {
    if (!this.isDatabase) return;
    this.categoryModalOpen = true;
  },

  closeDeleteCategory() {
    this.categoryModalOpen = false;
  },

  async deleteCategoryByName(name) {
    const count = this.itemCountForCategory(name);
    if (count > 0) {
      alert(`Can't delete "${name}" — it still has ${count} item(s) in it. Move or delete them first.`);
      return;
    }
    const categoryDoc = this.categories.find((c) => c.name === name);
    if (!categoryDoc) {
      alert(`"${name}" isn't a stored category — there's nothing to delete.`);
      return;
    }
    if (!confirm(`Delete category "${name}"? This can't be undone.`)) return;
    try {
      await deleteCategory(categoryDoc.id);
      this.closeDeleteCategory();
    } catch (err) {
      alert(`Couldn't delete category: ${err.message}`);
    }
  },
}));

export function renderPrep(container) {
  const currentItem = getCurrentItem();

  if (!currentItem) {
    container.innerHTML = `
      <div class="screen" data-screen="prep">
        <h2>Prep</h2>
        <p class="screen-placeholder">No database or trip is open. Go to Home and open one first.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="screen" data-screen="prep" x-data="prep">
      <div class="prep-header">
        <h2 x-text="itemDoc?.name || '…'"></h2>
        <div class="prep-header-actions">
          <button class="btn-secondary header-action-mobile-only" @click="openAddItem()">+ Add item</button>
          <button class="btn-secondary header-action-mobile-only" x-show="isDatabase" @click="openAddCategory()">+ Add category</button>
          <button class="btn-secondary header-action-mobile-only" x-show="isDatabase" @click="openDeleteCategory()">Delete category</button>
          <button class="btn-secondary" x-show="isTripFromDatabase" @click="updateDatabaseFromTrip()">Update database from this trip</button>
        </div>
      </div>

      <div class="category-filter-row">
        <button
          class="filter-chip filter-chip-combo"
          :class="comboFilterActive ? 'filter-chip-active' : ''"
          @click="toggleComboFilter()"
          x-show="kofferBucket && hinreiseBucket"
        >🧳✈️ Koffer/Hinreise</button>
        <template x-for="category in categoryNames" :key="category">
          <button
            class="filter-chip"
            :class="isCategorySelected(category) ? 'filter-chip-active' : ''"
            @click="toggleCategoryFilter(category)"
            x-text="category"
          ></button>
        </template>
        <button
          class="filter-chip"
          :class="hideExcluded ? 'filter-chip-active' : ''"
          @click="toggleHideExcluded()"
          x-show="!isDatabase"
        >❌ Hide excluded</button>
        <button
          class="filter-chip"
          :class="sortMode === 'alpha' ? 'filter-chip-active' : ''"
          @click="toggleSortMode()"
        >🔤 Sort alphabetically</button>
        <button class="filter-chip filter-chip-reset" x-show="hasActiveFilters" @click="resetFilters()">Show all</button>
        <button class="btn-secondary header-action-tablet-only" @click="openAddItem()">+ Add item</button>
        <button class="btn-secondary header-action-tablet-only" x-show="isDatabase" @click="openAddCategory()">+ Add category</button>
        <button class="btn-secondary header-action-tablet-only" x-show="isDatabase" @click="openDeleteCategory()">Delete category</button>
      </div>

      <div class="item-list-card">
      <div class="item-list">
        <template x-for="item in filteredItems" :key="item.id">
          <div class="item-row" :class="isExcluded(item) ? 'item-row-excluded' : ''">
            <span class="item-icon-toggle" @click="toggleExcluded(item)" x-text="isExcluded(item) ? '❌' : item.icon"></span>
            <span class="item-title" @click="openQuantityModal(item)">
              <span x-text="item.name"></span>
              <span class="qty-badge" x-show="quantityFor(item) !== 1" x-text="'×' + quantityFor(item)"></span>
            </span>
            <span class="assigned-chips" @click="openBucketModal(item)">
              <template x-for="bucket in assignedBuckets(item)" :key="bucket.id">
                <span class="chip-mini" :title="bucket.name" x-text="bucket.icon"></span>
              </template>
              <span
                class="chip-mini chip-mini-empty"
                x-show="comboStateFor(item) && assignedBuckets(item).length === 0"
              >+</span>
              <span
                class="chip-mini chip-mini-combo"
                :class="comboStateFor(item) === 'beide' ? 'chip-mini-combo-beide' : ''"
                x-show="comboStateFor(item)"
                :title="comboStateFor(item) === 'koffer' ? 'Koffer' : comboStateFor(item) === 'hinreise' ? 'Hinreise' : 'Koffer & Hinreise'"
                @click.stop="toggleComboBucket(item)"
                x-text="comboStateFor(item) === 'koffer' ? kofferBucket?.icon : comboStateFor(item) === 'hinreise' ? hinreiseBucket?.icon : (kofferBucket?.icon + hinreiseBucket?.icon)"
              ></span>
              <span
                class="chip-mini chip-mini-empty"
                x-show="!comboStateFor(item) && assignedBuckets(item).length === 0"
              >+</span>
            </span>
          </div>
        </template>
      </div>
      </div>

      <div class="modal-overlay" x-show="addingItem" x-cloak @click.self="closeAddItem()">
        <div class="modal-sheet">
          <h3 x-text="isDatabase ? 'Add catalog item' : 'Add item to this checklist'"></h3>
          <input type="text" class="text-input" x-model="newItemIcon" placeholder="Icon" maxlength="4" />
          <input type="text" class="text-input" x-model="newItemName" placeholder="Item name" autofocus />
          <select class="text-input" x-model="newItemCategory">
            <template x-for="cat in categoryNames" :key="cat">
              <option :value="cat" x-text="cat"></option>
            </template>
            <option value="__new__">+ New category…</option>
          </select>
          <input
            type="text"
            class="text-input"
            x-show="newItemCategory === '__new__'"
            x-model="newItemNewCategory"
            placeholder="New category name"
          />
          <button @click="submitNewItem()">Add</button>
          <button class="btn-secondary" @click="closeAddItem()">Cancel</button>
        </div>
      </div>

      <div class="modal-overlay" x-show="categoryModalOpen" x-cloak @click.self="closeDeleteCategory()">
        <div class="modal-sheet">
          <h3>Delete category</h3>
          <div class="modal-subgroup">
            <p class="screen-placeholder" x-show="categoryNames.length === 0">No categories yet.</p>
            <template x-for="cat in categoryNames" :key="cat">
              <button @click="deleteCategoryByName(cat)" x-text="cat"></button>
            </template>
          </div>
          <button class="btn-secondary" @click="closeDeleteCategory()">Cancel</button>
        </div>
      </div>

      <div class="modal-overlay" x-show="quantityModal" x-cloak @click.self="closeQuantityModal()">
        <div class="modal-sheet modal-sheet-centered">
          <div class="qty-modal-header">
            <h3 x-text="quantityModal ? quantityModal.icon + ' ' + quantityModal.name : ''"></h3>
            <button class="modal-icon-btn" @click="openEditItem()" title="Edit item">✏️</button>
          </div>
          <span class="qty-stepper qty-stepper-modal">
            <button class="qty-btn" @click="changeQuantity(quantityModal, -1)">−</button>
            <span class="qty-value" x-text="quantityModal ? quantityFor(quantityModal) : ''"></span>
            <button class="qty-btn" @click="changeQuantity(quantityModal, 1)">+</button>
          </span>
          <button class="btn-secondary" @click="closeQuantityModal()">Done</button>
        </div>
      </div>

      <div class="modal-overlay" x-show="editItemModal" x-cloak @click.self="closeEditItem()">
        <div class="modal-sheet">
          <h3>Edit item</h3>
          <input type="text" class="text-input" x-model="editItemIcon" placeholder="Icon" maxlength="4" />
          <input type="text" class="text-input" x-model="editItemName" placeholder="Item name" />
          <select class="text-input" x-model="editItemCategory">
            <template x-for="cat in categoryNames" :key="cat">
              <option :value="cat" x-text="cat"></option>
            </template>
            <option value="__new__">+ New category…</option>
          </select>
          <input
            type="text"
            class="text-input"
            x-show="editItemCategory === '__new__'"
            x-model="editItemNewCategory"
            placeholder="New category name"
          />
          <button @click="submitEditItem()">Save</button>
          <button class="danger" @click="deleteEditItem()">Delete item</button>
          <button class="btn-secondary" @click="closeEditItem()">Cancel</button>
        </div>
      </div>

      <div class="modal-overlay" x-show="bucketModal" x-cloak @click.self="closeBucketModal()">
        <div class="modal-sheet">
          <h3 x-text="bucketModal ? bucketModal.icon + ' ' + bucketModal.name : ''"></h3>
          <template x-if="kofferBucket && hinreiseBucket">
            <button
              class="bucket-toggle-btn bucket-toggle-combo"
              :class="bucketModal && isComboSideActive(bucketModal) ? 'bucket-toggle-active' : ''"
              @click="toggleComboSelection(bucketModal)">
              <span x-text="bucketModal && entryFor(bucketModal.id)?.comboSide === 'hinreise' ? hinreiseBucket.icon : kofferBucket.icon"></span>
              <span>Koffer/Hinreise</span>
              <span class="bucket-toggle-check" x-show="bucketModal && isComboSideActive(bucketModal)">✓</span>
            </button>
          </template>
          <template x-for="bucket in buckets" :key="bucket.id">
            <button
              class="bucket-toggle-btn"
              :class="bucketModal && isAssigned(bucketModal, bucket.id) ? 'bucket-toggle-active' : ''"
              @click="toggleBucket(bucketModal, bucket.id)">
              <span x-text="bucket.icon"></span>
              <span x-text="bucket.name"></span>
              <span class="bucket-toggle-check" x-show="bucketModal && isAssigned(bucketModal, bucket.id)">✓</span>
            </button>
          </template>
          <button class="btn-secondary" @click="closeBucketModal()">Done</button>
        </div>
      </div>
    </div>
  `;
}
