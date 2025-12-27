# Birdex - Progressive Web App (PWA)

## 📱 Fonctionnalités PWA

Birdex est maintenant une Progressive Web App complète, installable sur Chrome et Brave (ainsi que d'autres navigateurs compatibles).

### ✨ Caractéristiques

- **Installation sur l'appareil** : Installez Birdex comme une application native
- **Mode hors-ligne** : Fonctionnalité de base disponible sans connexion internet
- **Mise en cache intelligente** : Chargement rapide et économie de données
- **Icône sur l'écran d'accueil** : Accès rapide comme une app native
- **Mode standalone** : Interface plein écran sans barre d'adresse

## 🚀 Installation

### Sur ordinateur (Chrome/Brave)

1. Ouvrez Birdex dans Chrome ou Brave
2. Cliquez sur l'icône d'installation (➕) dans la barre d'adresse
3. Cliquez sur "Installer"

Ou via le menu :
1. Menu (⋮) → "Installer Birdex..."
2. Confirmez l'installation

### Sur mobile (Android)

1. Ouvrez Birdex dans Chrome
2. Appuyez sur le menu (⋮)
3. Sélectionnez "Ajouter à l'écran d'accueil"
4. Confirmez l'ajout

### Sur iOS (Safari)

1. Ouvrez Birdex dans Safari
2. Appuyez sur le bouton Partager (□↑)
3. Faites défiler et sélectionnez "Sur l'écran d'accueil"
4. Appuyez sur "Ajouter"

## 🔧 Fonctionnalités techniques

### Service Worker

Le service worker (`/sw.js`) gère :

- **Mise en cache des ressources statiques** : HTML, CSS, JavaScript, icônes
- **Cache des API** : Données des oiseaux et découvertes
- **Stratégies de cache** :
  - **Network First** pour les API : Données fraîches quand connecté
  - **Cache First** pour les assets statiques : Chargement ultra-rapide
  - **Fallback** : Fonctionnalité dégradée hors-ligne

### Manifest Web App

Le manifest (`/manifest.json`) définit :

- Nom et description de l'application
- Icônes (8 tailles : 72px à 512px)
- Couleurs du thème (#ef4444)
- Mode d'affichage (standalone)
- Raccourcis vers les fonctions principales :
  - Liste des oiseaux
  - Nouvelle capture
  - Carte des observations

### Icônes PWA

Icônes générées dans `/static/icons/` :
- 72x72, 96x96, 128x128, 144x144
- 152x152, 192x192, 384x384, 512x512

Compatibles avec tous les appareils et résolutions.

## 📦 Structure des fichiers PWA

```
Birdex/
├── static/
│   ├── sw.js                    # Service Worker
│   ├── manifest.json            # Web App Manifest
│   └── icons/                   # Icônes PWA
│       ├── icon-72x72.png
│       ├── icon-96x96.png
│       ├── icon-128x128.png
│       ├── icon-144x144.png
│       ├── icon-152x152.png
│       ├── icon-192x192.png
│       ├── icon-384x384.png
│       └── icon-512x512.png
├── templates/
│   └── index.html               # Enregistrement du SW
└── app.py                       # Routes PWA
```

## 🔄 Mises à jour

Le service worker détecte automatiquement les nouvelles versions :

1. Une nouvelle version est téléchargée en arrière-plan
2. L'utilisateur est invité à rafraîchir
3. La mise à jour s'applique au rechargement

Pour forcer une mise à jour :
```javascript
// Dans la console du navigateur
navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => registration.update());
});
```

## 🧪 Test de la PWA

### Vérifier l'installation

1. Ouvrez les DevTools (F12)
2. Onglet "Application" (Chrome) ou "Storage" (Firefox)
3. Vérifiez :
   - ✅ Manifest présent et valide
   - ✅ Service Worker enregistré et actif
   - ✅ Cache Storage contient les ressources

### Lighthouse PWA Audit

1. DevTools → Onglet "Lighthouse"
2. Sélectionnez "Progressive Web App"
3. Cliquez sur "Generate report"
4. Score attendu : **90+/100**

## 🌐 Compatibilité navigateurs

| Navigateur | Support PWA | Installation | Hors-ligne |
|------------|-------------|--------------|------------|
| Chrome (Desktop) | ✅ Complet | ✅ | ✅ |
| Chrome (Android) | ✅ Complet | ✅ | ✅ |
| Brave (Desktop) | ✅ Complet | ✅ | ✅ |
| Brave (Mobile) | ✅ Complet | ✅ | ✅ |
| Edge | ✅ Complet | ✅ | ✅ |
| Safari (iOS) | ⚠️ Partiel | ✅ | ✅ |
| Firefox | ⚠️ Partiel | ❌ | ✅ |

## 🐛 Dépannage

### L'application ne s'installe pas

1. Vérifiez que vous utilisez HTTPS (ou localhost)
2. Vérifiez que le manifest est accessible : `/manifest.json`
3. Vérifiez que le service worker s'enregistre : Console → Pas d'erreur
4. Essayez de vider le cache et recharger

### Le cache ne fonctionne pas

1. Console → Vérifiez l'enregistrement du SW
2. Application → Service Workers → Vérifiez le statut
3. Application → Cache Storage → Vérifiez le contenu
4. Essayez "Update on reload" dans les DevTools

### Réinitialiser la PWA

```javascript
// Console du navigateur
navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(r => r.unregister());
});
caches.keys().then(keys => {
    keys.forEach(key => caches.delete(key));
});
location.reload();
```

## 📝 Notes de développement

- Les icônes sont générées automatiquement depuis `static/logo.png` via `generate_icons.py`
- Le cache est versionnée (`birdex-v1.0.0`) pour faciliter les mises à jour
- Les CDN (React, Tailwind, Leaflet) sont mis en cache pour le mode hors-ligne
- Le service worker ne met PAS en cache les requêtes POST/PUT/DELETE

## 🔮 Améliorations futures

- [ ] Notifications push pour les nouvelles observations
- [ ] Synchronisation en arrière-plan
- [ ] Partage natif via Web Share API
- [ ] Géolocalisation persistante
- [ ] Export/import des données
- [ ] Mode sombre système

## 📚 Ressources

- [PWA Documentation MDN](https://developer.mozilla.org/fr/docs/Web/Progressive_web_apps)
- [Service Worker API](https://developer.mozilla.org/fr/docs/Web/API/Service_Worker_API)
- [Web App Manifest](https://developer.mozilla.org/fr/docs/Web/Manifest)
- [Workbox (Google)](https://developers.google.com/web/tools/workbox)

---

**Birdex PWA** - Suivez vos découvertes ornithologiques, partout, tout le temps 🐦
