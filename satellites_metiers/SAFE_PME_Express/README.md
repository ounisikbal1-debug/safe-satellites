# ERP Tunisie

ERP de gestion complet pour une société tunisienne : facturation, achats, paie,
comptabilité en partie double, fiscalité, immobilisations, trésorerie, stock et
tableau de bord. Interface en français, montants en dinars tunisiens (TND) à
3 décimales.

---

## Sommaire

1. [Contenu de l'archive](#1-contenu-de-larchive)
2. [Démarrage rapide (Docker)](#2-démarrage-rapide-docker)
3. [Installation manuelle](#3-installation-manuelle)
4. [Charger les 900 enregistrements de démonstration](#4-charger-les-900-enregistrements-de-démonstration)
5. [Comptes utilisateurs](#5-comptes-utilisateurs)
6. [Accès réseau local](#6-accès-réseau-local)
7. [Installation sur PC (PWA)](#7-installation-sur-pc-pwa)
8. [Réglementation tunisienne intégrée](#8-réglementation-tunisienne-intégrée)
9. [Architecture](#9-architecture)
10. [Transmissions TTN / e-Fatoura](#10-transmissions-ttn--e-fatoura)
11. [Sauvegarde et restauration](#11-sauvegarde-et-restauration)
12. [Dépannage](#12-dépannage)

---

## 1. Contenu de l'archive

```
erp-tunisie/
├── README.md                    ← ce document
├── .env.example                 ← configuration à copier en .env
├── docker-compose.yml           ← serveur + PostgreSQL en une commande
├── Dockerfile                   ← image de production
├── package.json                 ← dépendances et scripts
├── pnpm-lock.yaml               ← versions verrouillées
├── drizzle.config.ts            ← configuration Drizzle ORM
├── vite.config.ts               ← build du client React
├── tsconfig.json
│
├── client/                      ← interface (React 19 + Tailwind 4)
│   ├── index.html
│   ├── public/
│   │   ├── manifest.webmanifest ← PWA : installation sur PC
│   │   ├── sw.js                ← service worker (coquille hors ligne)
│   │   └── icons/               ← icônes 192 / 512 / Apple
│   └── src/
│       ├── App.tsx              ← routes
│       ├── pages/               ← 16 écrans
│       │   ├── Dashboard.tsx    Tableau de bord + graphiques
│       │   ├── Invoices.tsx     Factures clients
│       │   ├── InvoiceDetail.tsx
│       │   ├── Bills.tsx        Achats fournisseurs
│       │   ├── Partners.tsx     Tiers (clients / fournisseurs)
│       │   ├── Products.tsx     Articles + stock
│       │   ├── Employees.tsx    Salariés
│       │   ├── Payroll.tsx      Paie & bulletins
│       │   ├── Accounting.tsx   Journaux, balance, partie double
│       │   ├── Vat.tsx          TVA collectée / déductible
│       │   ├── Tax.tsx          Fiscalité & simulateur IRPP / IS
│       │   ├── Assets.tsx       Immobilisations & amortissements
│       │   ├── Treasury.tsx     Trésorerie
│       │   ├── Settings.tsx     Paramètres société
│       │   ├── Login.tsx / Signup.tsx
│       ├── components/          ← Shell, graphiques, exports, primitives
│       └── lib/                 ← io.ts (Excel/CSV/PDF), utils
│
├── server/                      ← API (Hono + tRPC)
│   ├── _core/                   ← socle : auth, db, env, serve, storage
│   ├── routers.ts               ← contrôleurs tRPC
│   ├── db.ts                    ← accès données
│   ├── transmission.ts          ← envoi TTN / e-Fatoura
│   └── services/                ← logique métier, un service par domaine
│       ├── accounting.ts        Écritures en partie double, plan comptable
│       ├── reports.ts           Bilan, Compte de Résultat
│       ├── declarations.ts      CNSS, TVA, dépôt de bilan annuel
│       ├── vat.ts               TVA collectée / déductible, liquidation
│       ├── efatoura.ts          XML TEIF conforme
│       └── seed.ts              Jeu de données 900 enregistrements
│
├── shared/
│   ├── fiscal.ts                Moteur fiscal & social (IRPP, CNSS, TVA…)
│   ├── constants.ts
│   └── types.ts
│
├── drizzle/
│   ├── schema.ts                Schéma PostgreSQL (21 tables)
│   └── migrations/              Migrations versionnées (0000 → 0004)
│
├── scripts/
│   ├── seed-demo.ts             Charge le compte démo + 900 enregistrements
│   ├── dump-sql.mjs             Génère un dump SQL des données
│   └── build-server.mjs         Bundle du serveur (esbuild)
│
└── seed-data.sql                ← dump SQL des 900 enregistrements
```

---

## 2. Démarrage rapide (Docker)

La voie la plus courte : PostgreSQL et l'ERP dans deux conteneurs.

```bash
# 1. Décompresser l'archive
unzip erp-tunisie.zip && cd erp-tunisie

# 2. Créer le fichier de configuration
cp .env.example .env
#    Éditez .env : changez JWT_SECRET et POSTGRES_PASSWORD

# 3. Démarrer
docker compose up -d

# 4. Appliquer le schéma de base
docker compose exec app pnpm db:migrate

# 5. (Optionnel) Charger les 900 enregistrements de démonstration
docker compose exec app pnpm tsx scripts/seed-demo.ts
```

L'ERP est alors accessible sur **http://localhost:3000**.

> Le `docker-compose.yml` publie le port sur `0.0.0.0` : les autres postes du
> réseau local y accèdent via `http://<IP-du-serveur>:3000`.

---

## 3. Installation manuelle

### Prérequis

| Logiciel | Version minimale |
|---|---|
| Node.js | 20.19 (22 recommandé) |
| pnpm | 11 (`corepack enable`) |
| PostgreSQL | 14 (16 recommandé) |

### Étapes

```bash
# 1. Dépendances
corepack enable
pnpm install

# 2. Base de données
sudo -u postgres psql <<'SQL'
CREATE DATABASE erp_tunisie;
CREATE USER erp WITH PASSWORD 'motdepasse_fort';
GRANT ALL PRIVILEGES ON DATABASE erp_tunisie TO erp;
\c erp_tunisie
GRANT ALL ON SCHEMA public TO erp;
SQL

# 3. Configuration
cp .env.example .env
#    Renseignez DATABASE_URL et JWT_SECRET

# 4. Schéma
pnpm db:migrate

# 5. Build et démarrage
pnpm build
pnpm start
```

En développement (rechargement à chaud) :

```bash
pnpm dev          # Vite sur :3000, API sur :3001
```

### Vérifier l'installation

```bash
curl http://localhost:3000/api/health
# → {"ok":true}
```

---

## 4. Charger les 900 enregistrements de démonstration

Deux méthodes, au choix.

### Méthode A — script TypeScript (recommandée)

Crée le compte de démonstration **et** les données, avec les écritures
comptables générées en partie double.

```bash
pnpm tsx scripts/seed-demo.ts
```

### Méthode B — dump SQL

Le fichier `seed-data.sql` contient les mêmes données, prêtes à insérer.

```bash
psql "$DATABASE_URL" -f seed-data.sql
```

> Le dump suppose que les migrations sont déjà appliquées. Il utilise
> `ON CONFLICT DO NOTHING` : le rejouer ne crée pas de doublons.

### Répartition des 900 enregistrements

| Table | Lignes |
|---|---:|
| Tiers (20 clients + 10 fournisseurs) | 30 |
| Articles & services | 40 |
| Salariés | 12 |
| Immobilisations | 12 |
| Factures de vente | 168 |
| Lignes de facture | 168 |
| Factures d'achat | 108 |
| Lignes d'achat | 108 |
| Cycles de paie | 12 |
| Bulletins de paie | 144 |
| Mouvements de stock | 50 |
| Opérations de trésorerie | 36 |
| Déclarations TVA | 12 |
| **Total** | **900** |

Les données couvrent **les 12 mois de l'année** : 14 factures par mois, de
janvier à décembre. S'y ajoutent les écritures comptables (267 écritures,
987 lignes) générées en partie double — débit = crédit.

---

## 5. Comptes utilisateurs

L'ERP fonctionne avec des comptes **e-mail + mot de passe**. Chaque compte a
ses propres livres : les données d'un utilisateur ne sont pas visibles par un
autre.

### Compte de démonstration

Créé par `scripts/seed-demo.ts` :

| | |
|---|---|
| E-mail | `demo@erp-tunisie.tn` |
| Mot de passe | `Demo2026!` |

### Créer un compte

Ouvrez l'ERP → **Sign up**. Le premier compte créé sur une base vierge devient
propriétaire de ses propres données ; il ne voit pas celles du compte de démo.

### Désactiver l'authentification

Pour un accès libre sans connexion (déconseillé hors réseau isolé), mettez
`AUTH_PROVIDER=none` dans `.env` et redémarrez.

---

## 6. Accès réseau local

L'ERP écoute sur `0.0.0.0:3000` : il est joignable depuis les autres postes.

```bash
# Trouver l'IP du serveur
ip addr | grep "inet "        # Linux / macOS
ipconfig                       # Windows
```

Depuis un autre poste : `http://192.168.1.50:3000` (remplacez par votre IP).

### Ouvrir le pare-feu

```bash
# Linux (ufw)
sudo ufw allow 3000/tcp

# Windows (PowerShell, en administrateur)
New-NetFirewallRule -DisplayName "ERP Tunisie" -Direction Inbound `
  -LocalPort 3000 -Protocol TCP -Action Allow
```

### Nom d'hôte local (optionnel)

Pour utiliser `http://erp.local` au lieu d'une IP, ajoutez une entrée DNS sur
le serveur DHCP, ou dans le fichier `hosts` de chaque poste :

```
192.168.1.50   erp.local
```

### Service au démarrage (Linux, systemd)

```ini
# /etc/systemd/system/erp-tunisie.service
[Unit]
Description=ERP Tunisie
After=network.target postgresql.service

[Service]
Type=simple
User=erp
WorkingDirectory=/opt/erp-tunisie
EnvironmentFile=/opt/erp-tunisie/.env
ExecStart=/usr/bin/pnpm start
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now erp-tunisie
```

---

## 7. Installation sur PC (PWA)

L'ERP est une **Progressive Web App** : il s'installe comme un logiciel, avec
son icône, sa fenêtre propre et un démarrage sans barre d'adresse.

### Windows / Linux — Chrome ou Edge

1. Ouvrez l'ERP dans le navigateur.
2. Cliquez sur l'icône **Installer** dans la barre d'adresse, ou menu
   **⋮ → Installer ERP Tunisie**.
3. L'application s'ouvre dans sa propre fenêtre et apparaît dans le menu Démarrer.

Un bouton **Installer sur ce PC** est aussi disponible en haut de l'interface
et dans **Paramètres → Installation & accès réseau**.

### macOS — Chrome ou Edge

Menu **⋮ → Installer ERP Tunisie**. L'application rejoint le Launchpad.

### macOS / iPad — Safari

**Partager → Sur l'écran d'accueil**.

> L'installation exige **HTTPS** (ou `localhost`). En réseau local en HTTP,
> utilisez le navigateur directement, ou placez l'ERP derrière un reverse proxy
> TLS (Caddy, Nginx).

---

## 8. Réglementation tunisienne intégrée

Tout le moteur fiscal et social vit dans `shared/fiscal.ts`, partagé entre le
client et le serveur : un seul endroit à modifier si un taux change.

### IRPP — 8 tranches, 0 % à 40 %

| Tranche (TND/an) | Taux |
|---|---:|
| 0 – 5 000 | 0 % |
| 5 000 – 10 000 | 15 % |
| 10 000 – 20 000 | 25 % |
| 20 000 – 30 000 | 30 % |
| 30 000 – 40 000 | 33 % |
| 40 000 – 50 000 | 36 % |
| 50 000 – 70 000 | 38 % |
| au-delà de 70 000 | 40 % |

Abattements : **300 TND** chef de famille, **100 TND** par personne à charge.
La retenue mensuelle s'obtient en annualisant le salaire imposable, en
appliquant le barème, puis en divisant par 12.

### Cotisations sociales

| Cotisation | Taux | Base |
|---|---:|---|
| CNSS salarié | **9,68 %** | salaire brut |
| CNSS employeur | **17,07 %** | salaire brut |
| CSS (contribution sociale de solidarité) | **0,5 %** | salaire brut |

### TVA

Taux : **19 %**, **13 %**, **7 %**, **0 %**. Le module TVA tient deux comptes
séparés :

- **TVA collectée** — sur les factures de vente, ventilée par taux
- **TVA déductible** — sur les factures d'achat, ventilée par taux
- **Liquidation** — TVA à payer ou crédit de TVA reportable
- **Déclaration** — générée par période, échéance au 15 du mois suivant

### Autres impôts et taxes

| Élément | Valeur |
|---|---|
| Timbre fiscal sur facture | **1,000 TND** |
| IS (impôt sur les sociétés) | **15 %** ou **20 %** |
| Acomptes provisionnels | 3 acomptes de **30 %** de l'IS de référence |
| TCL (taxe sur les locaux) | 0,1 % général · 0,2 % hôtellerie |
| Retenue à la source | 1 % · 3 % |

### Comptabilité

Plan comptable tunisien (25 comptes), journaux VE / AC / BQ / CA / OD / PA,
écritures en **partie double** avec contrôle d'équilibre débit = crédit.
Bilan et Compte de Résultat sont produits à partir des écritures.

---

## 9. Architecture

Architecture **MVC avec services distincts** :

```
Vue      client/src/pages/*.tsx        React, une page par module
Contrôleur  server/routers.ts          procédures tRPC, validation Zod
Service  server/services/*.ts          logique métier, un fichier par domaine
Modèle   drizzle/schema.ts + server/db.ts   PostgreSQL via Drizzle ORM
```

Chaque service est indépendant et testable seul :

| Service | Responsabilité |
|---|---|
| `accounting.ts` | Plan comptable, écritures, balance, contrôle d'équilibre |
| `reports.ts` | Bilan, Compte de Résultat |
| `declarations.ts` | CNSS, TVA, dépôt de bilan annuel |
| `vat.ts` | TVA collectée / déductible, liquidation |
| `efatoura.ts` | Génération du XML TEIF |
| `seed.ts` | Jeu de données de démonstration |

### Pile technique

| Couche | Technologie |
|---|---|
| Interface | React 19, Tailwind CSS 4, Wouter, graphiques SVG natifs |
| API | Hono, tRPC 11, Zod |
| Base | PostgreSQL, Drizzle ORM |
| Auth | Sessions signées JWT (jose), bcrypt |
| Build | Vite 8, esbuild |
| Tests | Vitest |

### Imports / exports

Sur les listes Factures, Achats, Tiers, Articles et Salariés :

- **Export Excel** — vrai fichier `.xlsx` (SheetJS)
- **Export CSV** — séparateur `;`, encodage UTF-8 avec BOM (Excel FR l'ouvre directement)
- **Export PDF** — mise en page A4 paysage, en-tête société
- **Import** — CSV et XLSX, avec modèle téléchargeable et compte-rendu ligne par ligne

---

## 10. Transmissions TTN / e-Fatoura

L'ERP transmet réellement les déclarations à la **Télédéclaration (TTN)** et
les factures à **e-Fatoura**. Chaque envoi est journalisé avec son statut et sa
référence.

Renseignez vos identifiants dans `.env` :

```bash
TTN_API_URL=https://api.teledeclaration.tn
TTN_API_KEY=votre_cle
EFATOURA_API_URL=https://api.e-fatoura.tn
EFATOURA_API_KEY=votre_cle
```

> **Sans ces clés, l'ERP refuse l'envoi et l'affiche clairement** dans le
> journal des transmissions. Aucune transmission n'est simulée : un envoi
> marqué « transmis » correspond à une réponse HTTP réussie de la plateforme.

Le XML e-Fatoura généré suit le schéma **TEIF** (Tunisian Electronic Invoice
Format) : identifiants fiscaux, lignes, TVA par taux, timbre, totaux.

---

## 11. Sauvegarde et restauration

```bash
# Sauvegarde
pg_dump -U erp erp_tunisie | gzip > /backup/erp_$(date +%F).sql.gz

# Restauration
gunzip -c /backup/erp_2026-11-23.sql.gz | psql -U erp erp_tunisie
```

Avec Docker :

```bash
docker compose exec db pg_dump -U erp erp_tunisie > backup.sql
```

Automatisez la sauvegarde quotidienne avec une entrée `cron` :

```cron
0 2 * * * pg_dump -U erp erp_tunisie | gzip > /backup/erp_$(date +\%F).sql.gz
```

---

## 12. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `Missing required env var: DATABASE_URL` | `.env` absent ou incomplet | `cp .env.example .env` et renseignez l'URL |
| `ECONNREFUSED 5432` | PostgreSQL arrêté | `sudo systemctl start postgresql` |
| `password authentication failed` | Mauvais identifiants | Vérifiez `DATABASE_URL` |
| Page blanche après le build | `dist/public` absent | `pnpm build` |
| `relation "users" does not exist` | Migrations non appliquées | `pnpm db:migrate` |
| L'installation PWA ne s'affiche pas | Pas de HTTPS | Utilisez `localhost` ou un reverse proxy TLS |
| Autres postes : « site inaccessible » | Pare-feu | Ouvrez le port 3000 (voir §6) |
| Envoi TTN refusé | Clés API absentes | Renseignez `TTN_API_KEY` / `EFATOURA_API_KEY` |

### Vérifier l'état du serveur

```bash
curl http://localhost:3000/api/health     # → {"ok":true}
pnpm typecheck                            # types TypeScript
pnpm test                                 # suite de tests
```

---

## Licence et usage

Ce logiciel est livré pour l'usage de l'entreprise qui l'installe. Les taux
fiscaux et sociaux sont ceux en vigueur à la date de livraison ; vérifiez-les
auprès de la Direction Générale des Impôts et de la CNSS avant toute
utilisation en production, et mettez à jour `shared/fiscal.ts` si la loi change.
