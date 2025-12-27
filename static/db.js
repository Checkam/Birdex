/**
 * Birdex IndexedDB Manager
 * Gestion du stockage local pour le mode hors-ligne
 */

const DB_NAME = 'BirdexDB';
const DB_VERSION = 1;
const STORES = {
  DISCOVERIES: 'discoveries',
  SYNC_QUEUE: 'syncQueue'
};

class BirdexDB {
  constructor() {
    this.db = null;
  }

  /**
   * Initialise la base de données IndexedDB
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('✓ IndexedDB initialisée');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store pour les découvertes (cache local)
        if (!db.objectStoreNames.contains(STORES.DISCOVERIES)) {
          const discoveriesStore = db.createObjectStore(STORES.DISCOVERIES, {
            keyPath: 'bird_number'
          });
          discoveriesStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // Store pour la queue de synchronisation
        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, {
            keyPath: 'id',
            autoIncrement: true
          });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
          syncStore.createIndex('status', 'status', { unique: false });
        }

        console.log('✓ Structure IndexedDB créée');
      };
    });
  }

  /**
   * Sauvegarde les découvertes en local
   */
  async saveDiscoveriesLocal(discoveries) {
    if (!this.db) await this.init();

    const tx = this.db.transaction([STORES.DISCOVERIES], 'readwrite');
    const store = tx.objectStore(STORES.DISCOVERIES);

    for (const [birdNumber, birdData] of Object.entries(discoveries)) {
      const data = {
        bird_number: birdNumber,
        ...birdData,
        updated_at: Date.now(),
        synced: true
      };
      await store.put(data);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Récupère toutes les découvertes locales
   */
  async getDiscoveriesLocal() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORES.DISCOVERIES], 'readonly');
      const store = tx.objectStore(STORES.DISCOVERIES);
      const request = store.getAll();

      request.onsuccess = () => {
        const discoveries = {};
        request.result.forEach(item => {
          discoveries[item.bird_number] = item;
        });
        resolve(discoveries);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Ajoute une découverte à la queue de synchronisation
   */
  async addToSyncQueue(birdNumber, birdData) {
    if (!this.db) await this.init();

    const tx = this.db.transaction([STORES.SYNC_QUEUE, STORES.DISCOVERIES], 'readwrite');

    // Ajouter à la queue de sync
    const syncStore = tx.objectStore(STORES.SYNC_QUEUE);
    const syncData = {
      bird_number: birdNumber,
      data: birdData,
      timestamp: Date.now(),
      status: 'pending'
    };
    await syncStore.add(syncData);

    // Sauvegarder aussi dans les découvertes locales (marqué comme non-syncé)
    const discoveriesStore = tx.objectStore(STORES.DISCOVERIES);
    const localData = {
      bird_number: birdNumber,
      ...birdData,
      updated_at: Date.now(),
      synced: false
    };
    await discoveriesStore.put(localData);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log('✓ Ajouté à la queue de synchronisation:', birdNumber);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Récupère les items en attente de synchronisation
   */
  async getPendingSync() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORES.SYNC_QUEUE], 'readonly');
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      const index = store.index('status');
      const request = index.getAll('pending');

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Marque un item comme synchronisé
   */
  async markAsSynced(id, birdNumber) {
    if (!this.db) await this.init();

    const tx = this.db.transaction([STORES.SYNC_QUEUE, STORES.DISCOVERIES], 'readwrite');

    // Supprimer de la queue
    const syncStore = tx.objectStore(STORES.SYNC_QUEUE);
    await syncStore.delete(id);

    // Marquer comme syncé dans les découvertes
    const discoveriesStore = tx.objectStore(STORES.DISCOVERIES);
    const discovery = await discoveriesStore.get(birdNumber);
    if (discovery) {
      discovery.synced = true;
      await discoveriesStore.put(discovery);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log('✓ Marqué comme synchronisé:', birdNumber);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Compte les items non synchronisés
   */
  async getUnsyncedCount() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORES.SYNC_QUEUE], 'readonly');
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      const index = store.index('status');
      const request = index.count('pending');

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Vide toute la base de données
   */
  async clear() {
    if (!this.db) await this.init();

    const tx = this.db.transaction([STORES.DISCOVERIES, STORES.SYNC_QUEUE], 'readwrite');
    await tx.objectStore(STORES.DISCOVERIES).clear();
    await tx.objectStore(STORES.SYNC_QUEUE).clear();

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log('✓ IndexedDB vidée');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }
}

// Instance singleton
const birdexDB = new BirdexDB();

// Exporter pour utilisation dans l'app
if (typeof window !== 'undefined') {
  window.BirdexDB = birdexDB;
}
