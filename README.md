# CBD — Chrome Block Dealer

*Ta dose d'automatisation.*

Extension Chrome (MV3) pour composer, par glisser-déposer de blocs, des scripts qui agissent sur une page :
« Quand la page est chargée → Attendre que la valeur de `#counter` = 0 → Cliquer sur `#promo-btn` ».

## Démarrer

```bash
npm install
npm run build        # produit dist/
```

Dans Chrome : `chrome://extensions` → Mode développeur → **Charger l'extension non empaquetée** → dossier `dist/`.

⚠️ Après chaque `npm run build`, cliquer sur ↻ (Recharger) pour CBD dans `chrome://extensions`, puis
actualiser les onglets : les noms de fichiers changent à chaque build et, sans rechargement, les scripts ne
s'exécutent plus du tout sur les pages (alors que le popup et l'éditeur semblent fonctionner).
`npm run dev` permet de développer avec rechargement à chaud (charger `dist/` de la même façon).

## Utilisation

1. Sur le site visé, ouvrir le popup de l'extension → **Nouveau script pour ce site**.
2. Dans l'éditeur, glisser les blocs sous le déclencheur.
3. Cliquer sur 🎯 dans un bloc pour choisir l'élément (ou la position, pour « Cliquer ici ») directement dans
   l'onglet du site.
4. **Enregistrer** : les onglets ouverts sur le site appliquent aussitôt la nouvelle version.

Les attentes (« Attendre que… », « Cliquer sur… ») surveillent la page en continu : un bouton qui n'existe pas
encore (fin de chrono, promo) est cliqué dès qu'il apparaît et devient actif. `max 0 s` = sans limite.
Le popup affiche le journal de la dernière exécution sur l'onglet.

### Export / import

Dans l'éditeur : **Exporter** (barre du haut) télécharge le script ouvert, dans sa version enregistrée ;
**Exporter tout** (en bas de la liste) télécharge tous les scripts dans un seul fichier JSON. **Importer…**
ajoute les scripts d'un fichier exporté. Un script qui a le même identifiant qu'un script existant le remplace,
après confirmation (restauration d'une sauvegarde). Le fichier est entièrement vérifié avant l'import : un
fichier invalide ou d'une autre application est refusé et rien n'est modifié. Les scripts importés gardent leur
état actif / inactif. Les exports faits sous l'ancien nom de l'extension (Smart Click) restent importables.

### Mode débug

Case **Mode débug** dans le popup (par onglet, conservée pendant les actualisations) : la page affiche
- un cadre bleu pointillé et une mire sur chaque élément que le script va cliquer (orange s'il n'est pas encore
  cliquable), une mire pour chaque « Cliquer ici » ;
- un contour **vert** (vrai) ou **rouge** (faux) autour des éléments lus par les conditions, mis à jour en
  direct ; au survol de l'élément, une infobulle donne le détail (`« 00:05 » = 0 → faux`) ;
- un panneau en bas à gauche listant toutes les conditions (y compris sans élément visible) et les éléments
  introuvables.

Le calque est affiché dans la « top layer » du navigateur, au-dessus de tous les éléments du site (même ceux à
z-index maximal ou ouverts en popover), et ne capte aucun clic : le script et la page fonctionnent normalement.

### Blocs

| Catégorie | Blocs |
|---|---|
| Déclencheurs | page chargée, élément qui apparaît, toutes les N s |
| Contrôle | attendre que…, si / sinon, attendre N s, écrire dans le journal, arrêter le script |
| Actions | cliquer sur, cliquer ici (position), écrire dans un champ, actualiser la page |
| Page | valeur de [élément], valeur de … = / ≠ / < / > / contient …, existe, est visible |
| Logique | et / ou, non, comparaison (= ≠ < ≤ > ≥), vrai / faux |
| Boucles | répéter N fois, répéter tant que / jusqu'à ce que |
| Maths, Texte | nombre, calcul (+ − × ÷ ^), texte, créer un texte avec… |
| Variables | créer, définir, obtenir, incrémenter (conservées tant que la page reste ouverte) |

Un texte numérique de la page est utilisable dans les calculs et comparaisons : « 00:30 » vaut 30, « 1 234,5 » vaut 1234,5.

« Actualiser la page » termine le bloc de script : avec le déclencheur « Quand la page est chargée », le script
repart du début après le rechargement. Exemple : *Si non (#promo-btn existe) → Attendre 5 s → Actualiser la page*.
Les variables repartent de 0 à chaque actualisation ; décocher le script dans le popup arrête la boucle.
Le journal du popup est conservé d'un chargement à l'autre (intercalaire « Page chargée »).

## Développement

```bash
npm test             # Vitest : interpréteur, traduction Blockly, driver DOM (jsdom)
npm run check        # svelte-check / TypeScript
npm run serve:test   # page de test http://localhost:5180/countdown.html (?s=durée du chrono)
```

```
src/
  script/     modèle de script, validation, interpréteur, export / import JSON (pur TS, sans Chrome/DOM/Blockly)
  page/       driver DOM (MutationObserver + sondage), générateur de sélecteur, mode pointer
  blockly/    définitions des blocs, toolbox, traduction workspace ⇄ modèle
  editor/     page d'options : éditeur Svelte + Blockly
  popup/      scripts du site courant et journal d'exécution
  content.ts  lance les scripts de la page ; background.ts tient le journal et le badge
```

## Limites connues

- « Cliquer ici » vise une position en % de la fenêtre : elle dépend du défilement et de la mise en page.
- Les scripts ne s'exécutent que dans le cadre principal (pas dans les iframes) et ne se relancent pas lors
  d'une navigation interne d'une application monopage (le déclencheur « apparaît » couvre en partie ce cas).
- Les onglets ouverts avant l'installation de l'extension doivent être rechargés.
- Dans un onglet en arrière-plan, Chrome ralentit les minuteurs (« Attendre N s », boucles, « Toutes les N s ») :
  au moins 1 s, voire 1 min après 5 min cachés. Les attentes sur la page (« Attendre que… ») réagissent, elles,
  aux changements du DOM.
