# ERP Tunisie â€” Installation PC, rÃ©seau local et interface web

Ce document explique les trois faÃ§ons d'utiliser l'ERP :

1. **Interface web** â€” l'application publiÃ©e, accessible depuis n'importe quel navigateur.
2. **Installation sur PC** â€” l'ERP s'installe comme une application de bureau (PWA).
3. **RÃ©seau local** â€” l'ERP servi depuis un poste de l'entreprise, accessible aux autres postes.

---

## 1. Interface web

L'ERP est une application web complÃ¨te : React cÃ´tÃ© client, API tRPC cÃ´tÃ© serveur,
**PostgreSQL** pour les donnÃ©es. Aucune installation n'est nÃ©cessaire pour l'utiliser.

- Ouvrez le lien de l'application dans Chrome, Edge, Firefox ou Safari.
- Toutes les donnÃ©es sont enregistrÃ©es cÃ´tÃ© serveur, dans PostgreSQL : elles sont
  partagÃ©es entre les postes et conservÃ©es entre les sessions.
- L'interface est en franÃ§ais, les montants en dinars tunisiens (TND) Ã  3 dÃ©cimales.

---

## 2. Installation sur PC (application de bureau)

L'ERP est une **PWA** (Progressive Web App) : il s'installe comme un logiciel, avec
son icÃ´ne, sa fenÃªtre propre et un dÃ©marrage sans barre d'adresse.

### Windows / Linux â€” Chrome ou Edge

1. Ouvrez l'ERP dans le navigateur.
2. Cliquez sur l'icÃ´ne **Installer** dans la barre d'adresse (ou menu **â‹® â†’ Installer
   ERP Tunisie**).
3. L'application s'ouvre dans sa propre fenÃªtre et apparaÃ®t dans le menu DÃ©marrer.

Un bouton **Installer sur ce PC** est Ã©galement disponible en haut de l'interface,
et dans **ParamÃ¨tres â†’ Installation & accÃ¨s rÃ©seau**.

### macOS â€” Chrome ou Edge

Menu **â‹® â†’ Installer ERP Tunisie**. L'application rejoint le Launchpad.

### macOS / iPad â€” Safari

**Partager â†’ Sur l'Ã©cran d'accueil**.

### Ce que l'installation apporte

- IcÃ´ne et fenÃªtre dÃ©diÃ©es, sans interface de navigateur.
- DÃ©marrage plus rapide (coquille mise en cache).
- Raccourcis : nouvelle facture, paie, fiscalitÃ©.
- Les donnÃ©es restent sur le serveur : l'installation ne les duplique pas.

> L'installation ne fonctionne que sur le **domaine publiÃ©** (HTTPS). Un lien de
> prÃ©visualisation n'est pas installable.

---

## 3. RÃ©seau local

Pour faire tourner l'ERP sur le serveur de l'entreprise et y accÃ©der depuis les
autres postes du rÃ©seau local.

### PrÃ©requis

- Un poste serveur (Windows, Linux ou macOS) avec **Node.js 20+** et **PostgreSQL 14+**.
- Le rÃ©seau local (mÃªme sous-rÃ©seau, ou routage entre VLAN).

### Ã‰tapes

```bash
# 1. RÃ©cupÃ©rer le code de l'application
git clone <dÃ©pÃ´t> erp-tunisie && cd erp-tunisie

# 2. Installer les dÃ©pendances
pnpm install

# 3. CrÃ©er la base PostgreSQL
sudo -u postgres psql -c "CREATE DATABASE erp_tunisie;"
sudo -u postgres psql -c "CREATE USER erp WITH PASSWORD 'motdepasse_fort';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE erp_tunisie TO erp;"

# 4. Configurer l'environnement
cat > .env <<'ENV'
DATABASE_URL=postgresql://erp:motdepasse_fort@localhost:5432/erp_tunisie
JWT_SECRET=<chaÃ®ne alÃ©atoire de 64 caractÃ¨res>
PORT=3000
HOST=0.0.0.0
ENV

# 5. Appliquer le schÃ©ma
pnpm drizzle-kit push

# 6. Construire et dÃ©marrer
pnpm build
pnpm start
```

### AccÃ¨s depuis les autres postes

Le serveur Ã©coute sur `0.0.0.0:3000`. Depuis un autre poste du rÃ©seau :

```
http://<IP-du-serveur>:3000
```

Pour connaÃ®tre l'IP du serveur : `ip addr` (Linux/macOS) ou `ipconfig` (Windows).

### Ouvrir le pare-feu

```bash
# Linux (ufw)
sudo ufw allow 3000/tcp

# Windows (PowerShell, en administrateur)
New-NetFirewallRule -DisplayName "ERP Tunisie" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### Nom d'hÃ´te local (optionnel)

Pour utiliser `http://erp.local` au lieu d'une IP, ajoutez une entrÃ©e DNS sur le
serveur DHCP, ou dans le fichier `hosts` de chaque poste :

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

### Sauvegarde PostgreSQL

```bash
# Sauvegarde quotidienne
pg_dump -U erp erp_tunisie | gzip > /backup/erp_$(date +%F).sql.gz

# Restauration
gunzip -c /backup/erp_2026-11-22.sql.gz | psql -U erp erp_tunisie
```

---

## 4. Points de sÃ©curitÃ©

- **Changez `JWT_SECRET`** et le mot de passe PostgreSQL avant la mise en service.
- En rÃ©seau local, l'ERP circule en HTTP : pour un accÃ¨s hors du rÃ©seau de
  l'entreprise, placez-le derriÃ¨re un reverse proxy HTTPS (Caddy, Nginx) ou
  utilisez la version publiÃ©e.
- L'ERP est actuellement **sans authentification** (accÃ¨s libre par lien) : toute
  personne ayant l'URL peut consulter et modifier les donnÃ©es. Pour un usage en
  production avec plusieurs utilisateurs, demandez l'activation des comptes.
- Sauvegardez la base quotidiennement et testez la restauration.

---

## 5. Configuration des transmissions fiscales

Les envois vers la **TÃ©lÃ©dÃ©claration (TTN)** et **e-Fatoura** nÃ©cessitent vos
identifiants d'API, saisis dans **Web Admin â†’ Secrets** :

| ClÃ© | Usage |
|---|---|
| `TTN_API_URL` | URL de l'API de la TÃ©lÃ©dÃ©claration |
| `TTN_API_KEY` | ClÃ© d'API TTN |
| `EFATOURA_API_URL` | URL de l'API e-Fatoura |
| `EFATOURA_API_KEY` | ClÃ© d'API e-Fatoura |

Sans ces clÃ©s, l'ERP refuse l'envoi et l'indique clairement dans le journal des
transmissions â€” aucune transmission n'est simulÃ©e.
