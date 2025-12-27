# 📱 Intégration du Mode Hors-ligne dans React

## Vue d'ensemble

Le système de mode hors-ligne est maintenant implémenté avec :
- **IndexedDB** pour le stockage local
- **Background Sync API** pour la synchronisation automatique
- **SyncManager** pour gérer les opérations online/offline

## 🔧 Utilisation dans l'app React

### 1. Remplacer les appels API directs

**Avant :**
```javascript
// Sauvegarde directe
const response = await fetch('/api/discoveries', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(discoveries)
});
```

**Après :**
```javascript
// Sauvegarde avec gestion hors-ligne
const result = await window.SyncManager.saveDiscoveries(discoveries);

if (result.offline) {
  console.log('💾 Sauvegardé localement, sera synchronisé au retour en ligne');
} else {
  console.log('✓ Sauvegardé sur le serveur');
}
```

### 2. Récupérer les découvertes

**Avant :**
```javascript
const response = await fetch('/api/discoveries');
const data = await response.json();
```

**Après :**
```javascript
const { data, source } = await window.SyncManager.getDiscoveries();

if (source === 'local') {
  console.log('📴 Données depuis le cache local (mode hors-ligne)');
} else {
  console.log('📡 Données depuis le serveur');
}
```

### 3. Ajouter un indicateur de statut

Ajoutez ce hook React dans votre composant principal :

```jsx
function useOnlineStatus() {
  const [status, setStatus] = React.useState({
    online: navigator.onLine,
    syncing: false,
    unsyncedCount: 0
  });

  React.useEffect(() => {
    // Écouter les changements de statut
    const unsubscribe = window.SyncManager.subscribe((event) => {
      if (event.type === 'online') {
        setStatus(prev => ({ ...prev, online: true }));
      }
      if (event.type === 'offline') {
        setStatus(prev => ({ ...prev, online: false }));
      }
      if (event.type === 'sync-start') {
        setStatus(prev => ({ ...prev, syncing: true }));
      }
      if (event.type === 'sync-end') {
        setStatus(prev => ({ ...prev, syncing: false }));
        updateUnsyncedCount();
      }
    });

    // Écouter les événements du Service Worker
    const handleSyncSuccess = () => {
      console.log('✓ Synchronisation terminée');
      updateUnsyncedCount();
    };

    window.addEventListener('sync-success', handleSyncSuccess);

    // Compte initial
    updateUnsyncedCount();

    async function updateUnsyncedCount() {
      const count = await window.SyncManager.getUnsyncedCount();
      setStatus(prev => ({ ...prev, unsyncedCount: count }));
    }

    return () => {
      unsubscribe();
      window.removeEventListener('sync-success', handleSyncSuccess);
    };
  }, []);

  return status;
}
```

### 4. Composant d'indicateur de statut

```jsx
function OnlineStatusIndicator() {
  const status = useOnlineStatus();

  return (
    <div className="fixed top-4 right-4 z-50">
      {!status.online && (
        <div className="bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>Mode hors-ligne</span>
          {status.unsyncedCount > 0 && (
            <span className="bg-white text-yellow-500 px-2 py-1 rounded-full text-xs font-bold">
              {status.unsyncedCount}
            </span>
          )}
        </div>
      )}

      {status.syncing && (
        <div className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 mt-2">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Synchronisation...</span>
        </div>
      )}
    </div>
  );
}
```

### 5. Intégration dans le composant principal

Dans votre composant `BirdPokedex` (static/app.js), ajoutez :

```jsx
function BirdPokedex() {
  // ... code existant ...

  // Ajouter le hook
  const onlineStatus = useOnlineStatus();

  // Modifier la fonction saveDiscoveries
  const saveDiscoveries = async () => {
    try {
      // Utiliser SyncManager au lieu de fetch direct
      const result = await window.SyncManager.saveDiscoveries(discoveries);

      if (result.offline) {
        // Afficher un message à l'utilisateur
        alert('💾 Sauvegardé localement. Les données seront synchronisées au retour en ligne.');
      } else {
        alert('✓ Sauvegardé avec succès !');
      }
    } catch (error) {
      console.error('Erreur de sauvegarde:', error);
      alert('❌ Erreur lors de la sauvegarde');
    }
  };

  // Modifier loadDiscoveries
  const loadDiscoveries = async () => {
    try {
      const { data, source } = await window.SyncManager.getDiscoveries();
      setDiscoveries(data);

      if (source === 'local') {
        console.log('📴 Données chargées depuis le cache local');
      }
    } catch (error) {
      console.error('Erreur de chargement:', error);
    }
  };

  return (
    <div>
      {/* Ajouter l'indicateur de statut */}
      <OnlineStatusIndicator />

      {/* Reste de votre app */}
      {/* ... */}
    </div>
  );
}
```

## 🧪 Test du mode hors-ligne

### 1. Via Chrome DevTools

1. Ouvrez DevTools (F12)
2. Onglet **Network**
3. Sélectionnez **"Offline"** dans le dropdown
4. Essayez d'ajouter une capture
5. Vérifiez qu'elle est sauvegardée localement
6. Remettez en ligne
7. La synchronisation devrait se déclencher automatiquement

### 2. Vérifier IndexedDB

1. DevTools → **Application**
2. **IndexedDB** → **BirdexDB**
3. Vérifiez les stores :
   - `discoveries` : Vos découvertes en cache
   - `syncQueue` : Items en attente de synchronisation

### 3. Tester Background Sync

```javascript
// Dans la console
const reg = await navigator.serviceWorker.ready;
await reg.sync.register('sync-discoveries');
// Vérifiez les logs de synchronisation
```

## 📊 Flux de données

```
┌─────────────────────────────────────────────────┐
│             Mode ONLINE                         │
├─────────────────────────────────────────────────┤
│  Capture → SyncManager                          │
│           ↓                                      │
│      Serveur (POST)                              │
│           ↓                                      │
│      IndexedDB (cache)                          │
│           ↓                                      │
│      ✓ Succès                                   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│             Mode OFFLINE                        │
├─────────────────────────────────────────────────┤
│  Capture → SyncManager                          │
│           ↓                                      │
│      IndexedDB (syncQueue)                      │
│           ↓                                      │
│      Background Sync enregistré                 │
│           ↓                                      │
│      ⏳ En attente de connexion                 │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│          RETOUR EN LIGNE                        │
├─────────────────────────────────────────────────┤
│  Connexion détectée                             │
│           ↓                                      │
│  Background Sync déclenché                      │
│           ↓                                      │
│  Service Worker → Serveur                       │
│           ↓                                      │
│  Marquer comme syncé                            │
│           ↓                                      │
│  Notifier l'app                                 │
│           ↓                                      │
│  ✓ Synchronisation terminée                    │
└─────────────────────────────────────────────────┘
```

## 🐛 Dépannage

### Vider le cache local

```javascript
// Dans la console
await window.BirdexDB.clear();
console.log('Cache local vidé');
```

### Forcer une synchronisation

```javascript
await window.SyncManager.syncPendingData();
```

### Vérifier le statut

```javascript
const status = window.SyncManager.getStatus();
console.log(status); // { online: true, syncing: false }

const count = await window.SyncManager.getUnsyncedCount();
console.log(`${count} élément(s) non synchronisé(s)`);
```

## ⚠️ Limitations

1. **Background Sync** n'est pas supporté par tous les navigateurs (Safari notamment)
2. Les photos en base64 peuvent être volumineuses dans IndexedDB
3. Pas de résolution de conflits automatique (last-write-wins)
4. Quota IndexedDB limité par navigateur (~50MB minimum)

## 🚀 Prochaines améliorations

- [ ] Compression des images avant stockage local
- [ ] Résolution intelligente des conflits
- [ ] Indicateur de progression de synchronisation
- [ ] Export/import des données hors-ligne
- [ ] Cache des images d'oiseaux (static/oiseau.json)

---

**Note :** Le système est maintenant prêt. Il suffit d'intégrer les appels à `window.SyncManager` dans votre app React pour profiter du mode hors-ligne complet ! 🎉
