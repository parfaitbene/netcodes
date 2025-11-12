# Installation sur Windows

## Problème : Module natif better-sqlite3

Sur Windows, `better-sqlite3` nécessite des outils de compilation C++ pour être construit.

## Solution : Installer Visual Studio Build Tools

### Méthode 1 : Installation automatique (Recommandé)

Exécutez cette commande dans PowerShell en mode Administrateur :

```powershell
npm install --global windows-build-tools
```

Cette commande installera automatiquement :
- Python
- Visual Studio Build Tools

**Note**: Cela peut prendre 15-30 minutes.

### Méthode 2 : Installation manuelle

1. Téléchargez **Visual Studio Build Tools** depuis :
   https://visualstudio.microsoft.com/fr/downloads/

2. Pendant l'installation, sélectionnez :
   - ✅ "Développement Desktop en C++"
   - ✅ "Outils de build MSVC"
   - ✅ "SDK Windows 10/11"

3. Redémarrez votre terminal/IDE

### Après l'installation

Une fois les Build Tools installés, exécutez :

```bash
# Nettoyer les modules
npm clean-install

# Ou simplement
npm install
```

Puis lancez l'application :

```bash
npm run electron:dev
```

## Alternative : Utiliser une version précompilée

Si vous ne pouvez pas installer Visual Studio Build Tools, vous pouvez utiliser une version plus ancienne de better-sqlite3 qui a des binaires précompilés, ou utiliser une alternative comme `sql.js` (qui n'est pas native mais plus lente).
