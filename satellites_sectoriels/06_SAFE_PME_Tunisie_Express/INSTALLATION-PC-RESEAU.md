# ERP Tunisie — Installation PC, réseau local et interface web

Ce document explique les trois façons d'utiliser l'ERP :

1. **Interface web** — l'application publiée, accessible depuis n'importe quel navigateur.
2. **Installation sur PC** — l'ERP s'installe comme une application de bureau (PWA).
3. **Réseau local** — l'ERP servi depuis un poste de l'entreprise, accessible aux autres postes.

---

## 1. Interface web

L'ERP est une application web complète : React côté client, API tRPC côté serveur,
**PostgreSQL** pour les données. Aucune installation n'est nécessaire pour l'utiliser.

- Ouvrez le lien de l'application dans Chrome, Edge, Firefox ou Safari.
- Toutes les données sont enregistrées côté serveur, dans PostgreSQL : elles sont
  partagées entre les postes et conservées entre les sessions.
- L'interface est en français, les montants en dinars tunisiens (TND) à 3 décimales.

---

## 2. Installation sur PC (application de bureau)

L'ERP est une **PWA** (Progressive Web App) : il s'installe comme un logiciel, avec
son icône, sa fenêtre propre et un démarrage sans barre d'adresse.

### Windows / Linux — Chrome ou Edge

1. Ouvrez l'ERP dans le navigateur.
2. Cliquez sur l'icône **Installer** dans la barre d'adresse (ou menu **⋮ → Installer
   ERP Tunisie**).
3. L'application s'ouvre dans sa propre fenêtre et apparaît dans le menu Démarrer.

Un bouton **Installer sur ce PC** est également disponible en haut de l'interface,
et dans **Paramètres → Installation & accès réseau**.

### macOS — Chrome ou Edge

Menu **⋮ → Installer ERP Tunisie**. L'application rejoint le Launchpad.

### macOS / iPad — Safari

**Partager → Sur l'écran d'accueil**.

### Ce que l'installation apporte

- Icône et fenêtre dédiées, sans interface de navigateur.
- Démarrage plus rapide (coquille mise en cache).
- Raccourcis : nouvelle facture, paie, fiscalité.
- Les données restent sur le serveur : l'installation ne les duplique pas.

> L'installation ne fonctionne que sur le **domaine publié** (HTTPS). Un lien de
> prévisualisation n'est pas installable.

---

## 3. Réseau local

Pour faire tourner l'ERP sur le serveur de l'entreprise et y accéder depuis les
autres postes du réseau local.

### Prérequis

- Un poste serveur (Windows, Linux ou macOS) avec **Node.js 20+** et **PostgreSQL 14+**.
- Le réseau local (même sous-réseau, ou routage entre VLAN).

### Étapes

```bash
# 1. Récupérer le code de l'application
git clone <dépôt> erp-tunisie && cd erp-tunisie

# 2. Installer les dépendances
pnpm install

# 3. Créer la base PostgreSQL
sudo -u postgres psql -c "CREATE DATABASE erp_tunisie;"
sudo -u postgres psql -c "CREATE USER erp WITH PASSWORD 'motdepasse_fort';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE erp_tunisie TO erp;"

# 4. Configurer l'environnement
cat > .env <<'ENV'
DATABASE_URL=postgresql://erp:motdepasse_fort@localhost:5432/erp_tunisie
JWT_SECRET=<chaîne aléatoire de 64 caractères>
PORT=3000
HOST=0.0.0.0
ENV

# 5. Appliquer le schéma
pnpm drizzle-kit push

# 6. Construire et démarrer
pnpm build
pnpm start
```

### Accès depuis les autres postes

Le serveur écoute sur `0.0.0.0:3000`. Depuis un autre poste du réseau :

```
http://<IP-du-serveur>:3000
```

Pour connaître l'IP du serveur : `ip addr` (Linux/macOS) ou `ipconfig` (Windows).

### Ouvrir le pare-feu

```bash
# Linux (ufw)
sudo ufw allow 3000/tcp

# Windows (PowerShell, en administrateur)
New-NetFirewallRule -DisplayName "ERP Tunisie" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### Nom d'hôte local (optionnel)

Pour utiliser `http://erp.local` au lieu d'une IP, ajoutez une entrée DNS sur le
serveur DHCP, ou dans le fichier `hosts` de chaque poste :

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

### Sauvegarde PostgreSQL

```bash
# Sauvegarde quotidienne
pg_dump -U erp erp_tunisie | gzip > /backup/erp_$(date +%F).sql.gz

# Restauration
gunzip -c /backup/erp_2026-11-22.sql.gz | psql -U erp erp_tunisie
```

---

## 4. Points de sécurité

- **Changez `JWT_SECRET`** et le mot de passe PostgreSQL avant la mise en service.
- En réseau local, l'ERP circule en HTTP : pour un accès hors du réseau de
  l'entreprise, placez-le derrière un reverse proxy HTTPS (Caddy, Nginx) ou
  utilisez la version publiée.
- L'ERP est actuellement **sans authentification** (accès libre par lien) : toute
  personne ayant l'URL peut consulter et modifier les données. Pour un usage en
  production avec plusieurs utilisateurs, demandez l'activation des comptes.
- Sauvegardez la base quotidiennement et testez la restauration.

---

## 5. Configuration des transmissions fiscales

Les envois vers la **Télédéclaration (TTN)** et **e-Fatoura** nécessitent vos
identifiants d'API, saisis dans **Web Admin → Secrets** :

| Clé | Usage |
|---|---|
| `TTN_API_URL` | URL de l'API de la Télédéclaration |
| `TTN_API_KEY` | Clé d'API TTN |
| `EFATOURA_API_URL` | URL de l'API e-Fatoura |
| `EFATOURA_API_KEY` | Clé d'API e-Fatoura |

Sans ces clés, l'ERP refuse l'envoi et l'indique clairement dans le journal des
transmissions — aucune transmission n'est simulée.
