# Docker Quick Actions

Extension VSCode pour gérer les containers Docker directement depuis l'éditeur.

## Fonctionnalités

- **Sidebar TreeView** : Liste des containers avec icônes colorées selon le statut (running/stopped/paused)
- **Actions rapides** : Start, Stop, Restart, Remove via clic droit ou Command Palette
- **Logs en temps réel** : Panel Webview avec streaming, auto-scroll et bouton clear
- **Terminal intégré** : Exec bash directement dans un container
- **Refresh automatique** : Mise à jour toutes les 5 secondes
- **Notifications** : Feedback visuel succès/erreur pour chaque action

### Container Resources Monitor

- **Stats inline** : CPU et RAM affichés directement dans la sidebar pour chaque container running
- **Dashboard temps réel** : Panel WebView avec graphiques CPU et Memory (Chart.js) pour tous les containers
- **Métriques collectées** : CPU %, RAM (usage/limite/%), Network I/O (RX/TX), Disk I/O (Read/Write)
- **Icône warning** : Icône jaune automatique si CPU ou RAM dépasse 80%
- **Alertes** : Notification si CPU > 80% pendant 30s ou RAM > 90% pendant 10s, avec bouton "View Monitor"
- **Export** : Rapport des stats au format CSV ou JSON
- **Toggle** : Activation/désactivation des stats inline via clic droit ou bouton toolbar

## Prérequis

- VSCode 1.80+
- Docker Desktop installé et démarré

## Installation

```bash
npm install
```

## Développement

**Option 1 — Lancement direct** (recommandé)
```bash
npm run dev
```
Compile et ouvre automatiquement une fenêtre Cursor avec l'extension chargée.

**Option 2 — Mode watch** (rechargement automatique à chaque sauvegarde)
```bash
npm run watch
```
Puis dans le panneau **Run & Debug** (`Ctrl+Shift+D`), sélectionne **"Run Extension (watch)"** et clique ▶.
Après chaque modification sauvegardée, recharge avec `Ctrl+Shift+F5` dans la fenêtre de test.

**Option 3 — F5 classique**
Dans le panneau Run & Debug, sélectionne **"Run Extension"** et clique ▶.

## Commandes

| Commande | Description | Raccourci |
|----------|-------------|-----------|
| `Docker: Refresh Containers` | Rafraîchir la liste | `Ctrl+Shift+Alt+R` |
| `Docker: Start Container` | Démarrer un container | - |
| `Docker: Stop Container` | Arrêter un container | - |
| `Docker: Restart Container` | Redémarrer un container | - |
| `Docker: Remove Container` | Supprimer un container | - |
| `Docker: View Logs` | Voir les logs en temps réel | - |
| `Docker: Exec Bash` | Ouvrir un terminal dans le container | - |
| `Docker: Show Resources Monitor` | Ouvrir le dashboard de métriques | `Ctrl+Shift+Alt+M` |
| `Docker: Toggle Stats in TreeView` | Activer/désactiver les stats inline | clic droit |
| `Docker: Export Stats Report` | Exporter les stats en CSV ou JSON | - |

## Packager en .vsix

```bash
npm run package
```

## Stack technique

- TypeScript
- VSCode Extension API (TreeView, Webview, Terminal)
- dockerode
- Chart.js (dashboard métriques)
