// Use React UMD globals (React and ReactDOM are loaded via script tags in index.html)
const { useState, useEffect, useRef, useMemo, useCallback, memo } = React;

// Minimal icon components to avoid needing lucide-react in the browser build
const Camera = (props) => <span {...props}>📷</span>;
const Search = (props) => <span {...props}>🔍</span>;
const MapPin = (props) => <span {...props}>📍</span>;
const BarChart3 = (props) => <span {...props}>📊</span>;
const ChevronLeft = (props) => <span {...props}>◀</span>;
const X = (props) => <span {...props}>✖</span>;
const MapIcon = (props) => <span {...props}>🗺️</span>;
const User = (props) => <span {...props}>👤</span>;
const LogOut = (props) => <span {...props}>🚪</span>;

// Composant d'image optimisée avec lazy loading
const LazyImage = memo(({ src, alt, className, onClick, placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"%3E%3Crect fill="%23e5e7eb" width="400" height="300"/%3E%3C/svg%3E' }) => {
  const [imageSrc, setImageSrc] = useState(placeholder);
  const [isLoading, setIsLoading] = useState(true);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // Charger 50px avant que l'image soit visible
      }
    );

    observer.observe(imgRef.current);

    return () => {
      if (imgRef.current) {
        observer.unobserve(imgRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isInView && src) {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        setImageSrc(src);
        setIsLoading(false);
      };
      img.onerror = () => {
        setIsLoading(false);
      };
    }
  }, [isInView, src]);

  return (
    <div ref={imgRef} className={`relative ${className}`} onClick={onClick}>
      <img
        src={imageSrc}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${isLoading ? 'opacity-50' : 'opacity-100'}`}
        loading="lazy"
      />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      )}
    </div>
  );
});

// Composant Map avec Leaflet (optimisé)
const LeafletMap = ({ observations, onMarkerClick }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Délai pour lazy load de la carte
    const timer = setTimeout(() => {
      setMapReady(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current || !mapReady) return;

    // Calculer le centre
    let centerLat = 46.603354; // Centre de la France
    let centerLng = 1.888334;

    if (observations.length > 0) {
      const avgLat = observations.reduce((sum, obs) => sum + obs.photo.coordinates.lat, 0) / observations.length;
      const avgLng = observations.reduce((sum, obs) => sum + obs.photo.coordinates.lng, 0) / observations.length;
      centerLat = avgLat;
      centerLng = avgLng;
    }

    // Créer la carte
    const map = L.map(mapRef.current).setView([centerLat, centerLng], observations.length > 0 ? 10 : 6);

    // Ajouter la couche de tuiles OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    // Ajouter les marqueurs
    observations.forEach((obs, idx) => {
      const marker = L.marker([obs.photo.coordinates.lat, obs.photo.coordinates.lng])
        .addTo(map)
        .bindPopup(`
          <b>${obs.bird.nom_francais}</b><br/>
          ${obs.photo.date}<br/>
          ${obs.photo.location || 'Localisation inconnue'}
        `);

      if (onMarkerClick) {
        marker.on('click', () => onMarkerClick(obs));
      }
    });

    // Ajuster la vue pour inclure tous les marqueurs
    if (observations.length > 1) {
      const bounds = L.latLngBounds(observations.map(obs => [obs.photo.coordinates.lat, obs.photo.coordinates.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [observations, onMarkerClick, mapReady]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '300px' }} />;
};

// Composant de sélection de point GPS sur carte
const MapPicker = ({ initialCoords, onLocationSelect, onClose }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const [selectedCoords, setSelectedCoords] = useState(initialCoords);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const startLat = initialCoords?.lat || 46.603354;
    const startLng = initialCoords?.lng || 1.888334;

    // Créer la carte
    const map = L.map(mapRef.current).setView([startLat, startLng], 13);

    // Ajouter la couche de tuiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    // Ajouter un marqueur initial si des coordonnées existent
    if (initialCoords) {
      markerRef.current = L.marker([initialCoords.lat, initialCoords.lng], {
        draggable: true
      }).addTo(map);

      markerRef.current.on('dragend', (e) => {
        const position = e.target.getLatLng();
        setSelectedCoords({ lat: position.lat, lng: position.lng });
      });
    }

    // Clic sur la carte pour placer/déplacer le marqueur
    map.on('click', (e) => {
      if (markerRef.current) {
        markerRef.current.setLatLng(e.latlng);
      } else {
        markerRef.current = L.marker(e.latlng, {
          draggable: true
        }).addTo(map);

        markerRef.current.on('dragend', (evt) => {
          const position = evt.target.getLatLng();
          setSelectedCoords({ lat: position.lat, lng: position.lng });
        });
      }
      setSelectedCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, [initialCoords]);

  const handleConfirm = () => {
    if (selectedCoords) {
      onLocationSelect(selectedCoords);
    }
    onClose();
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`);
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error('Erreur de recherche:', error);
      alert('Erreur lors de la recherche de lieu');
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], 13);

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng], {
          draggable: true
        }).addTo(mapInstanceRef.current);

        markerRef.current.on('dragend', (e) => {
          const position = e.target.getLatLng();
          setSelectedCoords({ lat: position.lat, lng: position.lng });
        });
      }

      setSelectedCoords({ lat, lng });
      setSearchResults([]);
      setSearchQuery('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-red-600 text-white p-3 sm:p-4 flex items-center justify-between flex-shrink-0">
          <h3 className="text-base sm:text-lg font-bold">Sélectionner un point GPS</h3>
          <button onClick={onClose} className="text-white hover:text-red-200">
            <X size={24} />
          </button>
        </div>

        <div className="p-3 sm:p-4 bg-blue-50 flex-shrink-0">
          <p className="text-xs sm:text-sm text-gray-700 mb-2">
            📍 Cliquez sur la carte pour placer un marqueur ou déplacez-le
          </p>

          {/* Barre de recherche */}
          <form onSubmit={handleSearch} className="relative mb-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un lieu (ville, adresse...)"
              className="w-full p-2 pr-20 border-2 border-blue-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="absolute right-1 top-1 bg-blue-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isSearching ? '...' : '🔍'}
            </button>
          </form>

          {/* Résultats de recherche */}
          {searchResults.length > 0 && (
            <div className="bg-white border-2 border-blue-300 rounded-lg max-h-32 overflow-y-auto mb-2">
              {searchResults.map((result, idx) => (
                <button
                  key={idx}
                  onClick={() => selectSearchResult(result)}
                  className="w-full text-left p-2 text-xs hover:bg-blue-100 border-b border-gray-200 last:border-b-0"
                >
                  <div className="font-semibold">{result.display_name}</div>
                </button>
              ))}
            </div>
          )}

          {selectedCoords && (
            <p className="text-xs text-gray-600">
              Coordonnées: {selectedCoords.lat.toFixed(6)}, {selectedCoords.lng.toFixed(6)}
            </p>
          )}
        </div>

        <div ref={mapRef} className="flex-1 min-h-0" style={{ minHeight: '200px' }} />

        <div className="p-3 sm:p-4 flex gap-2 border-t flex-shrink-0 bg-white">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-300 text-gray-700 py-2 sm:py-3 rounded-lg font-bold hover:bg-gray-400 transition text-sm sm:text-base"
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedCoords}
            className="flex-1 bg-green-500 text-white py-2 sm:py-3 rounded-lg font-bold hover:bg-green-600 transition disabled:bg-gray-300 disabled:cursor-not-allowed text-sm sm:text-base"
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
};

// Thèmes disponibles
const themes = {
  pokemon: {
    name: 'Pokémon',
    bg: 'bg-red-600',
    bgHeader: 'bg-red-700',
    bgNav: 'bg-red-500',
    btnPrimary: 'bg-red-500 hover:bg-red-600 text-white',
    btnSecondary: 'bg-white text-red-600 hover:bg-red-100',
    btnSuccess: 'bg-green-500 hover:bg-green-600 text-white',
    btnDanger: 'bg-red-500 hover:bg-red-600 text-white',
    text: 'text-white',
    textSecondary: 'text-red-200',
    gradient: 'bg-gradient-to-r from-red-500 to-red-600',
    border: 'border-gray-300',
    card: 'bg-white',
    accent: 'text-yellow-300'
  },
  dark: {
    name: 'Dark',
    bg: 'bg-gradient-to-br from-slate-700 via-slate-800 to-gray-800',
    bgHeader: 'bg-gradient-to-r from-slate-700 to-slate-800',
    bgNav: 'bg-slate-700',
    btnPrimary: 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-md',
    btnSecondary: 'bg-slate-600 text-slate-100 hover:bg-slate-500 border border-slate-500',
    btnSuccess: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md',
    btnDanger: 'bg-rose-500 hover:bg-rose-600 text-white shadow-md',
    text: 'text-slate-100',
    textSecondary: 'text-slate-300',
    gradient: 'bg-gradient-to-r from-indigo-700 to-purple-700',
    border: 'border-slate-600',
    card: 'bg-slate-700 shadow-lg',
    accent: 'text-indigo-300'
  },
  white: {
    name: 'Light',
    bg: 'bg-gradient-to-br from-amber-50 via-stone-100 to-yellow-50',
    bgHeader: 'bg-gradient-to-r from-amber-600 to-yellow-600',
    bgNav: 'bg-amber-50 shadow-sm',
    btnPrimary: 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white shadow-md',
    btnSecondary: 'bg-white text-amber-700 hover:bg-amber-50 border-2 border-amber-200',
    btnSuccess: 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-md',
    btnDanger: 'bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white shadow-md',
    text: 'text-white',
    textSecondary: 'text-amber-100',
    gradient: 'bg-gradient-to-r from-amber-600 to-yellow-600',
    border: 'border-amber-200',
    card: 'bg-white shadow-lg',
    accent: 'text-amber-600'
  }
};

const BirdPokedex = () => {
  const [birds, setBirds] = useState([]);
  const [discoveries, setDiscoveries] = useState({});
  const [view, setView] = useState('list'); // 'list', 'stats', 'detail', 'capture', 'map', 'auth', 'edit', 'share', 'admin'
  const [selectedBird, setSelectedBird] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' ou 'register'
  const [authError, setAuthError] = useState('');
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [editPhotoIndex, setEditPhotoIndex] = useState(null); // Index de la photo en cours d'édition
  const [theme, setTheme] = useState('dark');
  const [showPassword, setShowPassword] = useState(false); // Pour afficher/masquer le mot de passe
  const [shareToken, setShareToken] = useState(null); // Token de partage
  const [showMap, setShowMap] = useState(true); // Afficher la carte sur le profil public
  const [adminStats, setAdminStats] = useState(null); // Statistiques admin
  const [adminMessages, setAdminMessages] = useState(null); // Messages admin
  const [geoFilter, setGeoFilter] = useState({ country: '', region: '' }); // Filtres géographiques
  const [geoDisplayMode, setGeoDisplayMode] = useState('all'); // 'all', 'country', 'region'
  const [imageViewer, setImageViewer] = useState(null); // { src: string, title: string } ou null
  const [galleryPage, setGalleryPage] = useState(1); // Pagination de la galerie
  const PHOTOS_PER_PAGE = 12; // Nombre de photos par page
  const [debugLogs, setDebugLogs] = useState([]); // Logs pour admin
  const [settings, setSettings] = useState({
    numberingMode: 'alphabetical', // 'alphabetical' ou 'regional'
    defaultCountry: '',
    defaultRegion: ''
  });
  const [showDropdownMenu, setShowDropdownMenu] = useState(false); // Menu déroulant pour Partage, Settings, Admin
  const [captureData, setCaptureData] = useState({
    photo: null,
    photoPreview: null,
    date: new Date().toISOString().split('T')[0],
    location: '',
    coordinates: null,
    sex: '',
    note: ''
  });

  // Vérifier la session utilisateur au chargement
  useEffect(() => {
    checkUserSession();
  }, []);

  // Charger les données des oiseaux
  useEffect(() => {
    fetch('static/oiseau.json')
      .catch(() => {
        // Fallback: utiliser les données du document uploadé
        return {
          json: () => Promise.resolve([
            {"nom_francais": "Accenteur à gorge noire", "nom_scientifique": "Prunella atrogularis"},
            {"nom_francais": "Accenteur alpin", "nom_scientifique": "Prunella collaris"},
            {"nom_francais": "Accenteur mouchet", "nom_scientifique": "Prunella modularis"},
            {"nom_francais": "Agrobate roux", "nom_scientifique": "Cercotrichas galactotes"},
            {"nom_francais": "Aigle botté", "nom_scientifique": "Hieraaetus pennatus"},
            {"nom_francais": "Aigle criard", "nom_scientifique": "Clanga clanga"},
            {"nom_francais": "Aigle de Bonelli", "nom_scientifique": "Aquila fasciata"},
            {"nom_francais": "Aigle royal", "nom_scientifique": "Aquila chrysaetos"},
            {"nom_francais": "Aigrette garzette", "nom_scientifique": "Egretta garzetta"},
            {"nom_francais": "Alouette des champs", "nom_scientifique": "Alauda arvensis"}
          ])
        };
      })
      .then(res => res.json())
      .then(data => {
        // Fonction pour déterminer la priorité de région
        const getRegionPriority = (bird) => {
          const regions = bird.regions || [];
          if (regions.includes('France')) return 1;
          if (regions.includes('Europe')) return 2;
          if (regions.includes('Afrique')) return 3;
          if (regions.includes('Asie')) return 4;
          if (regions.includes('Proche-Orient')) return 5;
          if (regions.includes('Amérique du Nord')) return 6;
          if (regions.includes('Océanie')) return 7;
          return 8; // Autres régions
        };

        // Fonction pour obtenir le nom de la région principale
        const getRegionName = (bird) => {
          const regions = bird.regions || [];
          if (regions.includes('France')) return 'France';
          if (regions.includes('Europe')) return 'Europe';
          if (regions.includes('Afrique')) return 'Afrique';
          if (regions.includes('Asie')) return 'Asie';
          if (regions.includes('Proche-Orient')) return 'Proche-Orient';
          if (regions.includes('Amérique du Nord')) return 'Amérique du Nord';
          if (regions.includes('Océanie')) return 'Océanie';
          return 'Autres';
        };

        const sortedBirds = data
          .filter(b => b.nom_francais && b.nom_scientifique)
          .sort((a, b) => {
            // Trier d'abord par région
            const regionDiff = getRegionPriority(a) - getRegionPriority(b);
            if (regionDiff !== 0) return regionDiff;
            // Puis par ordre alphabétique dans chaque région
            return a.nom_francais.localeCompare(b.nom_francais);
          })
          .map((bird, idx) => ({
            ...bird,
            number: String(idx + 1).padStart(3, '0'),
            regionName: getRegionName(bird)
          }));
        setBirds(sortedBirds);
      });
  }, []);

  // Charger les découvertes quand l'utilisateur change
  useEffect(() => {
    if (user) {
      loadDiscoveries();
    }
  }, [user]);

  // Charger le token de partage quand on accède à la vue share
  useEffect(() => {
    if (view === 'share' && user) {
      loadShareToken();
    }
  }, [view, user]);

  // Charger les stats admin quand on accède à la vue admin
  useEffect(() => {
    if (view === 'admin' && user?.is_admin) {
      loadAdminStats();
      loadAdminMessages();
    }
  }, [view, user]);

  // Gérer la pagination de la galerie
  useEffect(() => {
    // Réinitialiser la page à 1 quand on change de filtre
    if (view === 'gallery') {
      setGalleryPage(1);
    }
  }, [geoFilter.country, geoFilter.region, view]);

  const loadShareToken = async () => {
    try {
      const response = await fetch('/api/share/token', { credentials: 'same-origin' });
      const data = await response.json();
      setShareToken(data.share_token);
      setShowMap(data.show_map !== 0); // Convertir en boolean
    } catch (error) {
      console.error('Erreur chargement token:', error);
    }
  };

  const loadAdminStats = async () => {
    try {
      const response = await fetch('/api/admin/stats', { credentials: 'same-origin' });
      const data = await response.json();
      setAdminStats(data);
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    }
  };

  const loadAdminMessages = async () => {
    try {
      const response = await fetch('/api/messages/list', { credentials: 'same-origin' });
      const data = await response.json();
      setAdminMessages(data);
    } catch (error) {
      console.error('Erreur chargement messages:', error);
    }
  };

  const checkUserSession = async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
      const data = await response.json();
      if (data.logged_in) {
        setUser(data);
        setTheme(data.theme || 'pokemon');
      } else {
        setView('auth');
      }
    } catch (error) {
      console.error('Erreur de vérification session:', error);
      setView('auth');
    }
  };

  const updateTheme = async (newTheme) => {
    try {
      await fetch('/api/theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify({ theme: newTheme })
      });
      setTheme(newTheme);
    } catch (error) {
      console.error('Erreur de mise à jour du thème:', error);
    }
  };

  const loadDiscoveries = async () => {
    try {
      const response = await fetch('/api/discoveries/light', { credentials: 'same-origin' });
      if (response.ok) {
        const data = await response.json();
        setDiscoveries(data);
      }
    } catch (error) {
      console.error('Erreur de chargement:', error);
    }
  };

  const addDebugLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev.slice(-19), { timestamp, message, type }]);
    console.log(message);
  };

  const compressImage = (base64Image, maxWidth = 800, quality = 0.7) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = base64Image;
    });
  };

  const saveDiscoveries = async (newDiscoveries) => {
    addDebugLog(`💾 Compression des images...`);

    // Compresser toutes les images avant envoi
    const compressed = {};
    for (const [birdNum, birdData] of Object.entries(newDiscoveries)) {
      compressed[birdNum] = { ...birdData };

      if (birdData.photos && Array.isArray(birdData.photos)) {
        compressed[birdNum].photos = await Promise.all(
          birdData.photos.map(async (photo) => {
            if (photo.photo && photo.photo.startsWith('data:image')) {
              const compressedPhoto = await compressImage(photo.photo);
              return { ...photo, photo: compressedPhoto };
            }
            return photo;
          })
        );
      }
    }

    const dataStr = JSON.stringify(compressed);
    const sizeKB = (dataStr.length / 1024).toFixed(2);

    addDebugLog(`→ Taille: ${sizeKB} KB`);

    try {
      addDebugLog('→ Envoi fetch...');
      const response = await fetch('/api/discoveries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'same-origin',
        body: dataStr
      });

      addDebugLog(`→ Réponse: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorData = await response.json().catch(e => {
          addDebugLog(`❌ Impossible de lire JSON: ${e.message}`, 'error');
          return { error: 'Erreur inconnue' };
        });
        addDebugLog(`❌ ERREUR: ${errorData.error}`, 'error');
        alert(`❌ Erreur ${response.status}: ${errorData.error}`);
        return;
      }

      addDebugLog('✅ Sauvegarde réussie');
    } catch (error) {
      addDebugLog(`❌ ${error.name}: ${error.message}`, 'error');
      addDebugLog(`Stack: ${error.stack}`, 'error');
      alert(`❌ ${error.name}: ${error.message}`);
    }
  };

  const reverseGeocode = async (lat, lng) => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
      const data = await response.json();

      return {
        country: data.address?.country || 'Inconnu',
        region: data.address?.state || data.address?.region || data.address?.province || 'Inconnu',
        city: data.address?.city || data.address?.town || data.address?.village || ''
      };
    } catch (error) {
      console.error('Erreur géocodage inversé:', error);
      return { country: 'Inconnu', region: 'Inconnu', city: '' };
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    const formData = new FormData(e.target);
    const username = formData.get('username');
    const password = formData.get('password');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      if (response.ok) {
        setUser(data);
        // Charger le thème de l'utilisateur
        const userResponse = await fetch('/api/auth/me', { credentials: 'same-origin' });
        const userData = await userResponse.json();
        setTheme(userData.theme || 'pokemon');
        setView('list');
      } else {
        setAuthError(data.error);
      }
    } catch (error) {
      setAuthError('Erreur de connexion');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    const formData = new FormData(e.target);
    const username = formData.get('username');
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');

    if (password !== confirmPassword) {
      setAuthError('Les mots de passe ne correspondent pas');
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      if (response.ok) {
        setUser(data);
        // Charger le thème de l'utilisateur
        const userResponse = await fetch('/api/auth/me', { credentials: 'same-origin' });
        const userData = await userResponse.json();
        setTheme(userData.theme || 'pokemon');
        setView('list');
      } else {
        setAuthError(data.error);
      }
    } catch (error) {
      setAuthError('Erreur d\'inscription');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      setUser(null);
      setDiscoveries({});
      setView('auth');
    } catch (error) {
      console.error('Erreur de déconnexion:', error);
    }
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCaptureData({
          ...captureData,
          photo: file,
          photoPreview: reader.result
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCapture = async () => {
    if (!selectedBird || !captureData.photoPreview) return;

    let geoData = { country: '', region: '', city: '' };

    // Si des coordonnées GPS sont présentes, faire le géocodage inversé
    if (captureData.coordinates) {
      geoData = await reverseGeocode(captureData.coordinates.lat, captureData.coordinates.lng);
    }

    const newDiscoveries = {
      ...discoveries,
      [selectedBird.number]: {
        ...discoveries[selectedBird.number],
        description: discoveries[selectedBird.number]?.description || '',
        photos: [
          ...(discoveries[selectedBird.number]?.photos || []),
          {
            date: captureData.date,
            location: captureData.location,
            coordinates: captureData.coordinates,
            country: geoData.country,
            region: geoData.region,
            city: geoData.city,
            photo: captureData.photoPreview,
            sex: captureData.sex,
            note: captureData.note
          }
        ]
      }
    };

    setDiscoveries(newDiscoveries);
    saveDiscoveries(newDiscoveries);

    setCaptureData({
      photo: null,
      photoPreview: null,
      date: new Date().toISOString().split('T')[0],
      location: '',
      coordinates: null,
      sex: '',
      note: ''
    });
    setView('detail');
  };

  const handleEditSave = async () => {
    if (!selectedBird || !captureData.photoPreview || editPhotoIndex === null) return;

    let geoData = { country: '', region: '', city: '' };

    // Si des coordonnées GPS sont présentes, faire le géocodage inversé
    if (captureData.coordinates) {
      geoData = await reverseGeocode(captureData.coordinates.lat, captureData.coordinates.lng);
    }

    const updatedPhotos = [...discoveries[selectedBird.number].photos];
    updatedPhotos[editPhotoIndex] = {
      date: captureData.date,
      location: captureData.location,
      coordinates: captureData.coordinates,
      country: geoData.country,
      region: geoData.region,
      city: geoData.city,
      photo: captureData.photoPreview,
      sex: captureData.sex,
      note: captureData.note
    };

    const newDiscoveries = {
      ...discoveries,
      [selectedBird.number]: {
        ...discoveries[selectedBird.number],
        photos: updatedPhotos
      }
    };

    setDiscoveries(newDiscoveries);
    saveDiscoveries(newDiscoveries);

    setCaptureData({
      photo: null,
      photoPreview: null,
      date: new Date().toISOString().split('T')[0],
      location: '',
      coordinates: null,
      sex: '',
      note: ''
    });
    setEditPhotoIndex(null);
    setView('detail');
  };

  const handleDeletePhoto = () => {
    if (!selectedBird || editPhotoIndex === null) return;

    if (!confirm('Êtes-vous sûr de vouloir supprimer cette observation ?')) return;

    const updatedPhotos = discoveries[selectedBird.number].photos.filter((_, idx) => idx !== editPhotoIndex);

    const newDiscoveries = {
      ...discoveries,
      [selectedBird.number]: {
        ...discoveries[selectedBird.number],
        photos: updatedPhotos
      }
    };

    setDiscoveries(newDiscoveries);
    saveDiscoveries(newDiscoveries);

    setCaptureData({
      photo: null,
      photoPreview: null,
      date: new Date().toISOString().split('T')[0],
      location: '',
      coordinates: null,
      sex: '',
      note: ''
    });
    setEditPhotoIndex(null);
    setView('detail');
  };

  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCaptureData({
            ...captureData,
            coordinates: {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            }
          });
        },
        (error) => console.log('Erreur GPS:', error)
      );
    }
  };

  const filteredBirds = birds.filter(bird =>
    bird.nom_francais.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bird.nom_scientifique.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const discoveredCount = Object.keys(discoveries).length;
  const totalPhotos = Object.values(discoveries).reduce(
    (sum, bird) => sum + (bird.photos?.length || 0), 0
  );

  const currentTheme = themes[theme];

  // Vue Authentification
  if (view === 'auth') {
    return (
      <div className={`min-h-screen ${currentTheme.bg} p-4 flex items-center justify-center`}>
        <div className="max-w-md w-full">
          <div className={`${currentTheme.bgHeader} rounded-t-3xl p-6`}>
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-16 h-16 bg-blue-400 rounded-full border-4 border-white shadow-lg relative">
                <div className="absolute inset-2 bg-blue-300 rounded-full"></div>
                <div className="absolute inset-3 bg-white rounded-full opacity-30"></div>
              </div>
              <div>
                <h1 className={`text-2xl font-bold ${currentTheme.text}`}>BIRDEX</h1>
                <p className={`${currentTheme.textSecondary} text-sm`}>Version Naturaliste</p>
              </div>
            </div>

            {/* Sélecteur de thème sur la page de connexion */}
            <div className="mt-4 flex gap-2 justify-center">
              {Object.keys(themes).map((themeKey) => (
                <button
                  key={themeKey}
                  onClick={() => setTheme(themeKey)}
                  className={`px-3 py-1 rounded text-xs font-bold transition ${
                    theme === themeKey
                      ? 'bg-white bg-opacity-30 text-white'
                      : 'bg-black bg-opacity-20 text-white opacity-60 hover:opacity-100'
                  }`}
                >
                  {themes[themeKey].name}
                </button>
              ))}
            </div>
          </div>

          <div className={`${currentTheme.card} border-4 ${currentTheme.border} p-6`}>
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-2 px-4 rounded font-bold transition ${
                  authMode === 'login'
                    ? currentTheme.btnPrimary
                    : currentTheme.btnSecondary
                }`}
              >
                Connexion
              </button>
              <button
                onClick={() => setAuthMode('register')}
                className={`flex-1 py-2 px-4 rounded font-bold transition ${
                  authMode === 'register'
                    ? currentTheme.btnPrimary
                    : currentTheme.btnSecondary
                }`}
              >
                Inscription
              </button>
            </div>

            {authError && (
              <div className="bg-red-100 border-2 border-red-400 text-red-700 p-3 rounded mb-4">
                {authError}
              </div>
            )}

            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className={`block font-bold mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>Nom d'utilisateur</label>
                  <input
                    type="text"
                    name="username"
                    required
                    className="w-full p-2 border-2 border-gray-300 rounded focus:outline-none focus:border-red-500"
                    placeholder="Votre nom d'utilisateur"
                  />
                </div>
                <div>
                  <label className={`block font-bold mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>Mot de passe</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      required
                      className="w-full p-2 pr-10 border-2 border-gray-300 rounded focus:outline-none focus:border-red-500"
                      placeholder="Votre mot de passe"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  className={`w-full ${currentTheme.btnPrimary} py-3 rounded-lg font-bold transition`}
                >
                  Se connecter
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className={`block font-bold mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>Nom d'utilisateur</label>
                  <input
                    type="text"
                    name="username"
                    required
                    minLength="3"
                    className="w-full p-2 border-2 border-gray-300 rounded focus:outline-none focus:border-red-500"
                    placeholder="Minimum 3 caractères"
                  />
                </div>
                <div>
                  <label className={`block font-bold mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>Mot de passe</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      required
                      minLength="6"
                      className="w-full p-2 pr-10 border-2 border-gray-300 rounded focus:outline-none focus:border-red-500"
                      placeholder="Minimum 6 caractères"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={`block font-bold mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>Confirmer le mot de passe</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      name="confirmPassword"
                      required
                      minLength="6"
                      className="w-full p-2 pr-10 border-2 border-gray-300 rounded focus:outline-none focus:border-red-500"
                      placeholder="Retapez votre mot de passe"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  className={`w-full ${currentTheme.btnSuccess} py-3 rounded-lg font-bold transition`}
                >
                  S'inscrire
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Vue Liste
  if (view === 'list') {
    return (
      <div className={`min-h-screen ${currentTheme.bg} p-4`}>
        <div className="max-w-2xl mx-auto">
          {/* En-tête Pokédex */}
          <div className={`${currentTheme.bgHeader} rounded-t-3xl p-6 relative`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 bg-blue-400 rounded-full border-4 border-white shadow-lg relative">
                  <div className="absolute inset-2 bg-blue-300 rounded-full"></div>
                  <div className="absolute inset-3 bg-white rounded-full opacity-30"></div>
                </div>
                <div>
                  <h1 className={`text-2xl font-bold ${currentTheme.text}`}>BIRDEX</h1>
                  <p className={`${currentTheme.textSecondary} text-sm`}>Version Naturaliste</p>
                  {user && (
                    <p className={`${currentTheme.accent} text-xs flex items-center gap-1`}>
                      <User size={12} /> {user.username}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                </div>
                {user && (
                  <button
                    onClick={handleLogout}
                    className={`${currentTheme.text} text-xs ${currentTheme.textSecondary} transition flex items-center gap-1`}
                    title="Se déconnecter"
                  >
                    <LogOut size={14} /> Déconnexion
                  </button>
                )}
              </div>
            </div>

            {/* Sélecteur de thème */}
            <div className="mb-4 flex gap-2 justify-center">
              {Object.keys(themes).map((themeKey) => (
                <button
                  key={themeKey}
                  onClick={() => updateTheme(themeKey)}
                  className={`px-3 py-1 rounded text-xs font-bold transition ${
                    theme === themeKey
                      ? 'bg-white bg-opacity-30 text-white'
                      : 'bg-black bg-opacity-20 text-white opacity-60 hover:opacity-100'
                  }`}
                >
                  {themes[themeKey].name}
                </button>
              ))}
            </div>
            
            {/* Statistiques rapides */}
            <div className="bg-black bg-opacity-30 rounded-lg p-3 flex justify-around text-white">
              <div className="text-center">
                <div className="text-2xl font-bold">{discoveredCount}</div>
                <div className="text-xs opacity-80">Découverts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{birds.length}</div>
                <div className="text-xs opacity-80">Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{totalPhotos}</div>
                <div className="text-xs opacity-80">Photos</div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className={`${currentTheme.bgNav} p-2 flex gap-2 relative`}>
            <button
              onClick={() => setView('stats')}
              className={`flex-1 min-w-0 ${currentTheme.btnSecondary} py-2 px-2 rounded font-bold transition flex items-center justify-center gap-1 text-xs sm:text-sm`}
            >
              <span className="text-2xl">📊</span>
              <span className="hidden sm:inline">STATS</span>
            </button>
            <button
              onClick={() => setView('gallery')}
              className={`flex-1 min-w-0 ${currentTheme.btnSecondary} py-2 px-2 rounded font-bold transition flex items-center justify-center gap-1 text-xs sm:text-sm`}
            >
              <span className="text-2xl">🖼️</span>
              <span className="hidden sm:inline">GALERIE</span>
            </button>
            <button
              onClick={() => setView('map')}
              className={`flex-1 min-w-0 ${currentTheme.btnSecondary} py-2 px-2 rounded font-bold transition flex items-center justify-center gap-1 text-xs sm:text-sm`}
            >
              <span className="text-2xl">🗺️</span>
              <span className="hidden sm:inline">CARTE</span>
            </button>

            {/* Menu déroulant */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowDropdownMenu(!showDropdownMenu)}
                className={`${currentTheme.btnSecondary} py-2 px-3 sm:px-4 rounded font-bold transition flex items-center justify-center text-lg`}
              >
                ☰
              </button>

              {showDropdownMenu && (
                <div className={`absolute right-0 top-12 ${theme === 'dark' ? 'bg-slate-700' : 'bg-white'} border-2 ${currentTheme.border} rounded-lg shadow-xl z-50 min-w-[150px]`}>
                  <button
                    onClick={() => {
                      setView('share');
                      setShowDropdownMenu(false);
                    }}
                    className={`w-full text-left px-4 py-3 ${theme === 'dark' ? 'hover:bg-slate-600 text-slate-100' : 'hover:bg-gray-100 text-gray-800'} transition font-bold border-b ${currentTheme.border}`}
                  >
                    🔗 Partager
                  </button>
                  <button
                    onClick={() => {
                      setView('settings');
                      setShowDropdownMenu(false);
                    }}
                    className={`w-full text-left px-4 py-3 ${theme === 'dark' ? 'hover:bg-slate-600 text-slate-100' : 'hover:bg-gray-100 text-gray-800'} transition font-bold border-b ${currentTheme.border}`}
                  >
                    ⚙️ Paramètres
                  </button>
                  {user?.is_admin && (
                    <button
                      onClick={() => {
                        setView('admin');
                        setShowDropdownMenu(false);
                      }}
                      className={`w-full text-left px-4 py-3 ${theme === 'dark' ? 'hover:bg-slate-600 text-slate-100' : 'hover:bg-gray-100 text-gray-800'} transition font-bold rounded-b-lg`}
                    >
                      👤 Admin
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Barre de recherche */}
          <div className={`${currentTheme.card} p-4 border-4 ${currentTheme.border}`}>
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Rechercher un oiseau..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 border-2 ${currentTheme.border} rounded-lg focus:outline-none focus:border-blue-500 ${
                  theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'
                }`}
              />
            </div>
          </div>

          {/* Liste des oiseaux */}
          <div className={`${currentTheme.card} border-4 ${currentTheme.border} max-h-[500px] overflow-y-auto`}>
            {filteredBirds.map((bird, idx) => {
              const isDiscovered = discoveries[bird.number];
              const showRegionHeader = idx === 0 || bird.regionName !== filteredBirds[idx - 1].regionName;

              return (
                <React.Fragment key={bird.number}>
                  {/* En-tête de région */}
                  {showRegionHeader && (
                    <div className={`sticky top-0 ${currentTheme.gradient} ${currentTheme.text} px-4 py-2 font-bold text-sm border-b-2 ${currentTheme.border} z-10`}>
                      🌍 {bird.regionName}
                    </div>
                  )}

                  {/* Oiseau */}
                  <div
                    onClick={() => {
                      setSelectedBird(bird);
                      setView('detail');
                    }}
                    className={`flex items-center p-4 border-b-2 ${currentTheme.border} cursor-pointer transition ${
                      theme === 'dark' ? 'hover:bg-slate-700' : theme === 'white' ? 'hover:bg-blue-50' : 'hover:bg-red-50'
                    } ${!isDiscovered ? 'opacity-50' : ''}`}
                  >
                    <div className={`w-16 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'} font-bold`}>#{bird.number}</div>
                    <div className="flex-1">
                      <div className={`font-bold ${!isDiscovered ? 'text-gray-400' : theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>
                        {bird.nom_francais}
                      </div>
                      <div className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'} italic`}>
                        {isDiscovered ? bird.nom_scientifique : '???'}
                      </div>
                    </div>
                    {isDiscovered && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Camera size={16} />
                        {discoveries[bird.number].photos?.length || 0}
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Vue Statistiques
  if (view === 'stats') {
    // Calculer les statistiques géographiques
    const geoStats = {};
    let totalPhotosByGeo = 0;

    Object.entries(discoveries).forEach(([birdNumber, birdData]) => {
      if (birdData.photos) {
        birdData.photos.forEach((photo) => {
          if (photo.country && photo.region) {
            totalPhotosByGeo++;

            if (!geoStats[photo.country]) {
              geoStats[photo.country] = {
                count: 0,
                regions: {},
                species: new Set()
              };
            }

            geoStats[photo.country].count++;
            geoStats[photo.country].species.add(birdNumber);

            if (!geoStats[photo.country].regions[photo.region]) {
              geoStats[photo.country].regions[photo.region] = {
                count: 0,
                species: new Set()
              };
            }

            geoStats[photo.country].regions[photo.region].count++;
            geoStats[photo.country].regions[photo.region].species.add(birdNumber);
          }
        });
      }
    });

    // Obtenir la liste des pays et régions
    const countries = Object.keys(geoStats).sort();
    const regions = geoFilter.country && geoStats[geoFilter.country]
      ? Object.keys(geoStats[geoFilter.country].regions).sort()
      : [];

    return (
      <div className={`min-h-screen ${currentTheme.bg} p-4`}>
        <div className="max-w-2xl mx-auto">
          <div className={`${currentTheme.bgHeader} rounded-t-3xl p-6`}>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-2 ${currentTheme.text} mb-4 hover:opacity-80`}
            >
              <ChevronLeft size={24} />
              Retour
            </button>
            <h2 className={`text-2xl font-bold ${currentTheme.text}`}>Statistiques</h2>
          </div>

          <div className={`${currentTheme.card} border-4 ${currentTheme.border} p-6 space-y-6`}>
            <div className={`${currentTheme.gradient} rounded-lg p-6 ${currentTheme.text}`}>
              <h3 className="text-lg font-bold mb-4">Progression</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span>Oiseaux découverts</span>
                    <span className="font-bold">{discoveredCount} / {birds.length}</span>
                  </div>
                  <div className="w-full bg-white bg-opacity-30 rounded-full h-4">
                    <div
                      className="bg-yellow-400 h-4 rounded-full transition-all"
                      style={{ width: `${(discoveredCount / birds.length) * 100}%` }}
                    ></div>
                  </div>
                </div>
                <div className="text-center text-3xl font-bold">
                  {Math.round((discoveredCount / birds.length) * 100)}%
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-100 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-600">{totalPhotos}</div>
                <div className="text-sm text-blue-800">Photos prises</div>
              </div>
              <div className="bg-green-100 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-green-600">{discoveredCount}</div>
                <div className="text-sm text-green-800">Espèces trouvées</div>
              </div>
            </div>

            {/* Statistiques par région d'oiseaux */}
            <div className={`${currentTheme.gradient} rounded-lg p-4`}>
              <h4 className={`font-bold mb-3 flex items-center gap-2 ${currentTheme.text}`}>
                🗺️ Progression par région du monde
              </h4>
              <div className="space-y-2">
                {['France', 'Europe', 'Afrique', 'Asie', 'Proche-Orient', 'Amérique du Nord', 'Océanie'].map((regionName) => {
                  const regionBirds = birds.filter(b => b.regionName === regionName);
                  const regionDiscovered = regionBirds.filter(b => discoveries[b.number]);
                  const regionTotal = regionBirds.length;
                  const regionPercentage = regionTotal > 0 ? Math.round((regionDiscovered.length / regionTotal) * 100) : 0;

                  if (regionTotal === 0) return null;

                  return (
                    <div key={regionName} className="bg-white bg-opacity-20 p-3 rounded shadow">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-white">{regionName}</span>
                        <span className="text-sm font-bold text-white text-opacity-90">
                          {regionDiscovered.length} / {regionTotal}
                        </span>
                      </div>
                      <div className="w-full bg-white bg-opacity-30 rounded-full h-3">
                        <div
                          className="bg-yellow-300 h-3 rounded-full transition-all"
                          style={{ width: `${regionPercentage}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-white text-opacity-80 mt-1 text-right">
                        {regionPercentage}% complété
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Statistiques géographiques */}
            {totalPhotosByGeo > 0 && (
              <div className="bg-purple-50 dark:bg-purple-900 rounded-lg p-4">
                <h4 className="font-bold mb-3 flex items-center gap-2 text-gray-800 dark:text-white">
                  🌍 Statistiques géographiques
                </h4>

                {geoDisplayMode === 'all' && (
                  <div className="space-y-2">
                    {countries.map((country) => (
                      <div key={country} className="bg-white dark:bg-purple-800 p-3 rounded shadow">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-semibold ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>{country}</span>
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            {geoStats[country].count} obs • {geoStats[country].species.size} esp.
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {Object.keys(geoStats[country].regions).length} région(s)
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {geoDisplayMode === 'country' && geoFilter.country && (
                  <div className="space-y-2">
                    <div className="bg-white dark:bg-purple-800 p-3 rounded shadow mb-3">
                      <div className={`font-bold text-lg ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>{geoFilter.country}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        {geoStats[geoFilter.country].count} observations • {geoStats[geoFilter.country].species.size} espèces
                      </div>
                    </div>
                    {Object.entries(geoStats[geoFilter.country].regions).map(([region, data]) => (
                      <div key={region} className="bg-white dark:bg-purple-800 p-2 rounded shadow">
                        <div className="flex items-center justify-between">
                          <span className={`font-semibold text-sm ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>{region}</span>
                          <span className="text-xs text-gray-600 dark:text-gray-300">
                            {data.count} obs • {data.species.size} esp.
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {geoDisplayMode === 'region' && geoFilter.country && geoFilter.region && (
                  <div className="bg-white dark:bg-purple-800 p-3 rounded shadow">
                    <div className="font-bold">{geoFilter.region}, {geoFilter.country}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      {geoStats[geoFilter.country].regions[geoFilter.region].count} observations
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      {geoStats[geoFilter.country].regions[geoFilter.region].species.size} espèces différentes
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className={`${currentTheme.gradient} rounded-lg p-4`}>
              <h4 className={`font-bold mb-3 ${currentTheme.text}`}>Dernières découvertes</h4>
              <div className="space-y-2">
                {Object.entries(discoveries)
                  .slice(-5)
                  .reverse()
                  .map(([number, data]) => {
                    const bird = birds.find(b => b.number === number);
                    const lastPhoto = data.photos?.[data.photos.length - 1];
                    return (
                      <div key={number} className="flex items-center gap-3 bg-white bg-opacity-20 p-2 rounded">
                        <div className="text-sm text-white text-opacity-80">#{number}</div>
                        <div className="flex-1">
                          <div className="font-semibold text-sm text-white">{bird?.nom_francais}</div>
                          <div className="text-xs text-white text-opacity-70">
                            {lastPhoto?.date}
                            {lastPhoto?.country && ` • ${lastPhoto.region}, ${lastPhoto.country}`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Vue Galerie (optimisée)
  if (view === 'gallery') {
    // Récupérer toutes les photos de tous les oiseaux découverts
    let allPhotos = [];
    Object.entries(discoveries).forEach(([birdNumber, birdData]) => {
      const bird = birds.find(b => b.number === birdNumber);
      if (bird && birdData.photos) {
        birdData.photos.forEach((photo, photoIdx) => {
          allPhotos.push({
            bird,
            photo,
            photoIdx,
            birdNumber
          });
        });
      }
    });

    // Filtrer selon les critères géographiques
    if (geoFilter.country) {
      allPhotos = allPhotos.filter(item => item.photo.country === geoFilter.country);
    }
    if (geoFilter.region) {
      allPhotos = allPhotos.filter(item => item.photo.region === geoFilter.region);
    }

    // Trier par date (plus récent en premier)
    allPhotos.sort((a, b) => new Date(b.photo.date) - new Date(a.photo.date));

    // Pagination
    const totalPages = Math.ceil(allPhotos.length / PHOTOS_PER_PAGE);
    const startIndex = (galleryPage - 1) * PHOTOS_PER_PAGE;
    const endIndex = startIndex + PHOTOS_PER_PAGE;
    const paginatedPhotos = allPhotos.slice(startIndex, endIndex);

    // Obtenir la liste des pays et régions uniques
    const allCountries = [...new Set(
      Object.values(discoveries).flatMap(d =>
        d.photos?.filter(p => p.country).map(p => p.country) || []
      )
    )].sort();

    const allRegions = geoFilter.country
      ? [...new Set(
          Object.values(discoveries).flatMap(d =>
            d.photos?.filter(p => p.country === geoFilter.country && p.region).map(p => p.region) || []
          )
        )].sort()
      : [];

    return (
      <>
      <div className={`min-h-screen ${currentTheme.bg} p-4`}>
        <div className="max-w-4xl mx-auto">
          <div className={`${currentTheme.bgHeader} rounded-t-3xl p-6`}>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-2 ${currentTheme.text} mb-4 hover:opacity-80`}
            >
              <ChevronLeft size={24} />
              Retour
            </button>
            <h2 className={`text-2xl font-bold ${currentTheme.text}`}>Galerie Photos</h2>
            <p className={`${currentTheme.textSecondary} text-sm`}>{allPhotos.length} photo(s) {geoFilter.country ? `(filtrée${geoFilter.region ? ' par région' : ' par pays'})` : 'au total'}</p>
          </div>

          <div className={`${currentTheme.card} border-4 ${currentTheme.border} p-6`}>
            {/* Filtres géographiques */}
            {allCountries.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900 rounded-lg p-4 mb-6">
                <h4 className="font-bold mb-3 text-gray-800 dark:text-white">🌍 Filtrer par localisation</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select
                    value={geoFilter.country}
                    onChange={(e) => setGeoFilter({ country: e.target.value, region: '' })}
                    className="w-full p-2 border-2 border-blue-300 rounded"
                  >
                    <option value="">Tous les pays</option>
                    {allCountries.map((country) => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>

                  {geoFilter.country && allRegions.length > 0 && (
                    <select
                      value={geoFilter.region}
                      onChange={(e) => setGeoFilter({ ...geoFilter, region: e.target.value })}
                      className="w-full p-2 border-2 border-blue-300 rounded"
                    >
                      <option value="">Toutes les régions</option>
                      {allRegions.map((region) => (
                        <option key={region} value={region}>{region}</option>
                      ))}
                    </select>
                  )}
                </div>

                {(geoFilter.country || geoFilter.region) && (
                  <button
                    onClick={() => setGeoFilter({ country: '', region: '' })}
                    className={`mt-3 ${currentTheme.btnSecondary} py-2 px-4 rounded font-bold text-sm`}
                  >
                    ✕ Réinitialiser les filtres
                  </button>
                )}
              </div>
            )}
            {allPhotos.length === 0 ? (
              <div className="text-center py-12">
                <Camera size={48} className="mx-auto mb-4 text-gray-400" />
                <p className="text-gray-500">Aucune photo pour le moment.</p>
                <p className="text-sm text-gray-400 mt-2">
                  Commencez à capturer des oiseaux pour remplir votre galerie !
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {paginatedPhotos.map((item, idx) => (
                    <div
                      key={`${item.birdNumber}-${item.photoIdx}`}
                      className="bg-gray-100 rounded-lg overflow-hidden hover:shadow-xl transition-shadow"
                    >
                      <div className="relative cursor-pointer h-48">
                        <LazyImage
                          src={item.photo.photo_url || item.photo.photo}
                          alt={item.bird.nom_francais}
                          className="w-full h-48"
                          onClick={() => setImageViewer({
                            src: item.photo.photo_url || item.photo.photo,
                            title: `${item.bird.nom_francais} - ${item.photo.date}`
                          })}
                        />
                      <div className="absolute top-2 left-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs font-bold">
                        #{item.bird.number}
                      </div>
                      {item.photo.sex && (
                        <div className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-bold ${
                          item.photo.sex === 'male' ? 'bg-blue-500 text-white' :
                          item.photo.sex === 'female' ? 'bg-pink-500 text-white' :
                          'bg-gray-500 text-white'
                        }`}>
                          {item.photo.sex === 'male' ? '♂' : item.photo.sex === 'female' ? '♀' : '?'}
                        </div>
                      )}
                    </div>
                    <div
                      className="p-3 cursor-pointer hover:bg-gray-200 transition"
                      onClick={() => {
                        setSelectedBird(item.bird);
                        setView('detail');
                      }}
                    >
                      <div className="font-bold text-sm mb-1">{item.bird.nom_francais}</div>
                      <div className="text-xs text-gray-500 italic mb-2">{item.bird.nom_scientifique}</div>
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>{item.photo.date}</span>
                        {item.photo.coordinates && (
                          <span className="flex items-center gap-1">
                            <MapPin size={10} />
                            GPS
                          </span>
                        )}
                      </div>
                      {item.photo.country && (
                        <div className="text-xs text-gray-500 mt-1 truncate">
                          🌍 {item.photo.region}, {item.photo.country}
                        </div>
                      )}
                      {item.photo.location && (
                        <div className="text-xs text-gray-500 mt-1 truncate">
                          📍 {item.photo.location}
                        </div>
                      )}
                      {item.photo.note && (
                        <div className="text-xs text-gray-700 bg-yellow-50 p-2 rounded border border-yellow-200 mt-2 line-clamp-2">
                          {item.photo.note}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Contrôles de pagination */}
              {totalPages > 1 && (
                <div className="mt-8 flex justify-center items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setGalleryPage(Math.max(1, galleryPage - 1))}
                    disabled={galleryPage === 1}
                    className={`px-4 py-2 rounded font-bold ${
                      galleryPage === 1
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : currentTheme.btnPrimary + ' hover:opacity-80'
                    }`}
                  >
                    ← Précédent
                  </button>

                  <div className="flex gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      // Afficher seulement 5 pages autour de la page actuelle pour les grands nombres
                      if (
                        totalPages <= 7 ||
                        page === 1 ||
                        page === totalPages ||
                        (page >= galleryPage - 2 && page <= galleryPage + 2)
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => setGalleryPage(page)}
                            className={`w-10 h-10 rounded font-bold ${
                              page === galleryPage
                                ? currentTheme.btnPrimary
                                : 'bg-gray-200 hover:bg-gray-300'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      } else if (page === galleryPage - 3 || page === galleryPage + 3) {
                        return <span key={page} className="px-2">...</span>;
                      }
                      return null;
                    })}
                  </div>

                  <button
                    onClick={() => setGalleryPage(Math.min(totalPages, galleryPage + 1))}
                    disabled={galleryPage === totalPages}
                    className={`px-4 py-2 rounded font-bold ${
                      galleryPage === totalPages
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : currentTheme.btnPrimary + ' hover:opacity-80'
                    }`}
                  >
                    Suivant →
                  </button>

                  <div className="w-full text-center mt-2 text-sm text-gray-600">
                    Page {galleryPage} sur {totalPages} ({allPhotos.length} photo{allPhotos.length > 1 ? 's' : ''} au total)
                  </div>
                </div>
              )}
            </>
            )}
          </div>
        </div>
      </div>
      {/* ImageViewer modal par-dessus */}
      {imageViewer && (
        <div
          className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 p-4"
          onClick={() => setImageViewer(null)}
        >
          <div className="relative max-w-7xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setImageViewer(null)}
              className="absolute -top-12 right-0 text-white text-3xl hover:text-gray-300 font-bold"
            >
              ✕
            </button>
            <img
              src={imageViewer.src}
              alt={imageViewer.title}
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="text-white text-center mt-4 text-xl font-bold">
              {imageViewer.title}
            </div>
          </div>
        </div>
      )}
    </>
    );
  }

  // Vue Détail
  if (view === 'detail' && selectedBird) {
    const isDiscovered = discoveries[selectedBird.number];

    // Récupérer les observations avec coordonnées pour cet oiseau
    const birdObservations = [];
    if (isDiscovered && discoveries[selectedBird.number]?.photos) {
      discoveries[selectedBird.number].photos.forEach((photo, idx) => {
        if (photo.coordinates) {
          birdObservations.push({
            bird: selectedBird,
            photo,
            photoIdx: idx,
            birdNumber: selectedBird.number
          });
        }
      });
    }

    return (
      <>
      <div className={`min-h-screen ${currentTheme.bg} p-4`}>
        <div className="max-w-7xl mx-auto">
          <div className={`${currentTheme.bgHeader} rounded-t-3xl p-6`}>
            <button
              onClick={() => {
                setSelectedBird(null);
                setView('list');
              }}
              className={`flex items-center gap-2 ${currentTheme.text} mb-4 hover:opacity-80`}
            >
              <ChevronLeft size={24} />
              Retour
            </button>
          </div>

          {/* Layout Split Screen : Info à gauche, Carte à droite */}
          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-0 ${currentTheme.card} border-4 ${currentTheme.border}`}>
            {/* Colonne Gauche : Informations de l'oiseau */}
            <div className={`${currentTheme.card} lg:border-r-4 ${currentTheme.border}`}>
            {/* En-tête */}
            <div className={`${currentTheme.gradient} ${currentTheme.text} p-6`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm opacity-80">#{selectedBird.number}</div>
                  <h2 className="text-2xl font-bold">
                    {selectedBird.nom_francais}
                  </h2>
                  <p className="text-sm italic opacity-90">
                    {isDiscovered ? selectedBird.nom_scientifique : '???'}
                  </p>
                </div>
                <div className={`px-4 py-2 rounded-full font-bold ${
                  isDiscovered ? 'bg-green-400' : 'bg-gray-400'
                }`}>
                  {isDiscovered ? 'DÉCOUVERT' : 'NON VU'}
                </div>
              </div>
            </div>

            {isDiscovered ? (
              <>
                {/* Informations */}
                <div className="p-6 space-y-4">
                  {/* Description personnalisée */}
                  <div className="bg-yellow-50 rounded-lg p-4 border-2 border-yellow-200">
                    <h3 className="font-bold mb-2">Ma description</h3>
                    <textarea
                      value={discoveries[selectedBird.number]?.description || ''}
                      onChange={(e) => {
                        const newDiscoveries = {
                          ...discoveries,
                          [selectedBird.number]: {
                            ...discoveries[selectedBird.number],
                            description: e.target.value
                          }
                        };
                        setDiscoveries(newDiscoveries);
                        saveDiscoveries(newDiscoveries);
                      }}
                      placeholder="Ajoutez vos notes sur cet oiseau (comportement, habitat, observations personnelles...)"
                      className="w-full p-2 border-2 border-yellow-300 rounded resize-none focus:outline-none focus:border-yellow-400"
                      rows="3"
                    />
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4">
                    <h3 className="font-bold mb-2">Informations</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Région:</span>
                        <span className="font-semibold">Europe / France</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Taille:</span>
                        <span className="font-semibold">Variable selon l'espèce</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Photos:</span>
                        <span className="font-semibold">{discoveries[selectedBird.number].photos?.length || 0}</span>
                      </div>
                    </div>
                  </div>

                  {/* Galerie photos */}
                  <div>
                    <h3 className={`font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Mes observations</h3>
                    <div className="grid grid-cols-1 gap-3">
                      {discoveries[selectedBird.number].photos?.map((photo, idx) => (
                        <div key={idx} className="bg-gray-100 rounded-lg overflow-hidden">
                          <img
                            src={photo.photo_url || photo.photo}
                            alt={`Observation ${idx + 1}`}
                            className="w-full h-48 object-cover cursor-pointer hover:opacity-90 transition"
                            onClick={() => setImageViewer({
                              src: photo.photo_url || photo.photo,
                              title: `${selectedBird.nom_francais} - ${photo.date}`
                            })}
                          />
                          <div className="p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="font-semibold text-sm">{photo.date}</div>
                              {photo.sex && (
                                <div className={`px-2 py-1 rounded text-xs font-bold ${
                                  photo.sex === 'male' ? 'bg-blue-100 text-blue-700' :
                                  photo.sex === 'female' ? 'bg-pink-100 text-pink-700' :
                                  'bg-gray-200 text-gray-700'
                                }`}>
                                  {photo.sex === 'male' ? '♂ Mâle' : photo.sex === 'female' ? '♀ Femelle' : '?'}
                                </div>
                              )}
                            </div>
                            {photo.location && (
                              <div className="text-gray-600 flex items-center gap-1 text-xs">
                                <MapPin size={12} />
                                {photo.location}
                              </div>
                            )}
                            {photo.note && (
                              <div className="text-gray-700 text-xs bg-yellow-50 p-2 rounded border border-yellow-200 mt-2">
                                <span className="font-semibold">Note:</span> {photo.note}
                              </div>
                            )}
                            <button
                              onClick={() => {
                                setEditPhotoIndex(idx);
                                setCaptureData({
                                  photo: photo.photo,
                                  photoPreview: photo.photo,
                                  date: photo.date,
                                  location: photo.location || '',
                                  coordinates: photo.coordinates || null,
                                  sex: photo.sex || '',
                                  note: photo.note || ''
                                });
                                setView('edit');
                              }}
                              className="w-full mt-2 bg-blue-500 text-white py-2 px-3 rounded text-xs font-bold hover:bg-blue-600 transition"
                            >
                              ✏️ Modifier cette observation
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bouton capture */}
                <div className={`p-4 border-t-2 ${currentTheme.border}`}>
                  <button
                    onClick={() => setView('capture')}
                    className={`w-full ${currentTheme.btnSuccess} py-3 rounded-lg font-bold transition flex items-center justify-center gap-2`}
                  >
                    <Camera size={20} />
                    Nouvelle observation
                  </button>
                </div>
              </>
            ) : (
              <div className="p-12 text-center">
                <div className="text-6xl mb-4">❓</div>
                <p className="text-gray-500">
                  Cet oiseau n'a pas encore été découvert.
                  <br />
                  Capturez-le pour débloquer ses informations !
                </p>
                <button
                  onClick={() => setView('capture')}
                  className={`mt-6 ${currentTheme.btnPrimary} py-3 px-6 rounded-lg font-bold transition`}
                >
                  Première capture
                </button>
              </div>
            )}
            </div>

            {/* Colonne Droite : Minimap */}
            <div className={currentTheme.card}>
              <div className={`${currentTheme.gradient} ${currentTheme.text} p-4`}>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <MapIcon size={20} /> Carte des observations
                </h3>
                <p className={`text-sm ${currentTheme.textSecondary}`}>{birdObservations.length} observation(s) géolocalisée(s)</p>
              </div>

              {birdObservations.length > 0 ? (
                <div style={{ height: '600px', width: '100%', overflow: 'hidden' }}>
                  <LeafletMap
                    observations={birdObservations}
                    onMarkerClick={(obs) => {
                      // Optionnel: faire défiler vers la photo correspondante
                      console.log('Marker clicked:', obs);
                    }}
                  />
                </div>
              ) : (
                <div className="p-12 text-center" style={{ minHeight: '600px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <MapPin size={48} className="mb-4 text-gray-400" />
                  <p className="text-gray-500">
                    Aucune observation géolocalisée pour cet oiseau.
                  </p>
                  <p className="text-sm text-gray-400 mt-2">
                    Utilisez le bouton GPS lors de vos captures !
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* ImageViewer modal par-dessus */}
      {imageViewer && (
        <div
          className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 p-4"
          onClick={() => setImageViewer(null)}
        >
          <div className="relative max-w-7xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setImageViewer(null)}
              className="absolute -top-12 right-0 text-white text-3xl hover:text-gray-300 font-bold"
            >
              ✕
            </button>
            <img
              src={imageViewer.src}
              alt={imageViewer.title}
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="text-white text-center mt-4 text-xl font-bold">
              {imageViewer.title}
            </div>
          </div>
        </div>
      )}
    </>
    );
  }

  // Vue Capture
  if (view === 'capture' && selectedBird) {
    return (
      <div className={`min-h-screen ${currentTheme.bg} p-4`}>
        <div className="max-w-2xl mx-auto">
          <div className={`${currentTheme.bgHeader} rounded-t-3xl p-6`}>
            <button
              onClick={() => setView('detail')}
              className={`flex items-center gap-2 ${currentTheme.text} mb-4 hover:opacity-80`}
            >
              <ChevronLeft size={24} />
              Retour
            </button>
            <h2 className={`text-2xl font-bold ${currentTheme.text}`}>Nouvelle observation</h2>
            <p className={currentTheme.textSecondary}>{selectedBird.nom_francais}</p>
          </div>

          <div className={`${currentTheme.card} border-4 ${currentTheme.border} p-6 space-y-4`}>
            {/* Upload photo */}
            <div>
              <label className={`block font-bold mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>Photo *</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                {captureData.photoPreview ? (
                  <div className="relative">
                    <img
                      src={captureData.photoPreview}
                      alt="Preview"
                      className="max-h-64 mx-auto rounded"
                    />
                    <button
                      onClick={() => setCaptureData({...captureData, photo: null, photoPreview: null})}
                      className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                    >
                      <X size={20} />
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <Camera size={48} className={`mx-auto mb-2 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-400'}`} />
                    <div className={theme === 'dark' ? 'text-slate-300' : 'text-gray-600'}>Cliquez pour ajouter une photo</div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className={`block font-bold mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>Date *</label>
              <input
                type="date"
                value={captureData.date}
                onChange={(e) => setCaptureData({...captureData, date: e.target.value})}
                className={`w-full p-2 border-2 rounded ${theme === 'dark' ? 'bg-slate-600 border-slate-500 text-slate-100' : 'bg-white border-gray-300 text-gray-900'}`}
              />
            </div>

            {/* Lieu */}
            <div>
              <label className={`block font-bold mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>Lieu</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={captureData.location}
                  onChange={(e) => setCaptureData({...captureData, location: e.target.value})}
                  placeholder="Ex: Forêt de Fontainebleau"
                  className={`flex-1 p-2 border-2 rounded ${theme === 'dark' ? 'bg-slate-600 border-slate-500 text-slate-100 placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900'}`}
                />
                <button
                  onClick={getLocation}
                  className="bg-blue-500 text-white px-4 rounded hover:bg-blue-600 transition"
                  title="Utiliser ma position GPS"
                >
                  <MapPin size={20} />
                </button>
              </div>
              <button
                onClick={() => setShowMapPicker(true)}
                className="w-full bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 transition flex items-center justify-center gap-2"
              >
                <MapIcon size={18} />
                Sélectionner sur la carte
              </button>
              {captureData.coordinates && (
                <div className="text-xs text-gray-500 mt-2 bg-green-50 p-2 rounded border border-green-200">
                  <span className="font-semibold">📍 Position enregistrée:</span> {captureData.coordinates.lat.toFixed(6)}, {captureData.coordinates.lng.toFixed(6)}
                </div>
              )}
            </div>

            {/* Modal de sélection de carte */}
            {showMapPicker && (
              <MapPicker
                initialCoords={captureData.coordinates}
                onLocationSelect={(coords) => {
                  setCaptureData({...captureData, coordinates: coords});
                }}
                onClose={() => setShowMapPicker(false)}
              />
            )}

            {/* Sexe */}
            <div>
              <label className={`block font-bold mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>Sexe</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setCaptureData({...captureData, sex: 'male'})}
                  className={`flex-1 py-2 px-4 rounded border-2 font-semibold transition ${
                    captureData.sex === 'male'
                      ? 'bg-blue-500 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  ♂ Mâle
                </button>
                <button
                  onClick={() => setCaptureData({...captureData, sex: 'female'})}
                  className={`flex-1 py-2 px-4 rounded border-2 font-semibold transition ${
                    captureData.sex === 'female'
                      ? 'bg-pink-500 text-white border-pink-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  ♀ Femelle
                </button>
                <button
                  onClick={() => setCaptureData({...captureData, sex: ''})}
                  className={`flex-1 py-2 px-4 rounded border-2 font-semibold transition ${
                    captureData.sex === ''
                      ? 'bg-gray-500 text-white border-gray-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  ? Inconnu
                </button>
              </div>
            </div>

            {/* Note */}
            <div>
              <label className={`block font-bold mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>Note / Observation</label>
              <textarea
                value={captureData.note}
                onChange={(e) => setCaptureData({...captureData, note: e.target.value})}
                placeholder="Ajoutez des observations sur cette photo (comportement, particularités...)"
                className={`w-full p-2 border-2 rounded resize-none focus:outline-none ${theme === 'dark' ? 'bg-slate-600 border-slate-500 text-slate-100 placeholder-slate-400 focus:border-indigo-500' : 'bg-white border-gray-300 text-gray-900 focus:border-red-500'}`}
                rows="3"
              />
            </div>

            {/* Boutons */}
            <div className="flex gap-2 pt-4">
              <button
                onClick={() => setView('detail')}
                className={`flex-1 ${currentTheme.btnSecondary} py-3 rounded-lg font-bold transition`}
              >
                Annuler
              </button>
              <button
                onClick={handleCapture}
                disabled={!captureData.photoPreview}
                className={`flex-1 ${currentTheme.btnSuccess} py-3 rounded-lg font-bold transition disabled:bg-gray-300 disabled:cursor-not-allowed`}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Vue Édition
  if (view === 'edit' && selectedBird && editPhotoIndex !== null) {
    return (
      <div className={`min-h-screen ${currentTheme.bg} p-4`}>
        <div className="max-w-2xl mx-auto">
          <div className={`${currentTheme.bgHeader} rounded-t-3xl p-6`}>
            <button
              onClick={() => {
                setView('detail');
                setEditPhotoIndex(null);
                setCaptureData({
                  photo: null,
                  photoPreview: null,
                  date: new Date().toISOString().split('T')[0],
                  location: '',
                  coordinates: null,
                  sex: '',
                  note: ''
                });
              }}
              className={`flex items-center gap-2 ${currentTheme.text} mb-4 hover:opacity-80`}
            >
              <ChevronLeft size={24} />
              Retour
            </button>
            <h2 className={`text-2xl font-bold ${currentTheme.text}`}>Modifier l'observation</h2>
            <p className={currentTheme.textSecondary}>{selectedBird.nom_francais}</p>
          </div>

          <div className={`${currentTheme.card} border-4 ${currentTheme.border} p-6 space-y-4`}>
            {/* Upload photo */}
            <div>
              <label className={`block font-bold mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>Photo *</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                {captureData.photoPreview ? (
                  <div className="relative">
                    <img
                      src={captureData.photoPreview}
                      alt="Preview"
                      className="max-h-64 mx-auto rounded"
                    />
                    <button
                      onClick={() => setCaptureData({...captureData, photo: null, photoPreview: null})}
                      className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                    >
                      <X size={20} />
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <Camera size={48} className="mx-auto mb-2 text-gray-400" />
                    <div className="text-gray-600">Cliquez pour changer la photo</div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className={`block font-bold mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>Date *</label>
              <input
                type="date"
                value={captureData.date}
                onChange={(e) => setCaptureData({...captureData, date: e.target.value})}
                className={`w-full p-2 border-2 rounded ${theme === 'dark' ? 'bg-slate-600 border-slate-500 text-slate-100' : 'bg-white border-gray-300 text-gray-900'}`}
              />
            </div>

            {/* Lieu */}
            <div>
              <label className={`block font-bold mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>Lieu</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={captureData.location}
                  onChange={(e) => setCaptureData({...captureData, location: e.target.value})}
                  placeholder="Ex: Forêt de Fontainebleau"
                  className={`flex-1 p-2 border-2 rounded ${theme === 'dark' ? 'bg-slate-600 border-slate-500 text-slate-100 placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900'}`}
                />
                <button
                  onClick={getLocation}
                  className="bg-blue-500 text-white px-4 rounded hover:bg-blue-600 transition"
                  title="Utiliser ma position GPS"
                >
                  <MapPin size={20} />
                </button>
              </div>
              <button
                onClick={() => setShowMapPicker(true)}
                className="w-full bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 transition flex items-center justify-center gap-2"
              >
                <MapIcon size={18} />
                Sélectionner sur la carte
              </button>
              {captureData.coordinates && (
                <div className="text-xs text-gray-500 mt-2 bg-green-50 p-2 rounded border border-green-200">
                  <span className="font-semibold">📍 Position enregistrée:</span> {captureData.coordinates.lat.toFixed(6)}, {captureData.coordinates.lng.toFixed(6)}
                </div>
              )}
            </div>

            {/* Modal de sélection de carte */}
            {showMapPicker && (
              <MapPicker
                initialCoords={captureData.coordinates}
                onLocationSelect={(coords) => {
                  setCaptureData({...captureData, coordinates: coords});
                }}
                onClose={() => setShowMapPicker(false)}
              />
            )}

            {/* Sexe */}
            <div>
              <label className={`block font-bold mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>Sexe</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setCaptureData({...captureData, sex: 'male'})}
                  className={`flex-1 py-2 px-4 rounded border-2 font-semibold transition ${
                    captureData.sex === 'male'
                      ? 'bg-blue-500 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  ♂ Mâle
                </button>
                <button
                  onClick={() => setCaptureData({...captureData, sex: 'female'})}
                  className={`flex-1 py-2 px-4 rounded border-2 font-semibold transition ${
                    captureData.sex === 'female'
                      ? 'bg-pink-500 text-white border-pink-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  ♀ Femelle
                </button>
                <button
                  onClick={() => setCaptureData({...captureData, sex: ''})}
                  className={`flex-1 py-2 px-4 rounded border-2 font-semibold transition ${
                    captureData.sex === ''
                      ? 'bg-gray-500 text-white border-gray-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  ? Inconnu
                </button>
              </div>
            </div>

            {/* Note */}
            <div>
              <label className={`block font-bold mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>Note / Observation</label>
              <textarea
                value={captureData.note}
                onChange={(e) => setCaptureData({...captureData, note: e.target.value})}
                placeholder="Ajoutez des observations sur cette photo (comportement, particularités...)"
                className={`w-full p-2 border-2 rounded resize-none focus:outline-none ${theme === 'dark' ? 'bg-slate-600 border-slate-500 text-slate-100 placeholder-slate-400 focus:border-indigo-500' : 'bg-white border-gray-300 text-gray-900 focus:border-red-500'}`}
                rows="3"
              />
            </div>

            {/* Boutons */}
            <div className="space-y-2 pt-4">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setView('detail');
                    setEditPhotoIndex(null);
                    setCaptureData({
                      photo: null,
                      photoPreview: null,
                      date: new Date().toISOString().split('T')[0],
                      location: '',
                      coordinates: null,
                      sex: '',
                      note: ''
                    });
                  }}
                  className={`flex-1 ${currentTheme.btnSecondary} py-3 rounded-lg font-bold transition`}
                >
                  Annuler
                </button>
                <button
                  onClick={handleEditSave}
                  disabled={!captureData.photoPreview}
                  className={`flex-1 ${currentTheme.btnSuccess} py-3 rounded-lg font-bold transition disabled:bg-gray-300 disabled:cursor-not-allowed`}
                >
                  💾 Enregistrer
                </button>
              </div>
              <button
                onClick={handleDeletePhoto}
                className={`w-full ${currentTheme.btnDanger} py-3 rounded-lg font-bold transition`}
              >
                🗑️ Supprimer cette observation
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Vue Minimap Globale
  if (view === 'map') {
    // Récupérer toutes les observations avec coordonnées
    const allObservations = [];
    Object.entries(discoveries).forEach(([birdNumber, birdData]) => {
      const bird = birds.find(b => b.number === birdNumber);
      if (bird && birdData.photos) {
        birdData.photos.forEach((photo, photoIdx) => {
          if (photo.coordinates) {
            allObservations.push({
              bird,
              photo,
              photoIdx,
              birdNumber
            });
          }
        });
      }
    });

    return (
      <div className={`min-h-screen ${currentTheme.bg} p-4`}>
        <div className="max-w-2xl mx-auto">
          <div className={`${currentTheme.bgHeader} rounded-t-3xl p-6`}>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-2 ${currentTheme.text} mb-4 hover:opacity-80`}
            >
              <ChevronLeft size={24} />
              Retour
            </button>
            <h2 className={`text-2xl font-bold ${currentTheme.text}`}>Minimap des Observations</h2>
            <p className={`${currentTheme.textSecondary} text-sm`}>{allObservations.length} observation(s) géolocalisée(s)</p>
          </div>

          <div className={`${currentTheme.card} border-4 ${currentTheme.border}`}>
            {allObservations.length === 0 ? (
              <div className="text-center py-12">
                <MapPin size={48} className="mx-auto mb-4 text-gray-400" />
                <p className="text-gray-500">Aucune observation géolocalisée pour le moment.</p>
                <p className="text-sm text-gray-400 mt-2">
                  Utilisez le bouton GPS lors de vos captures pour les voir apparaître ici !
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Carte Leaflet */}
                <div style={{ height: '500px' }}>
                  <LeafletMap
                    observations={allObservations}
                    onMarkerClick={(obs) => {
                      setSelectedBird(obs.bird);
                      setView('detail');
                    }}
                  />
                </div>

                {/* Liste des observations */}
                <div className="p-6">
                  <h3 className={`font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Liste des observations</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {allObservations.map((obs, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          setSelectedBird(obs.bird);
                          setView('detail');
                        }}
                        className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg cursor-pointer hover:bg-blue-50 transition"
                      >
                        <MapPin size={20} className="text-red-500" />
                        <div className="flex-1">
                          <div className="font-semibold text-sm">{obs.bird.nom_francais}</div>
                          <div className="text-xs text-gray-500">
                            {obs.photo.date} - {obs.photo.location || 'Localisation inconnue'}
                          </div>
                          <div className="text-xs text-gray-400">
                            📍 {obs.photo.coordinates.lat.toFixed(4)}, {obs.photo.coordinates.lng.toFixed(4)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Vue Partage
  if (view === 'share') {
    const regenerateToken = async () => {
      if (!confirm('Voulez-vous vraiment régénérer votre lien de partage ? L\'ancien lien ne fonctionnera plus.')) return;

      try {
        const response = await fetch('/api/share/regenerate', { method: 'POST', credentials: 'same-origin' });
        const data = await response.json();
        setShareToken(data.share_token);
      } catch (error) {
        console.error('Erreur régénération token:', error);
      }
    };

    const copyToClipboard = () => {
      const shareUrl = `${window.location.origin}/share/${shareToken}`;
      navigator.clipboard.writeText(shareUrl).then(() => {
        alert('Lien copié dans le presse-papier !');
      });
    };

    const shareUrl = shareToken ? `${window.location.origin}/share/${shareToken}` : '';

    return (
      <div className={`min-h-screen ${currentTheme.bg} p-4`}>
        <div className="max-w-2xl mx-auto">
          <div className={`${currentTheme.bgHeader} rounded-t-3xl p-6`}>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-2 ${currentTheme.text} mb-4 hover:opacity-80`}
            >
              <ChevronLeft size={24} />
              Retour
            </button>
            <h2 className={`text-2xl font-bold ${currentTheme.text}`}>Partager mon profil</h2>
            <p className={`${currentTheme.textSecondary} text-sm`}>Partagez vos découvertes avec vos amis</p>
          </div>

          <div className={`${currentTheme.card} border-4 ${currentTheme.border} p-6 space-y-6`}>
            <div className="bg-blue-50 dark:bg-blue-900 p-4 rounded-lg border-2 border-blue-200 dark:border-blue-700">
              <h3 className="font-bold mb-2 flex items-center gap-2 text-gray-800 dark:text-white">
                🔒 Partage sécurisé
              </h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Votre lien de partage est unique et sécurisé. Les personnes qui visitent votre profil pourront voir vos découvertes en <strong>lecture seule</strong>.
              </p>
            </div>

            {/* Options de partage */}
            <div className="bg-green-50 dark:bg-green-900 p-4 rounded-lg border-2 border-green-200 dark:border-green-700">
              <h3 className="font-bold mb-3 flex items-center gap-2 text-gray-800 dark:text-white">
                ⚙️ Options d'affichage
              </h3>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showMap}
                  onChange={async (e) => {
                    const newValue = e.target.checked;
                    setShowMap(newValue);
                    try {
                      await fetch('/api/share/show-map', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'same-origin',
                        body: JSON.stringify({ show_map: newValue })
                      });
                    } catch (error) {
                      console.error('Erreur mise à jour show_map:', error);
                      setShowMap(!newValue); // Rollback en cas d'erreur
                    }
                  }}
                  className="w-5 h-5 accent-green-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  <strong>Afficher la carte 🗺️</strong> sur mon profil public
                  <p className="text-xs opacity-75 mt-1">La carte affiche toutes vos photos avec coordonnées GPS</p>
                </span>
              </label>
            </div>

            {shareToken && (
              <>
                <div>
                  <label className={`block font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Votre lien de partage</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={shareUrl}
                      readOnly
                      className={`flex-1 p-2 border-2 rounded font-mono text-sm ${theme === 'dark' ? 'bg-slate-600 border-slate-500 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
                    />
                    <button
                      onClick={copyToClipboard}
                      className={`${currentTheme.btnPrimary} px-4 rounded font-bold`}
                    >
                      📋 Copier
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={regenerateToken}
                    className={`flex-1 ${currentTheme.btnDanger} py-3 rounded-lg font-bold`}
                  >
                    🔄 Régénérer le lien
                  </button>
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex-1 ${currentTheme.btnSuccess} py-3 rounded-lg font-bold text-center`}
                  >
                    👁️ Prévisualiser
                  </a>
                </div>
              </>
            )}

            <div className="bg-yellow-50 dark:bg-yellow-900 p-4 rounded-lg border-2 border-yellow-200 dark:border-yellow-700">
              <h3 className="font-bold mb-2 text-gray-800 dark:text-white">💡 Astuce</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Si vous souhaitez révoquer l'accès à votre profil, régénérez simplement votre lien de partage. L'ancien lien cessera de fonctionner immédiatement.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Vue Paramètres
  if (view === 'settings') {
    return (
      <div className={`min-h-screen ${currentTheme.bg} p-4`}>
        <div className="max-w-2xl mx-auto">
          <div className={`${currentTheme.bgHeader} rounded-t-3xl p-6`}>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-2 ${currentTheme.text} mb-4 hover:opacity-80`}
            >
              <ChevronLeft size={24} />
              Retour
            </button>
            <h2 className={`text-2xl font-bold ${currentTheme.text}`}>⚙️ Paramètres</h2>
            <p className={`${currentTheme.textSecondary} text-sm`}>Personnalisez votre expérience</p>
          </div>

          <div className={`${currentTheme.card} border-4 ${currentTheme.border} p-6 space-y-6`}>
            {/* Thème */}
            <div className="bg-blue-50 dark:bg-blue-900 rounded-lg p-4">
              <h3 className="font-bold mb-3 flex items-center gap-2 text-gray-800 dark:text-white">
                🎨 Thème d'affichage
              </h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                Choisissez le thème visuel de l'application
              </p>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(themes).map(([key, themeObj]) => (
                  <button
                    key={key}
                    onClick={() => updateTheme(key)}
                    className={`py-3 px-4 rounded-lg font-bold transition ${
                      theme === key
                        ? 'ring-4 ring-blue-500 scale-105'
                        : 'hover:scale-105'
                    }`}
                    style={{
                      background: key === 'pokemon' ? '#dc2626' :
                                 key === 'dark' ? '#334155' :
                                 '#f5e6d3'
                    }}
                  >
                    <div className={key === 'white' ? 'text-amber-800' : 'text-white'}>
                      {themeObj.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Informations */}
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
              <h3 className="font-bold mb-2 text-gray-800 dark:text-white">ℹ️ Informations</h3>
              <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                <p>• Le thème est sauvegardé automatiquement</p>
                <p>• Les oiseaux sont organisés par région (France, Europe, Afrique, etc.)</p>
                <p>• La numérotation est unique et continue sur toute la liste</p>
              </div>
            </div>

            {/* Contacter l'administrateur */}
            <div className="bg-blue-50 dark:bg-blue-900 rounded-lg p-4">
              <h3 className="font-bold mb-3 flex items-center gap-2 text-gray-800 dark:text-white">
                📧 Contacter l'administrateur
              </h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                Besoin d'aide ? Mot de passe oublié ? Envoyez un message à l'admin.
              </p>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const subject = formData.get('subject');
                const message = formData.get('message');

                try {
                  const response = await fetch('/api/messages/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ subject, message })
                  });

                  const data = await response.json();

                  if (response.ok) {
                    alert('✅ ' + data.message);
                    e.target.reset();
                  } else {
                    alert('❌ ' + data.error);
                  }
                } catch (error) {
                  console.error('Erreur:', error);
                  alert('❌ Erreur lors de l\'envoi du message');
                }
              }} className="space-y-3">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-700'}`}>
                    Sujet (3-100 caractères)
                  </label>
                  <input
                    type="text"
                    name="subject"
                    required
                    minLength="3"
                    maxLength="100"
                    placeholder="Ex: Mot de passe oublié"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-700'}`}>
                    Message (10-1000 caractères)
                  </label>
                  <textarea
                    name="message"
                    required
                    minLength="10"
                    maxLength="1000"
                    rows="4"
                    placeholder="Décrivez votre demande..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition"
                >
                  📨 Envoyer le message
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ⚠️ Limite : 3 messages par heure
                </p>
              </form>
            </div>

            {/* Changer le mot de passe */}
            <div className="bg-green-50 dark:bg-green-900 rounded-lg p-4">
              <h3 className="font-bold mb-3 flex items-center gap-2 text-gray-800 dark:text-white">
                🔒 Changer le mot de passe
              </h3>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const currentPassword = formData.get('current_password');
                const newPassword = formData.get('new_password');
                const confirmPassword = formData.get('confirm_password');

                if (newPassword !== confirmPassword) {
                  alert('Les nouveaux mots de passe ne correspondent pas');
                  return;
                }

                if (newPassword.length < 6) {
                  alert('Le mot de passe doit contenir au moins 6 caractères');
                  return;
                }

                try {
                  const response = await fetch('/api/auth/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                      current_password: currentPassword,
                      new_password: newPassword
                    })
                  });

                  const data = await response.json();

                  if (response.ok) {
                    alert('✅ Mot de passe changé avec succès !');
                    e.target.reset();
                  } else {
                    alert('❌ ' + data.error);
                  }
                } catch (error) {
                  console.error('Erreur:', error);
                  alert('❌ Erreur lors du changement de mot de passe');
                }
              }} className="space-y-3">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-700'}`}>
                    Mot de passe actuel
                  </label>
                  <input
                    type="password"
                    name="current_password"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-700'}`}>
                    Nouveau mot de passe
                  </label>
                  <input
                    type="password"
                    name="new_password"
                    required
                    minLength="6"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-700'}`}>
                    Confirmer le nouveau mot de passe
                  </label>
                  <input
                    type="password"
                    name="confirm_password"
                    required
                    minLength="6"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition"
                >
                  🔐 Changer le mot de passe
                </button>
              </form>
            </div>

            {/* Debug Session */}
            {user?.is_admin && (
              <div className="bg-yellow-100 dark:bg-yellow-900 rounded-lg p-4">
                <h3 className="font-bold mb-2 text-gray-800 dark:text-white">🐛 Debug Session (Mobile)</h3>
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/debug/session', { credentials: 'same-origin' });
                      const data = await response.json();
                      console.log('📊 DEBUG SESSION:', data);
                      alert(JSON.stringify(data, null, 2));
                    } catch (error) {
                      console.error('Erreur debug:', error);
                      alert('Erreur: ' + error.message);
                    }
                  }}
                  className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded"
                >
                  🔍 Tester la session
                </button>
                <p className="text-xs mt-2 text-gray-600 dark:text-gray-300">
                  Ouvrez la console (F12) pour voir les logs détaillés
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Vue Administration
  if (view === 'admin' && user?.is_admin) {
    return (
      <div className={`min-h-screen ${currentTheme.bg} p-4`}>
        <div className="max-w-4xl mx-auto">
          <div className={`${currentTheme.bgHeader} rounded-t-3xl p-6`}>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-2 ${currentTheme.text} mb-4 hover:opacity-80`}
            >
              <ChevronLeft size={24} />
              Retour
            </button>
            <h2 className={`text-2xl font-bold ${currentTheme.text}`}>⚙️ Administration</h2>
            <p className={`${currentTheme.textSecondary} text-sm`}>Statistiques et gestion du site</p>
          </div>

          <div className={`${currentTheme.card} border-4 ${currentTheme.border} p-6 space-y-6`}>
            {adminStats ? (
              <>
                {/* Statistiques globales */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className={`${currentTheme.gradient} ${currentTheme.text} rounded-lg p-6 text-center`}>
                    <div className="text-4xl font-bold">{adminStats.total_users}</div>
                    <div className="text-sm opacity-80 mt-2">Utilisateurs</div>
                  </div>
                  <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg p-6 text-center">
                    <div className="text-4xl font-bold">{adminStats.active_users || 0}</div>
                    <div className="text-sm opacity-80 mt-2">Utilisateurs actifs</div>
                    <div className="text-xs opacity-60 mt-1">(avec photos)</div>
                  </div>
                  <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg p-6 text-center">
                    <div className="text-4xl font-bold">{adminStats.storage_mb} MB</div>
                    <div className="text-sm opacity-80 mt-2">Stockage utilisé</div>
                  </div>
                </div>

                {/* Liste des utilisateurs */}
                <div>
                  <h3 className={`font-bold text-xl mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>📊 Détails des utilisateurs</h3>
                  <div className="bg-white dark:bg-slate-700 rounded-lg overflow-hidden border-2 border-gray-200 dark:border-slate-600">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-100 dark:bg-slate-600">
                          <tr>
                            <th className={`px-4 py-3 text-left text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Utilisateur</th>
                            <th className={`px-4 py-3 text-left text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Inscription</th>
                            <th className={`px-4 py-3 text-left text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Découvertes</th>
                            <th className={`px-4 py-3 text-left text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Photos</th>
                            <th className={`px-4 py-3 text-left text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Stockage</th>
                            <th className={`px-4 py-3 text-left text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-600">
                          {adminStats.users.map((u, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-slate-600">
                              <td className={`px-4 py-3 font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{u.username}</td>
                              <td className={`px-4 py-3 text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-600'}`}>{u.created_at}</td>
                              <td className="px-4 py-3 text-center">
                                {u.discoveries_count > 0 ? `✅ ${u.discoveries_count}` : '❌'}
                              </td>
                              <td className={`px-4 py-3 text-center ${theme === 'dark' ? 'text-slate-300' : 'text-gray-600'}`}>
                                {u.photos_count > 0 ? (
                                  <span className={u.photos_count >= 10000 ? 'text-red-600 font-bold' : ''}>
                                    📷 {u.photos_count} {u.photos_count >= 10000 ? '⚠️ MAX' : ''}
                                  </span>
                                ) : '❌'}
                              </td>
                              <td className={`px-4 py-3 text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-600'}`}>
                                {u.storage_used ? `${(u.storage_used / (1024 * 1024)).toFixed(1)} MB` : '-'}
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={async () => {
                                    if (!confirm(`⚠️ Réinitialiser le mot de passe de "${u.username}" ?\n\nUn nouveau mot de passe temporaire sera généré.`)) {
                                      return;
                                    }

                                    try {
                                      const response = await fetch(`/api/admin/reset-password/${u.id}`, {
                                        method: 'POST',
                                        credentials: 'same-origin'
                                      });

                                      const data = await response.json();

                                      if (response.ok) {
                                        alert(`✅ Mot de passe réinitialisé pour ${data.username}\n\n🔑 Mot de passe temporaire:\n${data.temporary_password}\n\n⚠️ Communiquez ce mot de passe à l'utilisateur de manière sécurisée.`);
                                      } else {
                                        alert('❌ Erreur: ' + data.error);
                                      }
                                    } catch (error) {
                                      console.error('Erreur:', error);
                                      alert('❌ Erreur lors de la réinitialisation du mot de passe');
                                    }
                                  }}
                                  className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1 rounded transition"
                                  title="Réinitialiser le mot de passe"
                                >
                                  🔒 Reset MDP
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Messages des utilisateurs */}
                {adminMessages && (
                  <div>
                    <h3 className={`font-bold text-xl mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                      📨 Messages ({adminMessages.unread > 0 && <span className="text-red-500">{adminMessages.unread} non lu(s)</span>})
                    </h3>
                    {adminMessages.messages.length > 0 ? (
                      <div className="space-y-3">
                        {adminMessages.messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`border-2 rounded-lg p-4 ${
                              msg.is_read
                                ? 'bg-gray-50 dark:bg-slate-700 border-gray-300 dark:border-slate-600'
                                : 'bg-blue-50 dark:bg-blue-900 border-blue-400 dark:border-blue-600'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h4 className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                                  {msg.is_read ? '' : '🔵 '}{msg.subject}
                                </h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  De: {msg.username} • {new Date(msg.created_at).toLocaleString('fr-FR')}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                {!msg.is_read && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        await fetch(`/api/messages/mark-read/${msg.id}`, {
                                          method: 'POST',
                                          credentials: 'same-origin'
                                        });
                                        loadAdminMessages(); // Recharger les messages
                                      } catch (error) {
                                        console.error('Erreur:', error);
                                      }
                                    }}
                                    className="bg-green-500 hover:bg-green-600 text-white text-xs px-2 py-1 rounded"
                                    title="Marquer comme lu"
                                  >
                                    ✓
                                  </button>
                                )}
                                <button
                                  onClick={async () => {
                                    if (!confirm('Supprimer ce message ?')) return;
                                    try {
                                      await fetch(`/api/messages/delete/${msg.id}`, {
                                        method: 'DELETE',
                                        credentials: 'same-origin'
                                      });
                                      loadAdminMessages(); // Recharger les messages
                                    } catch (error) {
                                      console.error('Erreur:', error);
                                    }
                                  }}
                                  className="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded"
                                  title="Supprimer"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                            <p className={`text-sm whitespace-pre-wrap ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              {msg.message}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-gray-100 dark:bg-slate-700 rounded-lg">
                        <p className="text-gray-500 dark:text-gray-400">Aucun message</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">⏳</div>
                <p className="text-gray-500">Chargement des statistiques...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Panneau de debug pour admin (visible partout)
  const DebugPanel = () => {
    if (!user?.is_admin || debugLogs.length === 0) return null;

    return (
      <div className="fixed bottom-4 right-4 z-50 bg-black bg-opacity-90 text-white p-3 rounded-lg max-w-md w-full max-h-64 overflow-y-auto text-xs font-mono shadow-2xl">
        <div className="flex justify-between items-center mb-2 border-b border-gray-600 pb-2">
          <span className="font-bold">🐛 Debug Logs (Admin)</span>
          <button onClick={() => setDebugLogs([])} className="text-red-400 hover:text-red-300">✖</button>
        </div>
        {debugLogs.map((log, i) => (
          <div key={i} className={`py-1 ${log.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
            <span className="text-gray-500">{log.timestamp}</span> {log.message}
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <DebugPanel />
      {null}
    </>
  );

  // Note: Le code ci-dessus ne devrait jamais être atteint car toutes les vues font un return
  // Le composant ImageViewer doit être ajouté dans chaque vue qui l'utilise
};

// Mount the app into the #root element
const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<BirdPokedex />);
}