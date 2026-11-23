# SAFE ERP — Tableau de Bord Central d'Administration des Licences (CRM Éditeur)

Ce module autonome permet à l'éditeur de **SAFE ERP** de gérer l'ensemble de son parc clients, de générer les clés d'activation matérielles (`Hardware ID`) compatibles avec les 4 progiciels métiers, et de suivre les renouvellements d'abonnements annuels en Dinars Tunisiens (TND).

## Démarrage Rapide sur PC (Windows)
1. Double-cliquez sur **`LANCER_CRM_LICENCES.bat`**.
2. Votre navigateur s'ouvre automatiquement sur **`http://localhost:8090`** (également accessible sur votre réseau local via l'IP affichée dans la console).

## Fonctionnalités Clés
- **Enregistrement CRM Clients :** Raison sociale, Matricule Fiscal (MF), coordonnées, progiciel souscrit (`NEGOCE`, `SERVICES`, `INDUSTRIE`, `RESTAURATION`), redevance annuelle (TND).
- **Génération Cryptographique HMAC-SHA256 :** Produit la clé exacte (`SAFE-YYYYMMDD-XXXX-XXXX-XXXX-XXXX`) attendue par le verrou matériel intégré dans chaque progiciel SAFE ERP.
- **Suivi des Échéances & Renouvellements :** Alertes automatiques sur les licences expirant sous 30 jours et renouvellement en 1 clic (+1 an).
