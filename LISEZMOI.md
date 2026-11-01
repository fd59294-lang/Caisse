# Caisse du Comité des Fêtes

Appli de caisse autonome pour tablette Android : fonctionne sans internet, données gardées sur la tablette.

## Mise en ligne (une seule fois, gratuit)
1. github.com → **+ → New repository** → nom `caisse` → **Public** → Create.
2. **uploading an existing file** → déposer les 12 fichiers de ce dossier → **Commit changes**.
3. **Settings → Pages** → Source : *Deploy from a branch* → Branch : `main` / `(root)` → **Save**.
4. Après 1 à 2 minutes, l'adresse est : `https://<votre-compte>.github.io/caisse/`

Le dépôt public ne contient que le programme : aucune vente ni donnée n'y est envoyée.

## Installation sur la tablette
1. Ouvrir l'adresse dans **Chrome**.
2. Menu **⋮ → Installer l'application** (ou « Ajouter à l'écran d'accueil »).
3. Lancer « Caisse » depuis l'écran d'accueil : plein écran, fonctionne ensuite sans réseau.
4. Première connexion : utilisateur **Responsable**, code **1234** → le changer tout de suite (Réglages → Utilisateurs).

## Imprimante Bluetooth
- Réglages → Imprimante → **Bluetooth direct** → Connecter → Ticket de test.
- Si l'imprimante n'apparaît pas (Bluetooth « classique ») : installer l'appli gratuite **RawBT** (Play Store),
  y appairer l'imprimante, puis choisir le mode **RawBT**.
- Accents mal imprimés : choisir « Sans accents ».

## Une manifestation
Ouvrir la caisse (fond de caisse) → vendre → Ma caisse → **Clôturer (ticket Z)** avec le comptage
→ **Fichier pour la compta** → l'envoyer, puis dans le logiciel du comité : **Import Excel**.
Penser à **Sauvegarder la caisse** (Historique) et à ranger le fichier dans le Drive.

## Envoi automatique vers le Google Drive du comité
Réglage unique, dans la console Google Cloud du projet du comité :
1. **Google Auth Platform → Clients → « Connexion bureau »** → *Origines JavaScript autorisées* → **+ Ajouter un URI** :
   `https://<votre-compte>.github.io` → **Enregistrer** (prise en compte en quelques minutes).
2. Copier l'**ID client** de « Connexion bureau ».
3. Dans la caisse : **Réglages → Google Drive du comité** → coller l'ID client, indiquer le compte Google de
   l'association, cocher « Envoyer automatiquement » → Enregistrer → **Se connecter et envoyer maintenant**.

Ensuite :
- les tickets Z partent dans `Comité des Fêtes — Logiciel / Caisse / Z à importer`, la sauvegarde complète
  dans `… / Caisse / Sauvegardes` ;
- l'envoi est automatique à chaque clôture et toutes les 5 minutes quand internet est là, pendant l'heure qui
  suit une connexion Google ; au-delà, le nuage de la barre devient orange : **un appui** et tout part.
- sans réseau, rien n'est perdu : tout attend sur la tablette.

## Jetons
Les jetons vendus à l'entrée sont une recette. Payer une boisson en jetons n'est pas recompté
dans le fichier compta (sinon l'argent serait compté deux fois).

## Mettre à jour la caisse
Déposer les fichiers modifiés sur GitHub. La tablette prend la nouvelle version au lancement suivant
avec du réseau.
