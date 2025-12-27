#!/usr/bin/env python3
"""
Script pour générer les icônes PWA à partir du logo existant
"""
import os
from PIL import Image

# Tailles d'icônes requises pour PWA
ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

def generate_icons():
    """Génère toutes les icônes PWA depuis le logo"""
    logo_path = '/home/user/Birdex/static/logo.png'
    icons_dir = '/home/user/Birdex/static/icons'

    # Créer le dossier icons s'il n'existe pas
    os.makedirs(icons_dir, exist_ok=True)

    # Ouvrir l'image source
    try:
        img = Image.open(logo_path)
        print(f"✓ Logo chargé: {img.size}")

        # Convertir en RGBA si nécessaire
        if img.mode != 'RGBA':
            img = img.convert('RGBA')

        # Générer chaque taille
        for size in ICON_SIZES:
            # Créer une nouvelle image avec la taille cible
            resized = img.resize((size, size), Image.Resampling.LANCZOS)

            # Sauvegarder
            output_path = os.path.join(icons_dir, f'icon-{size}x{size}.png')
            resized.save(output_path, 'PNG', optimize=True)
            print(f"✓ Icône générée: {size}x{size}")

        print(f"\n✓ Toutes les icônes ont été générées dans {icons_dir}")
        return True

    except Exception as e:
        print(f"✗ Erreur: {e}")
        return False

if __name__ == '__main__':
    generate_icons()
