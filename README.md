# Vinted Phone Margin

Extension Chrome qui affiche une estimation de marge de revente pour certains iPhone et Samsung lorsque vous naviguez sur Vinted. Elle compare le prix de l’annonce à des estimations de reprise publiques d’Easy Cash et Cash Express.

> Projet indépendant de Vinted, Easy Cash et Cash Express. Les estimations sont indicatives et ne constituent pas une offre d’achat.

## Ce que fait l’extension

- Identifie le modèle, l’état et le stockage du téléphone à partir des informations de l’annonce Vinted.
- Consulte indépendamment les estimations de reprise d’Easy Cash et de Cash Express.
- Affiche la meilleure marge estimée après déduction du prix de l’article, de la protection acheteur Vinted et de 5 € de livraison.
- Met en cache les estimations valides pendant 24 heures.
- Signale les annonces contenant la mention exacte `virement bancaire` et ignore les appareils ou annonces non exploitables.

Les marges positives sont vertes, les marges négatives rouges. Une marge anormalement élevée ou un modèle non reconnu affiche `?` plutôt qu’un montant trompeur.

## Tutoriel : installer l’extension dans Chrome

### 1. Télécharger le projet

Deux possibilités :

```sh
git clone https://github.com/<votre-compte>/vinted-seller.git
cd vinted-seller
```

Ou téléchargez le fichier ZIP depuis GitHub, décompressez-le puis ouvrez un terminal dans le dossier obtenu.

### 2. Installer les dépendances et construire l’extension

Node.js 20 ou une version plus récente est recommandé.

```sh
npm install
npm run build
```

La commande crée le dossier `dist`, qui contient l’extension prête à charger.

### 3. Charger l’extension dans Chrome

1. Ouvrez `chrome://extensions` dans Chrome.
2. Activez le **Mode développeur** en haut à droite.
3. Cliquez sur **Charger l’extension non empaquetée**.
4. Sélectionnez le dossier `dist` du projet.
5. Ouvrez ou actualisez une annonce Vinted compatible.

L’icône et la marge estimée doivent alors apparaître sur les annonces prises en charge. Après une modification du code, relancez `npm run build`, puis cliquez sur l’icône actualiser de l’extension dans `chrome://extensions`.

## Utilisation

Parcourez normalement les annonces Vinted. L’extension ne modifie aucune annonce, n’envoie aucun message, ne réserve et n’achète aucun article. Elle lit seulement les informations nécessaires sur la page en cours pour calculer une estimation.

Les appareils pris en charge comprennent les iPhone (SE, mini, Plus, Pro et Pro Max inclus) et plusieurs familles Samsung Galaxy : S, Note, A, Z Flip et Z Fold. Les accessoires, téléphones pour pièces, emballages seuls et annonces excluant le téléphone ne sont pas valorisés.

## Développement

```sh
npm install
npm test
npm run build
```

Pour créer une archive destinée au Chrome Web Store :

```sh
npm run package:chrome
```

L’archive est générée dans `release/vinted-phone-margin-extension.zip`.

`npm run check:providers` est une vérification facultative en lecture seule des métadonnées des sources. Elle n’est pas incluse dans les tests ordinaires.

## Confidentialité

L’extension lit les informations affichées dans l’annonce afin d’établir une estimation. Elle transmet seulement les caractéristiques nécessaires de l’appareil aux parcours publics d’estimation d’Easy Cash et Cash Express. Elle ne transmet pas les données de compte Vinted, les coordonnées, les paiements ou les messages.

Les détails de publication Chrome Web Store sont disponibles dans [docs/chrome-web-store-listing.fr.md](docs/chrome-web-store-listing.fr.md).

## Licence

Ce dépôt ne contient pas encore de licence explicite. Tous droits réservés par défaut.
