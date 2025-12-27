/**
 * Birdex Sync Manager
 * Gestion de la synchronisation online/offline
 */

class SyncManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.listeners = [];

    // Écouter les changements de connexion
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Initialiser IndexedDB
    this.initDB();
  }

  async initDB() {
    await window.BirdexDB.init();
  }

  /**
   * Abonner aux changements de statut
   */
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Notifier tous les listeners
   */
  notify(event) {
    this.listeners.forEach(listener => listener(event));
  }

  /**
   * Gestion du retour en ligne
   */
  async handleOnline() {
    console.log('📡 Connexion rétablie');
    this.isOnline = true;
    this.notify({ type: 'online' });

    // Déclencher la synchronisation
    await this.syncPendingData();
  }

  /**
   * Gestion de la perte de connexion
   */
  handleOffline() {
    console.log('📴 Connexion perdue');
    this.isOnline = false;
    this.notify({ type: 'offline' });
  }

  /**
   * Sauvegarde des découvertes (online ou offline)
   */
  async saveDiscoveries(discoveries) {
    if (this.isOnline) {
      // Mode online : sauvegarder sur le serveur ET en local
      try {
        const response = await fetch('/api/discoveries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(discoveries)
        });

        if (response.ok) {
          // Sauvegarder aussi en local comme cache
          await window.BirdexDB.saveDiscoveriesLocal(discoveries);
          console.log('✓ Découvertes sauvegardées (serveur + local)');
          this.notify({ type: 'saved', online: true });
          return { success: true, offline: false };
        } else {
          throw new Error('Erreur serveur');
        }
      } catch (error) {
        console.warn('⚠️ Erreur serveur, sauvegarde locale uniquement');
        return this.saveOffline(discoveries);
      }
    } else {
      // Mode offline : sauvegarder uniquement en local
      return this.saveOffline(discoveries);
    }
  }

  /**
   * Sauvegarde hors-ligne
   */
  async saveOffline(discoveries) {
    for (const [birdNumber, birdData] of Object.entries(discoveries)) {
      await window.BirdexDB.addToSyncQueue(birdNumber, birdData);
    }

    console.log('💾 Découvertes sauvegardées localement (mode hors-ligne)');
    this.notify({ type: 'saved', offline: true });

    // Enregistrer la tâche de synchronisation
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-discoveries');
        console.log('✓ Background Sync enregistré');
      } catch (error) {
        console.warn('⚠️ Background Sync non disponible:', error);
      }
    }

    return { success: true, offline: true };
  }

  /**
   * Récupère les découvertes (online ou offline)
   */
  async getDiscoveries() {
    if (this.isOnline) {
      try {
        const response = await fetch('/api/discoveries');
        if (response.ok) {
          const data = await response.json();
          // Sauvegarder en local pour le cache
          await window.BirdexDB.saveDiscoveriesLocal(data);
          return { data, source: 'server' };
        }
      } catch (error) {
        console.warn('⚠️ Erreur serveur, utilisation du cache local');
      }
    }

    // Fallback sur le cache local
    const localData = await window.BirdexDB.getDiscoveriesLocal();
    return { data: localData, source: 'local' };
  }

  /**
   * Synchronise les données en attente
   */
  async syncPendingData() {
    if (this.syncInProgress || !this.isOnline) {
      return;
    }

    this.syncInProgress = true;
    this.notify({ type: 'sync-start' });

    try {
      const pendingItems = await window.BirdexDB.getPendingSync();

      if (pendingItems.length === 0) {
        console.log('✓ Aucune donnée à synchroniser');
        this.syncInProgress = false;
        return;
      }

      console.log(`🔄 Synchronisation de ${pendingItems.length} élément(s)...`);

      // Regrouper par oiseau
      const discoveries = {};
      for (const item of pendingItems) {
        discoveries[item.bird_number] = item.data;
      }

      // Envoyer au serveur
      const response = await fetch('/api/discoveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discoveries)
      });

      if (response.ok) {
        // Marquer tous comme synchronisés
        for (const item of pendingItems) {
          await window.BirdexDB.markAsSynced(item.id, item.bird_number);
        }

        console.log('✓ Synchronisation réussie !');
        this.notify({ type: 'sync-success', count: pendingItems.length });
      } else {
        throw new Error('Erreur de synchronisation');
      }
    } catch (error) {
      console.error('✗ Erreur de synchronisation:', error);
      this.notify({ type: 'sync-error', error });
    } finally {
      this.syncInProgress = false;
      this.notify({ type: 'sync-end' });
    }
  }

  /**
   * Obtient le nombre d'éléments non synchronisés
   */
  async getUnsyncedCount() {
    return await window.BirdexDB.getUnsyncedCount();
  }

  /**
   * Vérifie le statut de la connexion
   */
  getStatus() {
    return {
      online: this.isOnline,
      syncing: this.syncInProgress
    };
  }
}

// Instance singleton
const syncManager = new SyncManager();

// Exporter pour utilisation dans l'app
if (typeof window !== 'undefined') {
  window.SyncManager = syncManager;
}
