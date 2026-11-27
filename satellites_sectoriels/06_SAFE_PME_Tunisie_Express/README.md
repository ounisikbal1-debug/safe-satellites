# ERP Tunisie

ERP de gestion complet pour une sociÃ©tÃ© tunisienne : facturation, achats, paie,
comptabilitÃ© en partie double, fiscalitÃ©, immobilisations, trÃ©sorerie, stock et
tableau de bord. Interface en franÃ§ais, montants en dinars tunisiens (TND) Ã 
3 dÃ©cimales.

---

## Sommaire

1. [Contenu de l'archive](#1-contenu-de-larchive)
2. [DÃ©marrage rapide (Docker)](#2-dÃ©marrage-rapide-docker)
3. [Installation manuelle](#3-installation-manuelle)
4. [Charger les 900 enregistrements de dÃ©monstration](#4-charger-les-900-enregistrements-de-dÃ©monstration)
5. [Comptes utilisateurs](#5-comptes-utilisateurs)
6. [AccÃ¨s rÃ©seau local](#6-accÃ¨s-rÃ©seau-local)
7. [Installation sur PC (PWA)](#7-installation-sur-pc-pwa)
8. [RÃ©glementation tunisienne intÃ©grÃ©e](#8-rÃ©glementation-tunisienne-intÃ©grÃ©e)
9. [Architecture](#9-architecture)
10. [Transmissions TTN / e-Fatoura](#10-transmissions-ttn--e-fatoura)
11. [Sauvegarde et restauration](#11-sauvegarde-et-restauration)
12. [DÃ©pannage](#12-dÃ©pannage)

---

## 1. Contenu de l'archive

```
erp-tunisie/
â”œâ”€â”€ README.md                    â† ce document
â”œâ”€â”€ .env.example                 â† configuration Ã  copier en .env
â”œâ”€â”€ docker-compose.yml           â† serveur + PostgreSQL en une commande
â”œâ”€â”€ Dockerfile                   â† image de production
â”œâ”€â”€ package.json                 â† dÃ©pendances et scripts
â”œâ”€â”€ pnpm-lock.yaml               â† versions verrouillÃ©es
â”œâ”€â”€ drizzle.config.ts            â† configuration Drizzle ORM
â”œâ”€â”€ vite.config.ts               â† build du client React
â”œâ”€â”€ tsconfig.json
â”‚
â”œâ”€â”€ client/                      â† interface (React 19 + Tailwind 4)
â”‚   â”œâ”€â”€ index.html
â”‚   â”œâ”€â”€ public/
â”‚   â”‚   â”œâ”€â”€ manifest.webmanifest â† PWA : installation sur PC
â”‚   â”‚   â”œâ”€â”€ sw.js                â† service worker (coquille hors ligne)
â”‚   â”‚   â””â”€â”€ icons/               â† icÃ´nes 192 / 512 / Apple
â”‚   â””â”€â”€ src/
â”‚       â”œâ”€â”€ App.tsx              â† routes
â”‚       â”œâ”€â”€ pages/               â† 16 Ã©crans
â”‚       â”‚   â”œâ”€â”€ Dashboard.tsx    Tableau de bord + graphiques
â”‚       â”‚   â”œâ”€â”€ Invoices.tsx     Factures clients
â”‚       â”‚   â”œâ”€â”€ InvoiceDetail.tsx
â”‚       â”‚   â”œâ”€â”€ Bills.tsx        Achats fournisseurs
â”‚       â”‚   â”œâ”€â”€ Partners.tsx     Tiers (clients / fournisseurs)
â”‚       â”‚   â”œâ”€â”€ Products.tsx     Articles + stock
â”‚       â”‚   â”œâ”€â”€ Employees.tsx    SalariÃ©s
â”‚       â”‚   â”œâ”€â”€ Payroll.tsx      Paie & bulletins
â”‚       â”‚   â”œâ”€â”€ Accounting.tsx   Journaux, balance, partie double
â”‚       â”‚   â”œâ”€â”€ Vat.tsx          TVA collectÃ©e / dÃ©ductible
â”‚       â”‚   â”œâ”€â”€ Tax.tsx          FiscalitÃ© & simulateur IRPP / IS
â”‚       â”‚   â”œâ”€â”€ Assets.tsx       Immobilisations & amortissements
â”‚       â”‚   â”œâ”€â”€ Treasury.tsx     TrÃ©sorerie
â”‚       â”‚   â”œâ”€â”€ Settings.tsx     ParamÃ¨tres sociÃ©tÃ©
â”‚       â”‚   â”œâ”€â”€ Login.tsx / Signup.tsx
â”‚       â”œâ”€â”€ components/          â† Shell, graphiques, exports, primitives
â”‚       â””â”€â”€ lib/                 â† io.ts (Excel/CSV/PDF), utils
â”‚
â”œâ”€â”€ server/                      â† API (Hono + tRPC)
â”‚   â”œâ”€â”€ _core/                   â† socle : auth, db, env, serve, storage
â”‚   â”œâ”€â”€ routers.ts               â† contrÃ´leurs tRPC
â”‚   â”œâ”€â”€ db.ts                    â† accÃ¨s donnÃ©es
â”‚   â”œâ”€â”€ transmission.ts          â† envoi TTN / e-Fatoura
â”‚   â””â”€â”€ services/                â† logique mÃ©tier, un service par domaine
â”‚       â”œâ”€â”€ accounting.ts        Ã‰critures en partie double, plan comptable
â”‚       â”œâ”€â”€ reports.ts           Bilan, Compte de RÃ©sultat
â”‚       â”œâ”€â”€ declarations.ts      CNSS, TVA, dÃ©pÃ´t de bilan annuel
â”‚       â”œâ”€â”€ vat.ts               TVA collectÃ©e / dÃ©ductible, liquidation
â”‚       â”œâ”€â”€ efatoura.ts          XML TEIF conforme
â”‚       â””â”€â”€ seed.ts              Jeu de donnÃ©es 900 enregistrements
â”‚
â”œâ”€â”€ shared/
â”‚   â”œâ”€â”€ fiscal.ts                Moteur fiscal & social (IRPP, CNSS, TVAâ€¦)
â”‚   â”œâ”€â”€ constants.ts
â”‚   â””â”€â”€ types.ts
â”‚
â”œâ”€â”€ drizzle/
â”‚   â”œâ”€â”€ schema.ts                SchÃ©ma PostgreSQL (21 tables)
â”‚   â””â”€â”€ migrations/              Migrations versionnÃ©es (0000 â†’ 0004)
â”‚
â”œâ”€â”€ scripts/
â”‚   â”œâ”€â”€ seed-demo.ts             Charge le compte dÃ©mo + 900 enregistrements
â”‚   â”œâ”€â”€ dump-sql.mjs             GÃ©nÃ¨re un dump SQL des donnÃ©es
â”‚   â””â”€â”€ build-server.mjs         Bundle du serveur (esbuild)
â”‚
â””â”€â”€ seed-data.sql                â† dump SQL des 900 enregistrements
```

---

## 2. DÃ©marrage rapide (Docker)

La voie la plus courte : PostgreSQL et l'ERP dans deux conteneurs.

```bash
# 1. DÃ©compresser l'archive
unzip erp-tunisie.zip && cd erp-tunisie

# 2. CrÃ©er le fichier de configuration
cp .env.example .env
#    Ã‰ditez .env : changez JWT_SECRET et POSTGRES_PASSWORD

# 3. DÃ©marrer
docker compose up -d

# 4. Appliquer le schÃ©ma de base
docker compose exec app pnpm db:migrate

# 5. (Optionnel) Charger les 900 enregistrements de dÃ©monstration
docker compose exec app pnpm tsx scripts/seed-demo.ts
```

L'ERP est alors accessible sur **http://localhost:3000**.

> Le `docker-compose.yml` publie le port sur `0.0.0.0` : les autres postes du
> rÃ©seau local y accÃ¨dent via `http://<IP-du-serveur>:3000`.

---

## 3. Installation manuelle

### PrÃ©requis

| Logiciel | Version minimale |
|---|---|
| Node.js | 20.19 (22 recommandÃ©) |
| pnpm | 11 (`corepack enable`) |
| PostgreSQL | 14 (16 recommandÃ©) |

### Ã‰tapes

```bash
# 1. DÃ©pendances
corepack enable
pnpm install

# 2. Base de donnÃ©es
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

# 4. SchÃ©ma
pnpm db:migrate

# 5. Build et dÃ©marrage
pnpm build
pnpm start
```

En dÃ©veloppement (rechargement Ã  chaud) :

```bash
pnpm dev          # Vite sur :3000, API sur :3001
```

### VÃ©rifier l'installation

```bash
curl http://localhost:3000/api/health
# â†’ {"ok":true}
```

---

## 4. Charger les 900 enregistrements de dÃ©monstration

Deux mÃ©thodes, au choix.

### MÃ©thode A â€” script TypeScript (recommandÃ©e)

CrÃ©e le compte de dÃ©monstration **et** les donnÃ©es, avec les Ã©critures
comptables gÃ©nÃ©rÃ©es en partie double.

```bash
pnpm tsx scripts/seed-demo.ts
```

### MÃ©thode B â€” dump SQL

Le fichier `seed-data.sql` contient les mÃªmes donnÃ©es, prÃªtes Ã  insÃ©rer.

```bash
psql "$DATABASE_URL" -f seed-data.sql
```

> Le dump suppose que les migrations sont dÃ©jÃ  appliquÃ©es. Il utilise
> `ON CONFLICT DO NOTHING` : le rejouer ne crÃ©e pas de doublons.

### RÃ©partition des 900 enregistrements

| Table | Lignes |
|---|---:|
| Tiers (20 clients + 10 fournisseurs) | 30 |
| Articles & services | 40 |
| SalariÃ©s | 12 |
| Immobilisations | 12 |
| Factures de vente | 168 |
| Lignes de facture | 168 |
| Factures d'achat | 108 |
| Lignes d'achat | 108 |
| Cycles de paie | 12 |
| Bulletins de paie | 144 |
| Mouvements de stock | 50 |
| OpÃ©rations de trÃ©sorerie | 36 |
| DÃ©clarations TVA | 12 |
| **Total** | **900** |

Les donnÃ©es couvrent **les 12 mois de l'annÃ©e** : 14 factures par mois, de
janvier Ã  dÃ©cembre. S'y ajoutent les Ã©critures comptables (267 Ã©critures,
987 lignes) gÃ©nÃ©rÃ©es en partie double â€” dÃ©bit = crÃ©dit.

---

## 5. Comptes utilisateurs

L'ERP fonctionne avec des comptes **e-mail + mot de passe**. Chaque compte a
ses propres livres : les donnÃ©es d'un utilisateur ne sont pas visibles par un
autre.

### Compte de dÃ©monstration

CrÃ©Ã© par `scripts/seed-demo.ts` :

| | |
|---|---|
| E-mail | `demo@erp-tunisie.tn` |
| Mot de passe | `Demo2026!` |

### CrÃ©er un compte

Ouvrez l'ERP â†’ **Sign up**. Le premier compte crÃ©Ã© sur une base vierge devient
propriÃ©taire de ses propres donnÃ©es ; il ne voit pas celles du compte de dÃ©mo.

### DÃ©sactiver l'authentification

Pour un accÃ¨s libre sans connexion (dÃ©conseillÃ© hors rÃ©seau isolÃ©), mettez
`AUTH_PROVIDER=none` dans `.env` et redÃ©marrez.

---

## 6. AccÃ¨s rÃ©seau local

L'ERP Ã©coute sur `0.0.0.0:3000` : il est joignable depuis les autres postes.

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

### Nom d'hÃ´te local (optionnel)

Pour utiliser `http://erp.local` au lieu d'une IP, ajoutez une entrÃ©e DNS sur
le serveur DHCP, ou dans le fichier `hosts` de chaque poste :

```
192.168.1.50   erp.local
```

### Service au dÃ©marrage (Linux, systemd)

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
son icÃ´ne, sa fenÃªtre propre et un dÃ©marrage sans barre d'adresse.

### Windows / Linux â€” Chrome ou Edge

1. Ouvrez l'ERP dans le navigateur.
2. Cliquez sur l'icÃ´ne **Installer** dans la barre d'adresse, ou menu
   **â‹® â†’ Installer ERP Tunisie**.
3. L'application s'ouvre dans sa propre fenÃªtre et apparaÃ®t dans le menu DÃ©marrer.

Un bouton **Installer sur ce PC** est aussi disponible en haut de l'interface
et dans **ParamÃ¨tres â†’ Installation & accÃ¨s rÃ©seau**.

### macOS â€” Chrome ou Edge

Menu **â‹® â†’ Installer ERP Tunisie**. L'application rejoint le Launchpad.

### macOS / iPad â€” Safari

**Partager â†’ Sur l'Ã©cran d'accueil**.

> L'installation exige **HTTPS** (ou `localhost`). En rÃ©seau local en HTTP,
> utilisez le navigateur directement, ou placez l'ERP derriÃ¨re un reverse proxy
> TLS (Caddy, Nginx).

---

## 8. RÃ©glementation tunisienne intÃ©grÃ©e

Tout le moteur fiscal et social vit dans `shared/fiscal.ts`, partagÃ© entre le
client et le serveur : un seul endroit Ã  modifier si un taux change.

### IRPP â€” 8 tranches, 0 % Ã  40 %

| Tranche (TND/an) | Taux |
|---|---:|
| 0 â€“ 5 000 | 0 % |
| 5 000 â€“ 10 000 | 15 % |
| 10 000 â€“ 20 000 | 25 % |
| 20 000 â€“ 30 000 | 30 % |
| 30 000 â€“ 40 000 | 33 % |
| 40 000 â€“ 50 000 | 36 % |
| 50 000 â€“ 70 000 | 38 % |
| au-delÃ  de 70 000 | 40 % |

Abattements : **300 TND** chef de famille, **100 TND** par personne Ã  charge.
La retenue mensuelle s'obtient en annualisant le salaire imposable, en
appliquant le barÃ¨me, puis en divisant par 12.

### Cotisations sociales

| Cotisation | Taux | Base |
|---|---:|---|
| CNSS salariÃ© | **9,68 %** | salaire brut |
| CNSS employeur | **17,07 %** | salaire brut |
| CSS (contribution sociale de solidaritÃ©) | **0,5 %** | salaire brut |

### TVA

Taux : **19 %**, **13 %**, **7 %**, **0 %**. Le module TVA tient deux comptes
sÃ©parÃ©s :

- **TVA collectÃ©e** â€” sur les factures de vente, ventilÃ©e par taux
- **TVA dÃ©ductible** â€” sur les factures d'achat, ventilÃ©e par taux
- **Liquidation** â€” TVA Ã  payer ou crÃ©dit de TVA reportable
- **DÃ©claration** â€” gÃ©nÃ©rÃ©e par pÃ©riode, Ã©chÃ©ance au 15 du mois suivant

### Autres impÃ´ts et taxes

| Ã‰lÃ©ment | Valeur |
|---|---|
| Timbre fiscal sur facture | **1,000 TND** |
| IS (impÃ´t sur les sociÃ©tÃ©s) | **15 %** ou **20 %** |
| Acomptes provisionnels | 3 acomptes de **30 %** de l'IS de rÃ©fÃ©rence |
| TCL (taxe sur les locaux) | 0,1 % gÃ©nÃ©ral Â· 0,2 % hÃ´tellerie |
| Retenue Ã  la source | 1 % Â· 3 % |

### ComptabilitÃ©

Plan comptable tunisien (25 comptes), journaux VE / AC / BQ / CA / OD / PA,
Ã©critures en **partie double** avec contrÃ´le d'Ã©quilibre dÃ©bit = crÃ©dit.
Bilan et Compte de RÃ©sultat sont produits Ã  partir des Ã©critures.

---

## 9. Architecture

Architecture **MVC avec services distincts** :

```
Vue      client/src/pages/*.tsx        React, une page par module
ContrÃ´leur  server/routers.ts          procÃ©dures tRPC, validation Zod
Service  server/services/*.ts          logique mÃ©tier, un fichier par domaine
ModÃ¨le   drizzle/schema.ts + server/db.ts   PostgreSQL via Drizzle ORM
```

Chaque service est indÃ©pendant et testable seul :

| Service | ResponsabilitÃ© |
|---|---|
| `accounting.ts` | Plan comptable, Ã©critures, balance, contrÃ´le d'Ã©quilibre |
| `reports.ts` | Bilan, Compte de RÃ©sultat |
| `declarations.ts` | CNSS, TVA, dÃ©pÃ´t de bilan annuel |
| `vat.ts` | TVA collectÃ©e / dÃ©ductible, liquidation |
| `efatoura.ts` | GÃ©nÃ©ration du XML TEIF |
| `seed.ts` | Jeu de donnÃ©es de dÃ©monstration |

### Pile technique

| Couche | Technologie |
|---|---|
| Interface | React 19, Tailwind CSS 4, Wouter, graphiques SVG natifs |
| API | Hono, tRPC 11, Zod |
| Base | PostgreSQL, Drizzle ORM |
| Auth | Sessions signÃ©es JWT (jose), bcrypt |
| Build | Vite 8, esbuild |
| Tests | Vitest |

### Imports / exports

Sur les listes Factures, Achats, Tiers, Articles et SalariÃ©s :

- **Export Excel** â€” vrai fichier `.xlsx` (SheetJS)
- **Export CSV** â€” sÃ©parateur `;`, encodage UTF-8 avec BOM (Excel FR l'ouvre directement)
- **Export PDF** â€” mise en page A4 paysage, en-tÃªte sociÃ©tÃ©
- **Import** â€” CSV et XLSX, avec modÃ¨le tÃ©lÃ©chargeable et compte-rendu ligne par ligne

---

## 10. Transmissions TTN / e-Fatoura

L'ERP transmet rÃ©ellement les dÃ©clarations Ã  la **TÃ©lÃ©dÃ©claration (TTN)** et
les factures Ã  **e-Fatoura**. Chaque envoi est journalisÃ© avec son statut et sa
rÃ©fÃ©rence.

Renseignez vos identifiants dans `.env` :

```bash
TTN_API_URL=https://api.teledeclaration.tn
TTN_API_KEY=votre_cle
EFATOURA_API_URL=https://api.e-fatoura.tn
EFATOURA_API_KEY=votre_cle
```

> **Sans ces clÃ©s, l'ERP refuse l'envoi et l'affiche clairement** dans le
> journal des transmissions. Aucune transmission n'est simulÃ©e : un envoi
> marquÃ© Â« transmis Â» correspond Ã  une rÃ©ponse HTTP rÃ©ussie de la plateforme.

Le XML e-Fatoura gÃ©nÃ©rÃ© suit le schÃ©ma **TEIF** (Tunisian Electronic Invoice
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

Automatisez la sauvegarde quotidienne avec une entrÃ©e `cron` :

```cron
0 2 * * * pg_dump -U erp erp_tunisie | gzip > /backup/erp_$(date +\%F).sql.gz
```

---

## 12. DÃ©pannage

| SymptÃ´me | Cause probable | Solution |
|---|---|---|
| `Missing required env var: DATABASE_URL` | `.env` absent ou incomplet | `cp .env.example .env` et renseignez l'URL |
| `ECONNREFUSED 5432` | PostgreSQL arrÃªtÃ© | `sudo systemctl start postgresql` |
| `password authentication failed` | Mauvais identifiants | VÃ©rifiez `DATABASE_URL` |
| Page blanche aprÃ¨s le build | `dist/public` absent | `pnpm build` |
| `relation "users" does not exist` | Migrations non appliquÃ©es | `pnpm db:migrate` |
| L'installation PWA ne s'affiche pas | Pas de HTTPS | Utilisez `localhost` ou un reverse proxy TLS |
| Autres postes : Â« site inaccessible Â» | Pare-feu | Ouvrez le port 3000 (voir Â§6) |
| Envoi TTN refusÃ© | ClÃ©s API absentes | Renseignez `TTN_API_KEY` / `EFATOURA_API_KEY` |

### VÃ©rifier l'Ã©tat du serveur

```bash
curl http://localhost:3000/api/health     # â†’ {"ok":true}
pnpm typecheck                            # types TypeScript
pnpm test                                 # suite de tests
```

---

## Licence et usage

Ce logiciel est livrÃ© pour l'usage de l'entreprise qui l'installe. Les taux
fiscaux et sociaux sont ceux en vigueur Ã  la date de livraison ; vÃ©rifiez-les
auprÃ¨s de la Direction GÃ©nÃ©rale des ImpÃ´ts et de la CNSS avant toute
utilisation en production, et mettez Ã  jour `shared/fiscal.ts` si la loi change.
