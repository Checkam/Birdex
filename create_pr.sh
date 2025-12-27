#!/bin/bash
# Script pour créer la PR via GitHub CLI (si installé)

# Vérifier si gh est installé
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI non installé"
    echo ""
    echo "📋 Créez la PR manuellement :"
    echo "1. Ouvrez : https://github.com/Checkam/Birdex/pull/new/claude/add-pwa-support-VjhAa"
    echo "2. Titre : Ajout du support PWA complet avec mode hors-ligne"
    echo "3. Description : Copiez le contenu de PR_DESCRIPTION.md"
    echo ""
    echo "💡 Pour installer GitHub CLI :"
    echo "   https://cli.github.com/manual/installation"
    exit 1
fi

# Créer la PR
gh pr create \
    --title "Ajout du support PWA complet avec mode hors-ligne" \
    --body-file PR_DESCRIPTION.md \
    --head claude/add-pwa-support-VjhAa

echo "✅ PR créée avec succès !"
