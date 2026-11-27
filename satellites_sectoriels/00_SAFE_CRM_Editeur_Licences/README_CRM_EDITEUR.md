# SAFE ERP â€” Tableau de Bord Central d'Administration des Licences (CRM Ã‰diteur)

Ce module autonome permet Ã  l'Ã©diteur de **SAFE ERP** de gÃ©rer l'ensemble de son parc clients, de gÃ©nÃ©rer les clÃ©s d'activation matÃ©rielles (`Hardware ID`) compatibles avec les 4 progiciels mÃ©tiers, et de suivre les renouvellements d'abonnements annuels en Dinars Tunisiens (TND).

## DÃ©marrage Rapide sur PC (Windows)
1. Double-cliquez sur **`LANCER_CRM_LICENCES.bat`**.
2. Votre navigateur s'ouvre automatiquement sur **`http://localhost:8090`** (Ã©galement accessible sur votre rÃ©seau local via l'IP affichÃ©e dans la console).

## FonctionnalitÃ©s ClÃ©s
- **Enregistrement CRM Clients :** Raison sociale, Matricule Fiscal (MF), coordonnÃ©es, progiciel souscrit (`NEGOCE`, `SERVICES`, `INDUSTRIE`, `RESTAURATION`), redevance annuelle (TND).
- **GÃ©nÃ©ration Cryptographique HMAC-SHA256 :** Produit la clÃ© exacte (`SAFE-YYYYMMDD-XXXX-XXXX-XXXX-XXXX`) attendue par le verrou matÃ©riel intÃ©grÃ© dans chaque progiciel SAFE ERP.
- **Suivi des Ã‰chÃ©ances & Renouvellements :** Alertes automatiques sur les licences expirant sous 30 jours et renouvellement en 1 clic (+1 an).
