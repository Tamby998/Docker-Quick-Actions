# Docker Quick Actions

Extension VSCode pour gérer les containers Docker directement depuis l'éditeur.

## Fonctionnalités

- **Sidebar TreeView** : Liste des containers avec icônes colorées selon le statut (running/stopped/paused)
- **Actions rapides** : Start, Stop, Restart, Remove via clic droit ou Command Palette
- **Logs en temps réel** : Panel Webview avec streaming, auto-scroll et bouton clear
- **Terminal intégré** : Exec bash directement dans un container
- **Refresh automatique** : Mise à jour toutes les 5 secondes
- **Notifications** : Feedback visuel succès/erreur pour chaque action

## Prérequis

- VSCode 1.80+
- Docker Desktop installé et démarré

## Installation

```bash
# Depuis les sources
npm install
npm run compile
```

Puis `F5` dans VSCode pour lancer en mode développement.

## Commandes

| Commande | Description | Raccourci |
|----------|-------------|-----------|
| `Docker: Refresh Containers` | Rafraîchir la liste | `Cmd+Shift+D R` |
| `Docker: Start Container` | Démarrer un container | - |
| `Docker: Stop Container` | Arrêter un container | - |
| `Docker: Restart Container` | Redémarrer un container | - |
| `Docker: Remove Container` | Supprimer un container | - |
| `Docker: View Logs` | Voir les logs en temps réel | - |
| `Docker: Exec Bash` | Ouvrir un terminal dans le container | - |

## Packager en .vsix

```bash
npm run package
```

## Stack technique

- TypeScript
- VSCode Extension API (TreeView, Webview, Terminal)
- dockerode
# Docker-Quick-Actions
