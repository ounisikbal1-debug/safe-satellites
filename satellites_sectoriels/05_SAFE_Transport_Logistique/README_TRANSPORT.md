# 🛡️ SAFE ERP — Module 05 : Transport Routier, Fret Lourd & Livraison de Colis Express (Tunisie)

## 1. Présentation & Nouvelles Fonctionnalités
Ce module a été entièrement adapté et enrichi pour couvrir les **deux piliers du transport et de la logistique en Tunisie** :
1. **Fret Lourd & Tournées Routières (Lettres de Voiture)** : transport par semi-remorques et porteurs, calcul de rentabilité (gasoil, péages A1, frais de route), marge brute et nette, écritures comptables conformes au Système Comptable des Entreprises Tunisien (SCE NC 01).
2. **Livraison de Colis Express & E-Commerce (Messagerie & Last-Mile)** :
   * Prise en charge des expéditions par colis et messagerie express avec code de tracking unique (`TN-COLIS-2026-XXXX`).
   * Gestion complète du **Contre-Remboursement (Cash on Delivery / COD)** en dinars tunisiens (TND avec 3 décimales).
   * Suivi des 24 gouvernorats tunisiens et des adresses précises avec contact téléphonique du destinataire.
   * Cycle de vie du colis en 1 clic : *Ramassé ➔ En Transit au Hub Central ➔ En Cours de Livraison ➔ Livré & Encaissé (ou Retour / Destinataire Injoignable)*.
   * Écritures comptables automatiques lors de la livraison et de l'encaissement des fonds (Débit Caisse `541` / Crédit Compte Débiteurs-Créditeurs COD `467`).
3. **Émission d'Avoirs Fret et Colis** : bouton dédié permettant d'émettre des factures d'avoir et des bordereaux d'annulation avec génération immédiate de l'écriture comptable d'extourne.
4. **Gestion de Flotte & Livreurs** : enregistrement des véhicules (semi-remorques, camions frigorifiques, fourgons, utilitaires et scooters urbains), affectation des chauffeurs/livreurs et suivi de leur disponibilité.
5. **Personnalisation d'En-tête & Paramètres Fiscaux** :
   * Saisie de la Raison Sociale, Matricule Fiscal (MF), Registre de Commerce (RC), adresse, téléphone, email et RIB.
   * Paramètres fiscaux modifiables : TVA Transport Marchandises (7%), TVA Prestation Logistique (19%), Timbre Fiscal (1.000 DT), Retenue à la Source (1.0% / 1.5%).
   * Répercussion dynamique sur toutes les impressions.
6. **Impression Directe A4 / A5** :
   * **Bordereau d'Expédition / Étiquette Colis Express** avec code de suivi, code-barres simulé, montant COD en grand et zones d'émargement client/livreur.
   * **Lettre de Voiture Nationale A4** avec décomposition Fret HT, TVA 7%, Timbre 1.000 DT, Retenue à la Source 1% et Net à Payer.
7. **Administration & Réinitialisation Opérationnelle** :
   * Bouton sécurisé permettant la remise à zéro des données de mouvements (ordres de fret, colis, écritures comptables) pour mise en service à blanc, accessible uniquement par mot de passe Administrateur.
8. **Identité Visuelle & Authentification Sécurisée Unifiée** :
   * Charte graphique SAFE ERP, logo 🛡️ SAFE, slogan officiel.
   * Bouton de déconnexion `🚪 Sortie`.
   * Verrou matériel Hardware ID (`HW-F34C5F44A5F3`) et signature cryptographique HMAC-SHA256 unifiée avec la console éditeur SAFE.

---

## 2. Démarrage Rapide

### Lancement Local
Double-cliquez sur :
```bat
LANCER_SAFE_TRANSPORT.bat
```
L'application démarre le serveur local et ouvre automatiquement :
`http://localhost:8005`

### Comptes Utilisateurs Prédéfinis
* **Administrateur** : `admin` / `admin2026`
* **Exploitant / Dispatcheur** : `exploitant` / `expl2026`
* **Livreur Express** : `livreur` / `livr2026`
