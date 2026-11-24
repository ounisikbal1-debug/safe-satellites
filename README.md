# 🏢 SAFE Suite Tunisie — Progiciels Satellites

Dépôt officiel des progiciels **satellites métiers et sectoriels** de la suite SAFE.

> **Noyau ERP** : Ce dépôt héberge les satellites ; le noyau principal est désormais nommé  
> **SAFE_Grandes_Entreprises** (anciennement SAFE ERP DRAFT 3) — ERP Grand Compte & Multinationales,  
> hébergé sur [ounisikbal1-debug/erp_finance](https://github.com/ounisikbal1-debug/erp_finance).

---

## 📂 Structure

### Satellites Métiers (`satellites_metiers/`)

| Dossier | Logiciel | Description |
|---------|----------|-------------|
| `SAFE_Facturation/` | 🧾 SAFE Facturation | Achats/Ventes, Retenues RS, e-Fatoura TTN |
| `SAFE_Gestion_des_Stocks/` | 📦 SAFE Gestion des Stocks | Multi-Dépôts, PUMP, Inventaires |
| `SAFE_Paie/` | 💵 SAFE Paie Tunisie | IRPP 8 tranches, CNSS 9.68%/17.07%, CSS |
| `SAFE_Gestion_RH/` | 👔 SAFE Gestion RH | Contrats, Congés, Documents du personnel |
| `SAFE_Comptabilite_Fiscalite/` | ⚖️ SAFE Comptabilité | SCE, Balance 8 col, Grand Livre, G50 |
| `SAFE_Production_GPAO/` | ⚙️ SAFE Production GPAO | Nomenclatures BOM, Ordres OF, Ateliers |
| `SAFE_Immobilisations/` | 🏢 SAFE Immobilisations | Amortissements Linéaires & Dégressifs |
| `SAFE_PME_Express/` | 🚀 SAFE PME Express 2.0 | 18 Modules tout-en-un (Port 8006) |

### Satellites Sectoriels (`satellites_sectoriels/`)

| Dossier | Logiciel | Description |
|---------|----------|-------------|
| `01_SAFE_Negoce_Distribution/` | 🛒 SAFE Négoce & Distrib. | Tarifs dégressifs, ADV, Marges |
| `02_SAFE_Services_Cabinets/` | 💼 SAFE Services & Cabinets | Facturation temps/forfait, Projets |
| `03_SAFE_Industrie_Production/` | 🏭 SAFE Industrie Manuf. | Calcul besoins, Planification atelier |
| `04_SAFE_Restauration_POS/` | 🍽️ SAFE Restauration POS | Point de Vente tactile, Tables, Bar |
| `05_SAFE_Transport_Logistique/` | 🚛 SAFE Transport & Colis | Flotte, Lettres de voiture, Messagerie |
| `06_SAFE_PME_Tunisie_Express/` | 🌟 SAFE PME Express | Suite PME intégrée (Port 8006) |
| `00_SAFE_CRM_Editeur_Licences/` | 🔑 SAFE CRM Éditeur | Générateur Licences HMAC — **éditeur uniquement** |

---

## 🏛️ Architecture SAFE Suite Tunisie 2026

```
SAFE_Grandes_Entreprises (noyau ERP Grand Compte — erp_finance)
│
├─ satellites_metiers/       ← 8 progiciels métiers spécialisés
│   ├─ SAFE_Facturation
│   ├─ SAFE_Gestion_des_Stocks
│   ├─ SAFE_Paie
│   ├─ SAFE_Gestion_RH
│   ├─ SAFE_Comptabilite_Fiscalite
│   ├─ SAFE_Production_GPAO
│   ├─ SAFE_Immobilisations
│   └─ SAFE_PME_Express
│
└─ satellites_sectoriels/    ← 6 progiciels sectoriels verticaux
    ├─ 01_SAFE_Negoce_Distribution
    ├─ 02_SAFE_Services_Cabinets
    ├─ 03_SAFE_Industrie_Production
    ├─ 04_SAFE_Restauration_POS
    ├─ 05_SAFE_Transport_Logistique
    ├─ 06_SAFE_PME_Tunisie_Express
    └─ 00_SAFE_CRM_Editeur_Licences  ← éditeur uniquement
```

---

## 🚀 Lancement

Exécuter `MENU_PROLOGICIELS_SAFE.cmd` pour accéder au menu de lancement de tous les progiciels.

---

## 💰 Prix de Vente Recommandés (HT, Tunisie 2026)

| Catégorie | Prix |
|-----------|------|
| Progiciels Métiers (Facturation, RH, Paie, Stocks, Compta, Immo) | 850 DT — 1 500 DT |
| Sectoriels & PME Express | 2 500 DT — 3 200 DT |
| **SAFE_Grandes_Entreprises** (ERP Grand Compte / Multinationales) | 8 000 DT — 15 000 DT |

> 📌 **Stratégie tarifaire** : SAFE est **30 % à 40 % moins cher** que la concurrence (Sage, Cegid, Odoo Enterprise avec intégrateur).

---

## ⚠️ Note importante — CRM Éditeur

Le dossier `00_SAFE_CRM_Editeur_Licences` est **strictement réservé à l'éditeur SAFE**.  
Il ne doit **jamais** être livré aux clients.

---

*SAFE Suite Tunisie — © 2026 — Conformes Loi de Finances 2026, SCE, BCT, CNSS*
