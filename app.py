from flask import Flask, jsonify, request, render_template, session, make_response, send_from_directory
import json
import sqlite3
import hashlib
import secrets
import uuid
import os
import io
import base64
from PIL import Image
from functools import lru_cache, wraps
from flask_caching import Cache
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_cors import CORS
from datetime import datetime
import logging
import bleach

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Obtenir le répertoire du script
basedir = os.path.abspath(os.path.dirname(__file__))

app = Flask(__name__,
            static_folder=os.path.join(basedir, 'static'),
            template_folder=os.path.join(basedir, 'templates'))

# Utiliser une clé secrète persistante (stockée dans un fichier)
SECRET_KEY_FILE = os.path.join(basedir, '.secret_key')
if os.path.exists(SECRET_KEY_FILE):
    with open(SECRET_KEY_FILE, 'r') as f:
        app.secret_key = f.read().strip()
else:
    # Générer une nouvelle clé et la sauvegarder
    app.secret_key = secrets.token_hex(32)
    with open(SECRET_KEY_FILE, 'w') as f:
        f.write(app.secret_key)

# Configuration des sessions avec cookies persistants
# IMPORTANT: None pour SameSite permet aux cookies de fonctionner en mode PWA
app.config['SESSION_COOKIE_SECURE'] = True  # HTTPS activé via Nginx
app.config['SESSION_COOKIE_HTTPONLY'] = True  # Sécurité contre XSS
app.config['SESSION_COOKIE_SAMESITE'] = None  # None pour PWA (au lieu de 'Lax')
app.config['PERMANENT_SESSION_LIFETIME'] = 2592000  # 30 jours en secondes

# Augmenter la limite de taille pour les POST avec images
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB

# Configuration du cache
app.config['CACHE_TYPE'] = 'SimpleCache'
app.config['CACHE_DEFAULT_TIMEOUT'] = 300
cache = Cache(app)

# Configuration du rate limiting
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

# Configuration CORS (autoriser uniquement votre domaine en production)
CORS(app,
     supports_credentials=True,
     origins=["*"],  # TODO: Remplacer par votre domaine en production
     allow_headers=["Content-Type", "Authorization"],
     methods=["GET", "POST", "PUT", "DELETE"])

# Note: CSRF désactivé pour API REST JSON
# La sécurité est assurée par SESSION_COOKIE_HTTPONLY + SESSION_COOKIE_SAMESITE + HTTPS

# Fonction de sanitisation contre XSS
def sanitize_input(text):
    """Nettoie les entrées utilisateur pour éviter les attaques XSS"""
    if not text or not isinstance(text, str):
        return text
    return bleach.clean(text, tags=[], strip=True)

# Chemin de la base de données
DB_PATH = os.path.join(basedir, 'ornithedex_v2.db')

# ============================================================================
# NOUVEAU MODÈLE DE BASE DE DONNÉES (avec toutes les migrations intégrées)
# ============================================================================

def init_db():
    """Initialise la base de données avec le nouveau schéma optimisé"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Table des utilisateurs (COMPLÈTE avec toutes les migrations)
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        theme TEXT DEFAULT 'pokemon',
        is_admin INTEGER DEFAULT 0,
        share_token TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')

    # Table des découvertes (OPTIMISÉE - stocke uniquement les métadonnées)
    c.execute('''CREATE TABLE IF NOT EXISTS discoveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        bird_number TEXT NOT NULL,
        discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, bird_number)
    )''')

    # Table des photos (NOUVELLE - stockage optimisé séparé)
    c.execute('''CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discovery_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        bird_number TEXT NOT NULL,
        photo_data TEXT NOT NULL,
        photo_thumbnail TEXT,
        location TEXT,
        city TEXT,
        region TEXT,
        country TEXT,
        coordinates TEXT,
        date TEXT,
        sex TEXT,
        note TEXT,
        file_size INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (discovery_id) REFERENCES discoveries(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )''')

    # Index pour optimiser les requêtes
    c.execute('CREATE INDEX IF NOT EXISTS idx_photos_user_bird ON photos(user_id, bird_number)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_photos_discovery ON photos(discovery_id)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_discoveries_user ON discoveries(user_id)')

    # Table de statistiques (pour les admins)
    c.execute('''CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )''')

    # Table des messages (contact utilisateur -> admin)
    c.execute('''CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )''')

    # Index pour optimiser les requêtes
    c.execute('CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(is_read)')

    # Créer le compte admin par défaut s'il n'existe pas
    admin_username = 'admin'
    admin_password = 'policebox2025#'
    admin_exists = c.execute("SELECT id FROM users WHERE username = ?", (admin_username,)).fetchone()

    if not admin_exists:
        admin_password_hash = hashlib.sha256(admin_password.encode()).hexdigest()
        c.execute("""
            INSERT INTO users (username, password_hash, is_admin)
            VALUES (?, ?, 1)
        """, (admin_username, admin_password_hash))
        print(f"✓ Compte admin créé : {admin_username}")
    else:
        print(f"✓ Compte admin existe déjà : {admin_username}")

    conn.commit()
    conn.close()
    print("OK Base de donnees initialisee avec le nouveau schema")

# Initialiser la DB au démarrage
init_db()

# Migration: Ajouter la colonne show_map si elle n'existe pas
def add_show_map_column():
    """Ajoute la colonne show_map à la table users"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    try:
        # Vérifier si la colonne existe déjà
        c.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in c.fetchall()]

        if 'show_map' not in columns:
            c.execute("ALTER TABLE users ADD COLUMN show_map INTEGER DEFAULT 1")
            conn.commit()
            logger.info("✓ Colonne show_map ajoutée à la table users")
    except Exception as e:
        logger.error(f"Erreur lors de l'ajout de la colonne show_map: {e}")
    finally:
        conn.close()

add_show_map_column()

# ============================================================================
# MIDDLEWARE DE LOGGING ET DEBUGGING
# ============================================================================

@app.before_request
def log_request_info():
    """Log uniquement les POST pour debugging"""
    if request.method == 'POST':
        logger.info('='*60)
        logger.info(f'POST {request.path}')
        logger.info(f'Session: user_id={session.get("user_id")}')
        logger.info(f'Cookies: {list(request.cookies.keys())}')

@app.after_request
def log_response_info(response):
    """Log uniquement les réponses POST"""
    if request.method == 'POST':
        logger.info(f'→ RESPONSE: {response.status}')
        logger.info('='*60)
    return response

# ============================================================================
# SYSTÈME DE COMPRESSION D'IMAGES OPTIMISÉ
# ============================================================================

def compress_image(image_data, max_size=(800, 800), quality=85):
    """
    Compresse une image en base64 de manière optimisée
    Args:
        image_data: Image en base64 (avec ou sans header data:)
        max_size: Taille maximale (largeur, hauteur)
        quality: Qualité JPEG (1-100)
    Returns:
        dict: {
            'full': image complète en base64,
            'thumbnail': miniature en base64,
            'size': taille en octets
        }
    """
    try:
        # Nettoyer les données d'entrée
        if not image_data:
            raise ValueError("Données d'image vides")

        # Extraire le header et les données
        header = 'data:image/jpeg;base64,'
        if ',' in image_data:
            parts = image_data.split(',', 1)
            if len(parts) == 2:
                header, image_data = parts
                header += ','
            else:
                raise ValueError("Format de données invalide")

        # Décoder le base64
        try:
            img_bytes = base64.b64decode(image_data)
        except Exception as e:
            raise ValueError(f"Erreur de décodage base64: {e}")

        # Ouvrir l'image avec Pillow
        img = Image.open(io.BytesIO(img_bytes))

        # Convertir en RGB si nécessaire
        if img.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            if img.mode in ('RGBA', 'LA'):
                background.paste(img, mask=img.split()[-1])
            else:
                background.paste(img)
            img = background

        # Créer l'image complète compressée
        img_full = img.copy()
        img_full.thumbnail(max_size, Image.Resampling.LANCZOS)

        output_full = io.BytesIO()
        img_full.save(output_full, format='JPEG', quality=quality, optimize=True)
        full_data = base64.b64encode(output_full.getvalue()).decode('utf-8')
        full_size = len(output_full.getvalue())

        # Créer la miniature (200x200)
        img_thumb = img.copy()
        img_thumb.thumbnail((200, 200), Image.Resampling.LANCZOS)

        output_thumb = io.BytesIO()
        img_thumb.save(output_thumb, format='JPEG', quality=75, optimize=True)
        thumb_data = base64.b64encode(output_thumb.getvalue()).decode('utf-8')

        return {
            'full': f"{header}{full_data}",
            'thumbnail': f"{header}{thumb_data}",
            'size': full_size
        }

    except Exception as e:
        print(f"Erreur compression image: {e}")
        # Retourner une structure par défaut en cas d'erreur
        return {
            'full': image_data if ',' in str(image_data) else f"data:image/jpeg;base64,{image_data}",
            'thumbnail': None,
            'size': 0
        }

# ============================================================================
# FONCTIONS UTILITAIRES
# ============================================================================

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

@lru_cache(maxsize=1)
def load_birds_data():
    with open(os.path.join(basedir, 'static', 'oiseau.json'), 'r', encoding='utf-8') as f:
        return json.load(f)

birds_data = load_birds_data()

# ============================================================================
# ROUTES PRINCIPALES
# ============================================================================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/share/<token>')
def share_profile(token):
    return render_template('share.html')

# ============================================================================
# PWA SUPPORT
# ============================================================================

@app.route('/service-worker.js')
@app.route('/sw.js')
def service_worker():
    """Serve service worker with correct MIME type"""
    response = make_response(send_from_directory('static', 'sw.js'))
    response.headers['Content-Type'] = 'application/javascript'
    response.headers['Service-Worker-Allowed'] = '/'
    return response

@app.route('/manifest.json')
def manifest():
    """Serve manifest with correct MIME type"""
    response = make_response(send_from_directory('static', 'manifest.json'))
    response.headers['Content-Type'] = 'application/manifest+json'
    return response

# ============================================================================

@app.route('/api/birds')
@cache.cached(timeout=600)
def get_birds():
    return jsonify(birds_data)

# ============================================================================
# AUTHENTIFICATION
# ============================================================================

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    username = sanitize_input(data.get('username'))
    password = data.get('password')  # Ne pas sanitiser le password (permet caractères spéciaux)

    if not username or not password:
        return jsonify({"error": "Username et password requis"}), 400

    if len(username) < 3:
        return jsonify({"error": "Username doit contenir au moins 3 caractères"}), 400

    if len(password) < 6:
        return jsonify({"error": "Le mot de passe doit contenir au moins 6 caractères"}), 400

    conn = get_db()
    try:
        c = conn.cursor()
        password_hash = hash_password(password)
        c.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)",
                  (username, password_hash))
        conn.commit()
        user_id = c.lastrowid

        session.permanent = True
        session['user_id'] = user_id
        session['username'] = username

        return jsonify({"success": True, "username": username})
    except sqlite3.IntegrityError:
        return jsonify({"error": "Ce nom d'utilisateur existe déjà"}), 400
    finally:
        conn.close()

@app.route('/api/auth/login', methods=['POST'])
@limiter.limit("5 per minute")  # Protection contre le brute-force
def login():
    data = request.json
    username = sanitize_input(data.get('username'))
    password = data.get('password')

    if not username or not password:
        return jsonify({"error": "Username et password requis"}), 400

    conn = get_db()
    c = conn.cursor()
    password_hash = hash_password(password)

    user = c.execute("SELECT * FROM users WHERE username = ? AND password_hash = ?",
                     (username, password_hash)).fetchone()
    conn.close()

    if user:
        session.permanent = True
        session['user_id'] = user['id']
        session['username'] = user['username']
        return jsonify({"success": True, "username": user['username']})
    else:
        return jsonify({"error": "Identifiants incorrects"}), 401

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"success": True})

@app.route('/api/auth/me')
def get_current_user():
    if 'user_id' in session:
        conn = get_db()
        c = conn.cursor()
        user = c.execute("SELECT theme, is_admin FROM users WHERE id = ?",
                        (session['user_id'],)).fetchone()
        conn.close()

        return jsonify({
            "logged_in": True,
            "username": session['username'],
            "user_id": session['user_id'],
            "theme": user['theme'] if user else 'pokemon',
            "is_admin": bool(user['is_admin']) if user else False
        })
    else:
        return jsonify({"logged_in": False})

@app.route('/api/debug/session', methods=['GET'])
def debug_session():
    """Endpoint de debugging pour vérifier l'état de la session"""
    return jsonify({
        "session_data": dict(session),
        "session_keys": list(session.keys()),
        "has_user_id": 'user_id' in session,
        "cookies": list(request.cookies.keys()),
        "headers": {
            "user-agent": request.headers.get('User-Agent'),
            "origin": request.headers.get('Origin'),
            "referer": request.headers.get('Referer'),
            "cookie": bool(request.headers.get('Cookie'))
        }
    })

# ============================================================================
# GESTION DES DÉCOUVERTES (NOUVEAU SYSTÈME)
# ============================================================================

@app.route('/api/discoveries', methods=['GET'])
def get_discoveries():
    """Récupère les découvertes de l'utilisateur (nouveau format)"""
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    user_id = session['user_id']
    cache_key = f'discoveries_v2_{user_id}'

    # Vérifier le cache
    cached = cache.get(cache_key)
    if cached:
        return jsonify(cached)

    conn = get_db()
    c = conn.cursor()

    # Récupérer toutes les découvertes avec leurs photos
    discoveries = c.execute("""
        SELECT d.bird_number, d.discovered_at,
               p.id as photo_id, p.photo_data, p.photo_thumbnail,
               p.location, p.city, p.region, p.country, p.coordinates,
               p.date, p.sex, p.note
        FROM discoveries d
        LEFT JOIN photos p ON d.id = p.discovery_id
        WHERE d.user_id = ?
        ORDER BY d.bird_number, p.created_at
    """, (user_id,)).fetchall()

    conn.close()

    # Organiser les données par oiseau
    result = {}
    for row in discoveries:
        bird_num = row['bird_number']

        if bird_num not in result:
            result[bird_num] = {
                'discovered_at': row['discovered_at'],
                'photos': []
            }

        # Ajouter la photo si elle existe
        if row['photo_id']:
            # Convertir les coordonnées JSON string en dict
            coordinates = row['coordinates']
            if coordinates and isinstance(coordinates, str):
                try:
                    coordinates = json.loads(coordinates)
                except:
                    coordinates = ''

            result[bird_num]['photos'].append({
                'id': row['photo_id'],
                'photo': row['photo_data'],
                'thumbnail': row['photo_thumbnail'],
                'location': row['location'],
                'city': row['city'],
                'region': row['region'],
                'country': row['country'],
                'coordinates': coordinates,
                'date': row['date'],
                'sex': row['sex'],
                'note': row['note']
            })

    # Mettre en cache
    cache.set(cache_key, result, timeout=300)

    return jsonify(result)

@app.route('/api/discoveries', methods=['POST'])
def save_discoveries():
    """Sauvegarde les découvertes (nouveau système)"""
    if 'user_id' not in session:
        logger.error(f"❌ Non authentifié - cookies: {list(request.cookies.keys())}")
        return jsonify({"error": "Non authentifié"}), 401

    user_id = session['user_id']
    data = request.json

    if not data:
        logger.error("❌ Aucune donnée reçue")
        return jsonify({"error": "Aucune donnée"}), 400

    logger.info(f"💾 Saving {len(data)} birds for user_id={user_id}")

    conn = get_db()
    c = conn.cursor()

    try:
        # Pour chaque oiseau découvert
        for bird_number, bird_data in data.items():
            # Créer ou récupérer la découverte
            discovery = c.execute("""
                SELECT id FROM discoveries
                WHERE user_id = ? AND bird_number = ?
            """, (user_id, bird_number)).fetchone()

            if not discovery:
                c.execute("""
                    INSERT INTO discoveries (user_id, bird_number)
                    VALUES (?, ?)
                """, (user_id, bird_number))
                discovery_id = c.lastrowid
            else:
                discovery_id = discovery['id']
                c.execute("""
                    UPDATE discoveries
                    SET updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (discovery_id,))

            # Supprimer les anciennes photos pour cet oiseau (évite les doublons)
            c.execute("""
                DELETE FROM photos
                WHERE discovery_id = ? AND user_id = ?
            """, (discovery_id, user_id))

            # Traiter les photos
            if 'photos' in bird_data and isinstance(bird_data['photos'], list):
                for photo_data in bird_data['photos']:
                    if 'photo' not in photo_data or not photo_data['photo']:
                        continue

                    # Compresser l'image seulement si c'est une nouvelle photo (pas déjà compressée)
                    photo_to_save = photo_data['photo']
                    if 'id' not in photo_data:
                        # Nouvelle photo : compresser
                        compressed = compress_image(photo_data['photo'])
                        photo_to_save = compressed['full']
                        thumbnail = compressed['thumbnail']
                        file_size = compressed['size']
                    else:
                        # Photo existante : garder telle quelle
                        thumbnail = photo_data.get('thumbnail', '')
                        file_size = 0

                    # Convertir les coordonnées en JSON string si c'est un dict
                    coordinates = photo_data.get('coordinates', '')
                    if isinstance(coordinates, dict):
                        coordinates = json.dumps(coordinates)

                    # Sauvegarder la photo (avec protection XSS sur les champs texte)
                    c.execute("""
                        INSERT INTO photos (
                            discovery_id, user_id, bird_number,
                            photo_data, photo_thumbnail, file_size,
                            location, city, region, country, coordinates,
                            date, sex, note
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        discovery_id, user_id, bird_number,
                        photo_to_save, thumbnail, file_size,
                        sanitize_input(photo_data.get('location', '')),
                        sanitize_input(photo_data.get('city', '')),
                        sanitize_input(photo_data.get('region', '')),
                        sanitize_input(photo_data.get('country', '')),
                        coordinates,
                        sanitize_input(photo_data.get('date', '')),
                        sanitize_input(photo_data.get('sex', '')),
                        sanitize_input(photo_data.get('note', ''))
                    ))

        conn.commit()
        logger.info(f"✓ Données sauvegardées avec succès pour user_id={user_id}")

        # Invalider le cache
        cache.delete(f'discoveries_v2_{user_id}')
        cache.delete(f'metadata_v2_{user_id}')
        cache.delete(f'discoveries_light_{user_id}')

        return jsonify({"status": "success"})

    except Exception as e:
        conn.rollback()
        logger.error(f"ERREUR lors de la sauvegarde: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

# ============================================================================
# MÉTADONNÉES ET STATISTIQUES
# ============================================================================

@app.route('/api/discoveries/metadata', methods=['GET'])
def discoveries_metadata():
    """Récupère uniquement les métadonnées (sans photos)"""
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    user_id = session['user_id']
    cache_key = f'metadata_v2_{user_id}'

    cached = cache.get(cache_key)
    if cached:
        return jsonify(cached)

    conn = get_db()
    c = conn.cursor()

    # Compter les découvertes et photos
    stats = c.execute("""
        SELECT
            COUNT(DISTINCT d.bird_number) as discovered_count,
            COUNT(p.id) as total_photos,
            SUM(p.file_size) as total_size
        FROM discoveries d
        LEFT JOIN photos p ON d.id = p.discovery_id
        WHERE d.user_id = ?
    """, (user_id,)).fetchone()

    # Détails par oiseau
    birds = c.execute("""
        SELECT
            d.bird_number,
            COUNT(p.id) as photo_count,
            GROUP_CONCAT(p.date) as dates,
            MAX(CASE WHEN p.coordinates != '' THEN 1 ELSE 0 END) as has_gps
        FROM discoveries d
        LEFT JOIN photos p ON d.id = p.discovery_id
        WHERE d.user_id = ?
        GROUP BY d.bird_number
    """, (user_id,)).fetchall()

    result = {
        "discovered_count": stats['discovered_count'] or 0,
        "total_photos": stats['total_photos'] or 0,
        "total_size_mb": round((stats['total_size'] or 0) / (1024 * 1024), 2),
        "birds": {}
    }

    for bird in birds:
        result["birds"][bird['bird_number']] = {
            "photo_count": bird['photo_count'],
            "dates": bird['dates'].split(',') if bird['dates'] else [],
            "has_gps": bool(bird['has_gps'])
        }

    conn.close()

    cache.set(cache_key, result, timeout=120)
    return jsonify(result)

# ============================================================================
# GALERIE PAGINÉE
# ============================================================================

@app.route('/api/discoveries/gallery', methods=['GET'])
def discoveries_gallery():
    """Galerie paginée avec miniatures"""
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    user_id = session['user_id']
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 12))

    conn = get_db()
    c = conn.cursor()

    # Compter le total
    total = c.execute("""
        SELECT COUNT(*) as count
        FROM photos
        WHERE user_id = ?
    """, (user_id,)).fetchone()['count']

    # Récupérer les photos avec pagination
    photos = c.execute("""
        SELECT
            p.id, p.bird_number, p.photo_thumbnail,
            p.date, p.location, p.city
        FROM photos p
        WHERE p.user_id = ?
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?
    """, (user_id, per_page, (page - 1) * per_page)).fetchall()

    conn.close()

    total_pages = (total + per_page - 1) // per_page

    return jsonify({
        "photos": [dict(row) for row in photos],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages
    })

# ============================================================================
# COMPATIBILITE AVEC L'ANCIEN FRONTEND
# ============================================================================

@app.route('/api/discoveries/light', methods=['GET'])
def get_discoveries_light():
    """Endpoint de compatibilite - retourne les decouvertes avec photos completes"""
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifie"}), 401

    user_id = session['user_id']
    cache_key = f'discoveries_light_{user_id}'

    cached = cache.get(cache_key)
    if cached:
        return jsonify(cached)

    conn = get_db()
    c = conn.cursor()

    discoveries = c.execute("""
        SELECT d.bird_number, d.discovered_at,
               p.id as photo_id, p.photo_data, p.photo_thumbnail,
               p.location, p.city, p.region, p.country, p.coordinates,
               p.date, p.sex, p.note
        FROM discoveries d
        LEFT JOIN photos p ON d.id = p.discovery_id
        WHERE d.user_id = ?
        ORDER BY d.bird_number, p.created_at
    """, (user_id,)).fetchall()

    conn.close()

    # Organiser par oiseau avec photos completes
    result = {}
    for row in discoveries:
        bird_num = row['bird_number']

        if bird_num not in result:
            result[bird_num] = {'photos': []}

        if row['photo_id']:
            # Convertir les coordonnées JSON string en dict
            coordinates = row['coordinates']
            if coordinates and isinstance(coordinates, str):
                try:
                    coordinates = json.loads(coordinates)
                except:
                    coordinates = ''

            result[bird_num]['photos'].append({
                'id': row['photo_id'],
                'photo': row['photo_data'],  # Photo complete en base64
                'thumbnail': row['photo_thumbnail'],
                'location': row['location'],
                'city': row['city'],
                'region': row['region'],
                'country': row['country'],
                'coordinates': coordinates,
                'date': row['date'],
                'sex': row['sex'],
                'note': row['note']
            })

    cache.set(cache_key, result, timeout=300)
    return jsonify(result)

@app.route('/api/photo/<bird_number>/<int:photo_id>', methods=['GET'])
def get_photo(bird_number, photo_id):
    """Endpoint pour servir une photo individuelle"""
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifie"}), 401

    user_id = session['user_id']
    conn = get_db()
    c = conn.cursor()

    photo = c.execute("""
        SELECT photo_data
        FROM photos
        WHERE id = ? AND user_id = ? AND bird_number = ?
    """, (photo_id, user_id, bird_number)).fetchone()

    conn.close()

    if not photo:
        return jsonify({"error": "Photo non trouvee"}), 404

    return jsonify({"photo": photo['photo_data']})

# ============================================================================
# GESTION DU THÈME
# ============================================================================

@app.route('/api/theme', methods=['POST'])
def update_theme():
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    data = request.json
    theme = data.get('theme')

    if theme not in ['pokemon', 'dark', 'white']:
        return jsonify({"error": "Thème invalide"}), 400

    user_id = session['user_id']
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE users SET theme = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
              (theme, user_id))
    conn.commit()
    conn.close()

    return jsonify({"status": "success", "theme": theme})

@app.route('/api/share/show-map', methods=['POST'])
def update_show_map():
    """Active ou désactive l'affichage de la carte sur le profil public"""
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    data = request.json
    show_map = data.get('show_map', 1)

    # Convertir en entier (0 ou 1)
    show_map = 1 if show_map else 0

    user_id = session['user_id']
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE users SET show_map = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
              (show_map, user_id))
    conn.commit()
    conn.close()

    logger.info(f"User {session['username']} a {'activé' if show_map else 'désactivé'} la carte sur son profil public")
    return jsonify({"status": "success", "show_map": show_map})

# ============================================================================
# PARTAGE
# ============================================================================

@app.route('/api/share/token', methods=['GET'])
def get_share_token():
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    user_id = session['user_id']
    conn = get_db()
    c = conn.cursor()

    user = c.execute("SELECT share_token, show_map FROM users WHERE id = ?", (user_id,)).fetchone()

    if not user or not user['share_token']:
        share_token = str(uuid.uuid4())
        c.execute("UPDATE users SET share_token = ? WHERE id = ?", (share_token, user_id))
        conn.commit()
    else:
        share_token = user['share_token']

    show_map = user['show_map'] if user['show_map'] is not None else 1

    conn.close()
    return jsonify({"share_token": share_token, "show_map": show_map})

@app.route('/api/share/regenerate', methods=['POST'])
def regenerate_share_token():
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    user_id = session['user_id']
    share_token = str(uuid.uuid4())

    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE users SET share_token = ? WHERE id = ?", (share_token, user_id))
    conn.commit()
    conn.close()

    return jsonify({"share_token": share_token})

@app.route('/api/share/<token>', methods=['GET'])
def get_shared_profile(token):
    conn = get_db()
    c = conn.cursor()

    user = c.execute("""
        SELECT id, username, created_at, theme, show_map
        FROM users
        WHERE share_token = ?
    """, (token,)).fetchone()

    if not user:
        conn.close()
        return jsonify({"error": "Profil non trouvé"}), 404

    # Récupérer les découvertes
    discoveries = c.execute("""
        SELECT d.bird_number,
               p.photo_data, p.location, p.city, p.region,
               p.country, p.coordinates, p.date, p.sex, p.note
        FROM discoveries d
        LEFT JOIN photos p ON d.id = p.discovery_id
        WHERE d.user_id = ?
        ORDER BY d.bird_number, p.created_at
    """, (user['id'],)).fetchall()

    conn.close()

    # Organiser les données
    discoveries_data = {}
    for row in discoveries:
        bird_num = row['bird_number']

        # Créer l'entrée pour l'oiseau si elle n'existe pas
        if bird_num not in discoveries_data:
            discoveries_data[bird_num] = {'photos': []}

        # Ajouter la photo uniquement si elle existe
        if row['photo_data']:
            # Convertir les coordonnées JSON string en dict
            coordinates = row['coordinates']
            if coordinates and isinstance(coordinates, str):
                try:
                    coordinates = json.loads(coordinates)
                except:
                    coordinates = ''

            discoveries_data[bird_num]['photos'].append({
                'photo': row['photo_data'],
                'location': row['location'],
                'city': row['city'],
                'region': row['region'],
                'country': row['country'],
                'coordinates': coordinates,
                'date': row['date'],
                'sex': row['sex'],
                'note': row['note']
            })

    return jsonify({
        "username": user['username'],
        "member_since": user['created_at'],
        "theme": user['theme'] or 'pokemon',
        "show_map": user['show_map'] if user['show_map'] is not None else 1,
        "discovered_count": len(discoveries_data),
        "total_photos": sum(len(d['photos']) for d in discoveries_data.values()),
        "discoveries": discoveries_data
    })

# ============================================================================
# ADMIN
# ============================================================================

@app.route('/api/admin/stats', methods=['GET'])
def get_admin_stats():
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    conn = get_db()
    c = conn.cursor()

    user = c.execute("SELECT is_admin FROM users WHERE id = ?",
                    (session['user_id'],)).fetchone()

    if not user or not user['is_admin']:
        conn.close()
        return jsonify({"error": "Accès refusé - Admin requis"}), 403

    # Statistiques
    total_users = c.execute("SELECT COUNT(*) as count FROM users").fetchone()['count']
    total_discoveries = c.execute("SELECT COUNT(*) as count FROM discoveries").fetchone()['count']
    total_photos = c.execute("SELECT COUNT(*) as count FROM photos").fetchone()['count']

    storage = c.execute("SELECT SUM(file_size) as total FROM photos").fetchone()
    storage_mb = (storage['total'] or 0) / (1024 * 1024)

    user_stats = c.execute("""
        SELECT u.id, u.username, u.created_at,
               COUNT(DISTINCT d.id) as discoveries_count,
               COUNT(p.id) as photos_count,
               SUM(p.file_size) as storage_used
        FROM users u
        LEFT JOIN discoveries d ON u.id = d.user_id
        LEFT JOIN photos p ON u.id = p.user_id
        GROUP BY u.id
        ORDER BY u.created_at DESC
    """).fetchall()

    conn.close()

    return jsonify({
        "total_users": total_users,
        "total_discoveries": total_discoveries,
        "total_photos": total_photos,
        "storage_mb": round(storage_mb, 2),
        "users": [dict(row) for row in user_stats]
    })

@app.route('/api/admin/promote/<int:user_id>', methods=['POST'])
def promote_user(user_id):
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    conn = get_db()
    c = conn.cursor()

    user = c.execute("SELECT is_admin FROM users WHERE id = ?",
                    (session['user_id'],)).fetchone()

    if not user or not user['is_admin']:
        conn.close()
        return jsonify({"error": "Accès refusé - Admin requis"}), 403

    c.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

    return jsonify({"status": "success"})

@app.route('/api/admin/reset-password/<int:user_id>', methods=['POST'])
@limiter.limit("10 per hour")
def admin_reset_password(user_id):
    """Admin peut réinitialiser le mot de passe d'un utilisateur"""
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    conn = get_db()
    c = conn.cursor()

    # Vérifier que c'est un admin
    admin = c.execute("SELECT is_admin FROM users WHERE id = ?",
                     (session['user_id'],)).fetchone()

    if not admin or not admin['is_admin']:
        conn.close()
        return jsonify({"error": "Accès refusé - Admin requis"}), 403

    # Vérifier que l'utilisateur cible existe
    target_user = c.execute("SELECT username FROM users WHERE id = ?",
                           (user_id,)).fetchone()

    if not target_user:
        conn.close()
        return jsonify({"error": "Utilisateur non trouvé"}), 404

    # Générer un mot de passe temporaire
    temp_password = secrets.token_urlsafe(12)  # Mot de passe aléatoire sécurisé
    password_hash = hash_password(temp_password)

    # Mettre à jour le mot de passe
    c.execute("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
              (password_hash, user_id))
    conn.commit()
    conn.close()

    logger.info(f"Admin {session['username']} a réinitialisé le mot de passe de l'utilisateur {target_user['username']}")

    return jsonify({
        "status": "success",
        "username": target_user['username'],
        "temporary_password": temp_password,
        "message": "Mot de passe réinitialisé. Communiquez ce mot de passe temporaire à l'utilisateur."
    })

@app.route('/api/auth/change-password', methods=['POST'])
@limiter.limit("5 per hour")
def change_password():
    """Permet à un utilisateur de changer son propre mot de passe"""
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    data = request.json
    current_password = data.get('current_password')
    new_password = data.get('new_password')

    if not current_password or not new_password:
        return jsonify({"error": "Mot de passe actuel et nouveau requis"}), 400

    if len(new_password) < 6:
        return jsonify({"error": "Le nouveau mot de passe doit contenir au moins 6 caractères"}), 400

    conn = get_db()
    c = conn.cursor()

    # Vérifier le mot de passe actuel
    user = c.execute("SELECT password_hash FROM users WHERE id = ?",
                    (session['user_id'],)).fetchone()

    if not user:
        conn.close()
        return jsonify({"error": "Utilisateur non trouvé"}), 404

    current_hash = hash_password(current_password)
    if current_hash != user['password_hash']:
        conn.close()
        return jsonify({"error": "Mot de passe actuel incorrect"}), 401

    # Mettre à jour avec le nouveau mot de passe
    new_hash = hash_password(new_password)
    c.execute("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
              (new_hash, session['user_id']))
    conn.commit()
    conn.close()

    logger.info(f"Utilisateur {session['username']} a changé son mot de passe")

    return jsonify({"status": "success", "message": "Mot de passe changé avec succès"})

# ============================================================================
# SYSTÈME DE MESSAGERIE (CONTACT UTILISATEUR -> ADMIN)
# ============================================================================

@app.route('/api/messages/send', methods=['POST'])
@limiter.limit("3 per hour")  # Limite stricte pour éviter le spam
def send_message():
    """Permet à un utilisateur d'envoyer un message à l'admin"""
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    data = request.json
    subject = sanitize_input(data.get('subject', ''))
    message = sanitize_input(data.get('message', ''))

    if not subject or not message:
        return jsonify({"error": "Sujet et message requis"}), 400

    if len(subject) < 3 or len(subject) > 100:
        return jsonify({"error": "Le sujet doit contenir entre 3 et 100 caractères"}), 400

    if len(message) < 10 or len(message) > 1000:
        return jsonify({"error": "Le message doit contenir entre 10 et 1000 caractères"}), 400

    conn = get_db()
    c = conn.cursor()

    try:
        c.execute("""
            INSERT INTO messages (user_id, username, subject, message)
            VALUES (?, ?, ?, ?)
        """, (session['user_id'], session['username'], subject, message))
        conn.commit()

        logger.info(f"Message reçu de {session['username']}: {subject[:50]}")

        return jsonify({
            "status": "success",
            "message": "Message envoyé avec succès. L'administrateur vous répondra prochainement."
        })
    except Exception as e:
        conn.rollback()
        logger.error(f"Erreur envoi message: {e}")
        return jsonify({"error": "Erreur lors de l'envoi du message"}), 500
    finally:
        conn.close()

@app.route('/api/messages/list', methods=['GET'])
def get_messages():
    """Admin: Récupérer tous les messages"""
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    conn = get_db()
    c = conn.cursor()

    # Vérifier que c'est un admin
    admin = c.execute("SELECT is_admin FROM users WHERE id = ?",
                     (session['user_id'],)).fetchone()

    if not admin or not admin['is_admin']:
        conn.close()
        return jsonify({"error": "Accès refusé - Admin requis"}), 403

    # Récupérer tous les messages, triés par date (plus récents en premier)
    messages = c.execute("""
        SELECT id, user_id, username, subject, message, is_read, created_at
        FROM messages
        ORDER BY is_read ASC, created_at DESC
    """).fetchall()

    conn.close()

    return jsonify({
        "messages": [dict(row) for row in messages],
        "total": len(messages),
        "unread": sum(1 for m in messages if not m['is_read'])
    })

@app.route('/api/messages/mark-read/<int:message_id>', methods=['POST'])
def mark_message_read(message_id):
    """Admin: Marquer un message comme lu"""
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    conn = get_db()
    c = conn.cursor()

    # Vérifier que c'est un admin
    admin = c.execute("SELECT is_admin FROM users WHERE id = ?",
                     (session['user_id'],)).fetchone()

    if not admin or not admin['is_admin']:
        conn.close()
        return jsonify({"error": "Accès refusé - Admin requis"}), 403

    # Marquer le message comme lu
    c.execute("UPDATE messages SET is_read = 1 WHERE id = ?", (message_id,))
    conn.commit()
    conn.close()

    return jsonify({"status": "success"})

@app.route('/api/messages/delete/<int:message_id>', methods=['DELETE'])
@limiter.limit("20 per hour")
def delete_message(message_id):
    """Admin: Supprimer un message"""
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    conn = get_db()
    c = conn.cursor()

    # Vérifier que c'est un admin
    admin = c.execute("SELECT is_admin FROM users WHERE id = ?",
                     (session['user_id'],)).fetchone()

    if not admin or not admin['is_admin']:
        conn.close()
        return jsonify({"error": "Accès refusé - Admin requis"}), 403

    # Supprimer le message
    c.execute("DELETE FROM messages WHERE id = ?", (message_id,))
    conn.commit()
    conn.close()

    logger.info(f"Admin {session['username']} a supprimé le message {message_id}")

    return jsonify({"status": "success"})

@app.route('/api/messages/unread-count', methods=['GET'])
def get_unread_count():
    """Admin: Récupérer le nombre de messages non lus"""
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    conn = get_db()
    c = conn.cursor()

    # Vérifier que c'est un admin
    admin = c.execute("SELECT is_admin FROM users WHERE id = ?",
                     (session['user_id'],)).fetchone()

    if not admin or not admin['is_admin']:
        conn.close()
        return jsonify({"unread": 0})

    # Compter les messages non lus
    unread = c.execute("SELECT COUNT(*) as count FROM messages WHERE is_read = 0").fetchone()
    conn.close()

    return jsonify({"unread": unread['count'] if unread else 0})

# ============================================================================
# MIGRATION DEPUIS L'ANCIEN SYSTÈME
# ============================================================================

@app.route('/api/migrate/from-old', methods=['POST'])
def migrate_from_old():
    """Migration depuis l'ancienne base de données"""
    if 'user_id' not in session:
        return jsonify({"error": "Non authentifié"}), 401

    old_db_path = os.path.join(basedir, 'ornithedex.db')

    if not os.path.exists(old_db_path):
        return jsonify({"error": "Ancienne base de données introuvable"}), 404

    try:
        # Connexion à l'ancienne base
        old_conn = sqlite3.connect(old_db_path)
        old_conn.row_factory = sqlite3.Row
        old_c = old_conn.cursor()

        # Connexion à la nouvelle base
        new_conn = get_db()
        new_c = new_conn.cursor()

        user_id = session['user_id']

        # Récupérer les anciennes découvertes
        old_discovery = old_c.execute("""
            SELECT data FROM discoveries WHERE user_id = ?
        """, (user_id,)).fetchone()

        if not old_discovery:
            old_conn.close()
            new_conn.close()
            return jsonify({"message": "Aucune donnée à migrer"})

        old_data = json.loads(old_discovery['data'])
        migrated_count = 0

        # Migrer chaque oiseau
        for bird_number, bird_data in old_data.items():
            # Créer la découverte
            new_c.execute("""
                INSERT OR IGNORE INTO discoveries (user_id, bird_number)
                VALUES (?, ?)
            """, (user_id, bird_number))

            discovery_id = new_c.execute("""
                SELECT id FROM discoveries
                WHERE user_id = ? AND bird_number = ?
            """, (user_id, bird_number)).fetchone()['id']

            # Migrer les photos
            if 'photos' in bird_data:
                for photo in bird_data['photos']:
                    if 'photo' in photo and photo['photo']:
                        compressed = compress_image(photo['photo'])

                        new_c.execute("""
                            INSERT INTO photos (
                                discovery_id, user_id, bird_number,
                                photo_data, photo_thumbnail, file_size,
                                location, city, region, country, coordinates,
                                date, sex, note
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            discovery_id, user_id, bird_number,
                            compressed['full'], compressed['thumbnail'], compressed['size'],
                            photo.get('location', ''),
                            photo.get('city', ''),
                            photo.get('region', ''),
                            photo.get('country', ''),
                            photo.get('coordinates', ''),
                            photo.get('date', ''),
                            photo.get('sex', ''),
                            photo.get('note', '')
                        ))
                        migrated_count += 1

        new_conn.commit()
        old_conn.close()
        new_conn.close()

        # Invalider le cache
        cache.delete(f'discoveries_v2_{user_id}')
        cache.delete(f'metadata_v2_{user_id}')

        return jsonify({
            "status": "success",
            "migrated_photos": migrated_count
        })

    except Exception as e:
        print(f"Erreur migration: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=10004)
