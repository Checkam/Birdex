const CACHE_NAME = 'birdex-v1.0.5';
const RUNTIME_CACHE = 'birdex-runtime-v1.0.5';

// Ressources à mettre en cache lors de l'installation
const PRECACHE_URLS = [
  '/',
  '/static/app.js',
  '/static/logo.png',
  '/static/manifest.json',
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

  // Laisser passer les requêtes POST/PUT/DELETE sans intervention du Service Worker
  // IMPORTANT: On clone la requête complète pour préserver le body et les credentials
  if (request.method !== 'GET') {
    event.respondWith(
      fetch(request.clone(), {
        credentials: 'same-origin'
      }).catch(error => {
        console.error('[SW] Erreur fetch POST:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Stratégie pour les API calls dynamiques (découvertes, auth, etc.): Network Only
  // On ne met PAS en cache ces endpoints pour toujours avoir les données à jour
  if (url.pathname.startsWith('/api/discoveries') ||
      url.pathname.startsWith('/api/auth') ||
      url.pathname.startsWith('/api/theme') ||
      url.pathname.startsWith('/api/share')) {
    event.respondWith(fetch(request));
    return;
  }

  // Stratégie pour les autres API calls (ex: /api/birds): Cache First avec Network Fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(request).then((response) => {
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

// Gestion de la synchronisation en arrière-plan (si supporté)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-discoveries') {
    event.waitUntil(
      // Ici on pourrait synchroniser les découvertes en attente
      console.log('[Service Worker] Background sync triggered')
    );
  }
});

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
