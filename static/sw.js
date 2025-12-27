const CACHE_NAME = 'birdex-v1.1.0';
const RUNTIME_CACHE = 'birdex-runtime-v1.1.0';

// Ressources à mettre en cache lors de l'installation
const PRECACHE_URLS = [
  '/',
  '/static/app.js',
  '/static/logo.png',
  '/static/manifest.json',
  '/static/db.js',
  '/static/sync-manager.js',
  // CDN resources (cache these for offline support)
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Precaching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Stratégies de cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne pas mettre en cache les requêtes POST/PUT/DELETE
  if (request.method !== 'GET') {
    return;
  }

  // Stratégie pour les API calls
  if (url.pathname.startsWith('/api/')) {
    // Ne JAMAIS mettre en cache les données utilisateur (découvertes, photos, auth, etc.)
    // Ces données changent fréquemment et doivent toujours être à jour
    const noCache = [
      '/api/discoveries',
      '/api/photo',
      '/api/auth',
      '/api/theme',
      '/api/share',
      '/api/admin'
    ];

    const shouldBypassCache = noCache.some(path => url.pathname.startsWith(path));

    if (shouldBypassCache) {
      // Network Only - Ne pas utiliser le cache
      event.respondWith(fetch(request));
      return;
    }

    // Pour /api/birds (données statiques): Network First avec cache
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone la réponse car elle ne peut être consommée qu'une fois
          const responseClone = response.clone();

          // Met à jour le cache avec la nouvelle réponse
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });

          return response;
        })
        .catch(() => {
          // Si le réseau échoue, essaie de récupérer depuis le cache
          return caches.match(request);
        })
    );
    return;
  }

  // Stratégie pour les assets statiques et CDN: Cache First
  if (
    url.pathname.startsWith('/static/') ||
    url.origin.includes('unpkg.com') ||
    url.origin.includes('cdn.tailwindcss.com')
  ) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(request).then((response) => {
            // Ne cache que les réponses réussies
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }

            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });

            return response;
          });
        })
    );
    return;
  }

  // Stratégie par défaut pour les images d'oiseaux et autres: Cache First avec fallback réseau
  if (url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          return cachedResponse || fetch(request).then((response) => {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
            return response;
          });
        })
    );
    return;
  }

  // Pour toutes les autres requêtes: Network First avec fallback cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => {
          cache.put(request, responseClone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});

// Gestion des messages du client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

// Gestion de la synchronisation en arrière-plan
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Sync event:', event.tag);

  if (event.tag === 'sync-discoveries') {
    event.waitUntil(syncDiscoveries());
  }
});

/**
 * Synchronise les découvertes en attente avec le serveur
 */
async function syncDiscoveries() {
  try {
    console.log('[Service Worker] Démarrage de la synchronisation...');

    // Ouvrir IndexedDB
    const db = await openIndexedDB();
    const pendingItems = await getPendingFromDB(db);

    if (pendingItems.length === 0) {
      console.log('[Service Worker] Aucune donnée à synchroniser');
      return;
    }

    console.log(`[Service Worker] ${pendingItems.length} élément(s) à synchroniser`);

    // Regrouper les découvertes
    const discoveries = {};
    pendingItems.forEach(item => {
      discoveries[item.bird_number] = item.data;
    });

    // Envoyer au serveur
    const response = await fetch('/api/discoveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discoveries)
    });

    if (response.ok) {
      // Marquer comme synchronisé
      await markAsSyncedInDB(db, pendingItems);
      console.log('[Service Worker] ✓ Synchronisation réussie');

      // Notifier l'app
      await notifyClients({ type: 'sync-success', count: pendingItems.length });
    } else {
      throw new Error(`Erreur serveur: ${response.status}`);
    }
  } catch (error) {
    console.error('[Service Worker] ✗ Erreur de synchronisation:', error);
    await notifyClients({ type: 'sync-error', error: error.message });
    throw error; // Re-throw pour que le navigateur réessaie
  }
}

/**
 * Ouvre la base IndexedDB
 */
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('BirdexDB', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Récupère les items en attente
 */
function getPendingFromDB(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['syncQueue'], 'readonly');
    const store = tx.objectStore('syncQueue');
    const index = store.index('status');
    const request = index.getAll('pending');

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Marque les items comme synchronisés
 */
async function markAsSyncedInDB(db, items) {
  const tx = db.transaction(['syncQueue', 'discoveries'], 'readwrite');
  const syncStore = tx.objectStore('syncQueue');
  const discoveriesStore = tx.objectStore('discoveries');

  for (const item of items) {
    // Supprimer de la queue
    await syncStore.delete(item.id);

    // Marquer comme syncé dans les découvertes
    const discovery = await discoveriesStore.get(item.bird_number);
    if (discovery) {
      discovery.synced = true;
      await discoveriesStore.put(discovery);
    }
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Notifie tous les clients de l'app
 */
async function notifyClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(client => {
    client.postMessage(message);
  });
}

// Notification push (préparation pour futures fonctionnalités)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Nouvelle notification de Birdex',
    icon: '/static/icons/icon-192x192.png',
    badge: '/static/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  event.waitUntil(
    self.registration.showNotification('Birdex', options)
  );
});

// Gestion du click sur les notifications
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
