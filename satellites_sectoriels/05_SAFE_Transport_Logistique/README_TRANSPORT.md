# ðŸ›¡ï¸ SAFE ERP â€” Module 05 : Transport Routier, Fret Lourd & Livraison de Colis Express (Tunisie)

## 1. PrÃ©sentation & Nouvelles FonctionnalitÃ©s
Ce module a Ã©tÃ© entiÃ¨rement adaptÃ© et enrichi pour couvrir les **deux piliers du transport et de la logistique en Tunisie** :
1. **Fret Lourd & TournÃ©es RoutiÃ¨res (Lettres de Voiture)** : transport par semi-remorques et porteurs, calcul de rentabilitÃ© (gasoil, pÃ©ages A1, frais de route), marge brute et nette, Ã©critures comptables conformes au SystÃ¨me Comptable des Entreprises Tunisien (SCE NC 01).
2. **Livraison de Colis Express & E-Commerce (Messagerie & Last-Mile)** :
   * Prise en charge des expÃ©ditions par colis et messagerie express avec code de tracking unique (`TN-COLIS-2026-XXXX`).
   * Gestion complÃ¨te du **Contre-Remboursement (Cash on Delivery / COD)** en dinars tunisiens (TND avec 3 dÃ©cimales).
   * Suivi des 24 gouvernorats tunisiens et des adresses prÃ©cises avec contact tÃ©lÃ©phonique du destinataire.
   * Cycle de vie du colis en 1 clic : *RamassÃ© âž” En Transit au Hub Central âž” En Cours de Livraison âž” LivrÃ© & EncaissÃ© (ou Retour / Destinataire Injoignable)*.
   * Ã‰critures comptables automatiques lors de la livraison et de l'encaissement des fonds (DÃ©bit Caisse `541` / CrÃ©dit Compte DÃ©biteurs-CrÃ©diteurs COD `467`).
3. **Ã‰mission d'Avoirs Fret et Colis** : bouton dÃ©diÃ© permettant d'Ã©mettre des factures d'avoir et des bordereaux d'annulation avec gÃ©nÃ©ration immÃ©diate de l'Ã©criture comptable d'extourne.
4. **Gestion de Flotte & Livreurs** : enregistrement des vÃ©hicules (semi-remorques, camions frigorifiques, fourgons, utilitaires et scooters urbains), affectation des chauffeurs/livreurs et suivi de leur disponibilitÃ©.
5. **Personnalisation d'En-tÃªte & ParamÃ¨tres Fiscaux** :
   * Saisie de la Raison Sociale, Matricule Fiscal (MF), Registre de Commerce (RC), adresse, tÃ©lÃ©phone, email et RIB.
   * ParamÃ¨tres fiscaux modifiables : TVA Transport Marchandises (7%), TVA Prestation Logistique (19%), Timbre Fiscal (1.000 DT), Retenue Ã  la Source (1.0% / 1.5%).
   * RÃ©percussion dynamique sur toutes les impressions.
6. **Impression Directe A4 / A5** :
   * **Bordereau d'ExpÃ©dition / Ã‰tiquette Colis Express** avec code de suivi, code-barres simulÃ©, montant COD en grand et zones d'Ã©margement client/livreur.
   * **Lettre de Voiture Nationale A4** avec dÃ©composition Fret HT, TVA 7%, Timbre 1.000 DT, Retenue Ã  la Source 1% et Net Ã  Payer.
7. **Administration & RÃ©initialisation OpÃ©rationnelle** :
   * Bouton sÃ©curisÃ© permettant la remise Ã  zÃ©ro des donnÃ©es de mouvements (ordres de fret, colis, Ã©critures comptables) pour mise en service Ã  blanc, accessible uniquement par mot de passe Administrateur.
8. **IdentitÃ© Visuelle & Authentification SÃ©curisÃ©e UnifiÃ©e** :
   * Charte graphique SAFE ERP, logo ðŸ›¡ï¸ SAFE, slogan officiel.
   * Bouton de dÃ©connexion `ðŸšª Sortie`.
   * Verrou matÃ©riel Hardware ID (`HW-F34C5F44A5F3`) et signature cryptographique HMAC-SHA256 unifiÃ©e avec la console Ã©diteur SAFE.

---

## 2. DÃ©marrage Rapide

### Lancement Local
Double-cliquez sur :
```bat
LANCER_SAFE_TRANSPORT.bat
```
L'application dÃ©marre le serveur local et ouvre automatiquement :
`http://localhost:8005`

### Comptes Utilisateurs PrÃ©dÃ©finis
* **Administrateur** : `admin` / `admin2026`
* **Exploitant / Dispatcheur** : `exploitant` / `expl2026`
* **Livreur Express** : `livreur` / `livr2026`
