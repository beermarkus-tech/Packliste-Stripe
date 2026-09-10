import Alpine from 'alpinejs';
import { navigateTo } from '../lib/router.js';
import { setCurrentItem } from '../lib/store.js';
import { watchDatabase, createDatabase } from '../data/database.js';
import {
  watchTrips,
  createBlankTrip,
  createTripFromDatabase,
  createTripFromTrip,
  duplicateTrip,
  renameTrip,
  deleteTrip,
} from '../data/trips.js';

const LONG_PRESS_MS = 500;

Alpine.data('home', () => ({
  database: null,
  trips: [],
  actionSheet: null, // { item }
  creating: false,
  pressTimer: null,

  init() {
    this._unsubDatabase = watchDatabase((db) => {
      this.database = db;
    });
    this._unsubTrips = watchTrips((list) => {
      this.trips = list;
    });
  },

  destroy() {
    this._unsubDatabase?.();
    this._unsubTrips?.();
  },

  startPress(item) {
    clearTimeout(this.pressTimer);
    this.pressTimer = setTimeout(() => {
      this.actionSheet = { item };
    }, LONG_PRESS_MS);
  },

  cancelPress() {
    clearTimeout(this.pressTimer);
  },

  openItem(type, id) {
    setCurrentItem({ type, id });
    navigateTo('prep');
  },

  openDatabase() {
    if (!this.database) return;
    this.openItem('template', this.database.id);
  },

  async bootstrapDatabase() {
    try {
      const id = await createDatabase();
      this.openItem('template', id);
    } catch (err) {
      alert(`Couldn't create database: ${err.message}`);
    }
  },

  closeActionSheet() {
    this.actionSheet = null;
  },

  async doOpen() {
    const { item } = this.actionSheet;
    this.closeActionSheet();
    this.openItem('trip', item.id);
  },

  async doDuplicate() {
    const { item } = this.actionSheet;
    this.closeActionSheet();
    try {
      await duplicateTrip(item.id);
    } catch (err) {
      alert(`Couldn't duplicate: ${err.message}`);
    }
  },

  async doRename() {
    const { item } = this.actionSheet;
    this.closeActionSheet();
    const name = prompt('New name', item.name);
    if (!name) return;
    try {
      await renameTrip(item.id, name);
    } catch (err) {
      alert(`Couldn't rename: ${err.message}`);
    }
  },

  async doDelete() {
    const { item } = this.actionSheet;
    this.closeActionSheet();
    if (!confirm(`Delete "${item.name}"? This can't be undone.`)) return;
    try {
      await deleteTrip(item.id);
    } catch (err) {
      alert(`Couldn't delete: ${err.message}`);
    }
  },

  openNewTrip() {
    this.creating = true;
  },

  closeCreating() {
    this.creating = false;
  },

  async createBlank() {
    const name = prompt('Name your new trip');
    if (!name) return;
    try {
      const id = await createBlankTrip({ name });
      this.closeCreating();
      this.openItem('trip', id);
    } catch (err) {
      alert(`Couldn't create trip: ${err.message}`);
    }
  },

  async createFromDatabase() {
    const name = prompt('Name this trip', this.database?.name || 'Trip');
    if (!name) return;
    try {
      const id = await createTripFromDatabase({ name });
      this.closeCreating();
      this.openItem('trip', id);
    } catch (err) {
      alert(`Couldn't create trip: ${err.message}`);
    }
  },

  async createFromExistingTrip(tripId, tripName) {
    const name = prompt('Name this trip', `${tripName} (Copy)`);
    if (!name) return;
    try {
      const id = await createTripFromTrip(tripId, { name });
      this.closeCreating();
      this.openItem('trip', id);
    } catch (err) {
      alert(`Couldn't create trip: ${err.message}`);
    }
  },
}));

export function renderHome(container) {
  container.innerHTML = `
    <div class="screen" data-screen="home" x-data="home">
      <h2>Home</h2>
      <div class="home-lists">
        <section class="home-list">
          <p class="screen-placeholder" x-show="!database">No database yet.</p>
          <ul class="card-list" x-show="database">
            <li class="card-item card-item-database" @click="openDatabase()">
              <span x-text="database?.name"></span>
            </li>
          </ul>
          <button class="btn-secondary" x-show="!database" @click="bootstrapDatabase()">+ Create database</button>
        </section>

        <section class="home-list">
          <div class="home-list-header">
            <h3>Trips</h3>
            <button class="btn-secondary" @click="openNewTrip()">+ New Trip</button>
          </div>
          <p class="screen-placeholder" x-show="trips.length === 0">No trips yet.</p>
          <ul class="card-list">
            <template x-for="trip in trips" :key="trip.id">
              <li class="card-item"
                  @click="openItem('trip', trip.id)"
                  @touchstart="startPress(trip)" @touchend="cancelPress()" @touchmove="cancelPress()"
                  @mousedown="startPress(trip)" @mouseup="cancelPress()" @mouseleave="cancelPress()"
                  @contextmenu.prevent>
                <span x-text="'✈️ ' + trip.name"></span>
                <span class="card-sub" x-show="trip.date" x-text="trip.date"></span>
              </li>
            </template>
          </ul>
        </section>
      </div>

      <div class="modal-overlay" x-show="actionSheet" x-cloak @click.self="closeActionSheet()">
        <div class="modal-sheet" x-show="actionSheet">
          <h3 x-text="actionSheet?.item?.name"></h3>
          <button @click="doOpen()">Open</button>
          <button @click="doDuplicate()">Duplicate</button>
          <button @click="doRename()">Rename</button>
          <button class="danger" @click="doDelete()">Delete</button>
          <button class="btn-secondary" @click="closeActionSheet()">Cancel</button>
        </div>
      </div>

      <div class="modal-overlay" x-show="creating" x-cloak @click.self="closeCreating()">
        <div class="modal-sheet" x-show="creating">
          <h3>New Trip</h3>
          <button @click="createBlank()">Start blank</button>
          <button x-show="database" @click="createFromDatabase()" x-text="'From: ' + database?.name"></button>

          <div class="modal-subgroup">
            <p class="screen-placeholder" x-show="trips.length === 0">No trips to copy from yet.</p>
            <template x-for="trip in trips" :key="trip.id">
              <button @click="createFromExistingTrip(trip.id, trip.name)" x-text="'Copy: ' + trip.name"></button>
            </template>
          </div>

          <button class="btn-secondary" @click="closeCreating()">Cancel</button>
        </div>
      </div>
    </div>
  `;
}
