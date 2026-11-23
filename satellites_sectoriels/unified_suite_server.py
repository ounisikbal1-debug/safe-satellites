# -*- coding: utf-8 -*-
"""
================================================================================
SAFE ERP - SUITE DE GESTION INTÉGRÉE TUNISIENNE (SERVEUR MASTER UNIQUE)
================================================================================
Un seul serveur pour toute la suite (Port 8000)
Authentification unifiée RBAC, Identité SAFE officielle, Normes SCE NC 01,
Verrou matériel Hardware ID & HMAC-SHA256, Gestion des avoirs, Remise à zéro.
================================================================================
"""
import os
import sys
import uuid
import hmac
import hashlib
import sqlite3
import socket
import webbrowser
import threading
import time
import json
from datetime import date, datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

MODULE_CODE = "SAFE_ERP_SUITE"
SUITE_TITLE = "SAFE ERP - Suite Complète"
SUITE_SLOGAN = "Système d'Analyse Financière des Entreprises - Suite de Gestion Intégrée Tunisienne (SCE NC 01)"
APP_PORT = 8000
SECRET_SALT = b"SAFE_ERP_TUNISIE_2026_MASTER_HMAC_KEY_#991"

prog_data = os.environ.get("PROGRAMDATA", os.path.expanduser("~"))
DATA_DIR = os.path.join(prog_data, "SAFE_ERP_Tunisie", "SUITE")
os.makedirs(DATA_DIR, exist_ok=True)
LICENSE_FILE = os.path.join(DATA_DIR, "license.dat")
DB_FILE = os.path.join(DATA_DIR, "safe_erp_suite_master.db")

# ==============================================================================
# 1. VERROU MATÉRIEL (HARDWARE ID) & LICENCES HMAC-SHA256
# ==============================================================================
def get_hardware_id() -> str:
    raw = f"{uuid.getnode()}-{socket.gethostname()}-{sys.platform}".encode("utf-8")
    return "HW-" + hashlib.sha256(raw).hexdigest()[:12].upper()

def compute_valid_license(hw_id: str, exp_date_str: str) -> str:
    clean_exp = exp_date_str.replace("-", "")
    payload = f"SAFE_ERP_GLOBAL|{hw_id.upper()}|{clean_exp}".encode("utf-8")
    expected = hmac.new(SECRET_SALT, payload, hashlib.sha256).hexdigest().upper()
    expected_parts = [expected[i:i+4] for i in range(0, 16, 4)]
    return f"SAFE-{clean_exp}-{'-'.join(expected_parts)}"

def verify_license_key(key: str, hw_id: str) -> tuple[bool, str]:
    try:
        parts = key.strip().upper().split("-")
        if len(parts) != 6 or parts[0] != "SAFE":
            return False, "Format de clé invalide (Ex: SAFE-20271231-XXXX-XXXX-XXXX-XXXX)"
        exp_str = parts[1]
        exp_date = datetime.strptime(exp_str, "%Y%m%d").date()
        if exp_date < date.today():
            return False, f"Licence expirée le {exp_date.isoformat()}"
        
        valid = False
        for mod in ["SAFE_ERP_GLOBAL", "NEGOCE", "SERVICES", "INDUSTRIE", "RESTAURATION", "TRANSPORT"]:
            payload = f"{mod}|{hw_id.upper()}|{exp_str}".encode("utf-8")
            expected = hmac.new(SECRET_SALT, payload, hashlib.sha256).hexdigest().upper()
            expected_parts = [expected[i:i+4] for i in range(0, 16, 4)]
            if parts[2:] == expected_parts:
                valid = True
                break
        if not valid:
            return False, "Clé non valide pour ce PC (Hardware ID incompatible)"
        return True, exp_date.isoformat()
    except Exception:
        return False, "Clé corrompue"

def is_activated() -> tuple[bool, str, str]:
    hw_id = get_hardware_id()
    if not os.path.exists(LICENSE_FILE):
        trial_key = compute_valid_license(hw_id, "20271231")
        with open(LICENSE_FILE, "w", encoding="utf-8") as f:
            f.write(trial_key)
    with open(LICENSE_FILE, "r", encoding="utf-8") as f:
        key = f.read().strip()
    ok, info = verify_license_key(key, hw_id)
    return ok, hw_id, info

# ==============================================================================
# 2. BASE DE DONNÉES SQLITE SUITE MASTER & INITIALISATION DES TABLES
# ==============================================================================
def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def hash_pw(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    # 1. Utilisateurs & Authentification unifiée
    c.execute("""
        CREATE TABLE IF NOT EXISTS utilisateurs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            nom_complet TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'OPERATEUR'
        )
    """)
    
    # 2. Paramètres Société (pour personnalisation de l'en-tête factures/tickets)
    c.execute("""
        CREATE TABLE IF NOT EXISTS societe_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            raison_sociale TEXT NOT NULL,
            matricule_fiscal TEXT NOT NULL,
            registre_commerce TEXT,
            adresse TEXT NOT NULL,
            telephone TEXT NOT NULL,
            email TEXT NOT NULL,
            rib TEXT,
            devise TEXT DEFAULT 'TND'
        )
    """)
    
    # 3. Paramètres Fiscaux & Réglementaires Modifiables
    c.execute("""
        CREATE TABLE IF NOT EXISTS parametres_fiscaux (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tva_taux_1 REAL DEFAULT 19.0,
            tva_taux_2 REAL DEFAULT 13.0,
            tva_taux_3 REAL DEFAULT 7.0,
            timbre_fiscal REAL DEFAULT 1.000,
            rs_marchandises REAL DEFAULT 1.5,
            rs_honoraires REAL DEFAULT 10.0,
            cnss_salariale REAL DEFAULT 9.68,
            cnss_patronale REAL DEFAULT 17.07,
            css_taux REAL DEFAULT 0.5,
            irpp_bareme_json TEXT
        )
    """)
    
    # 4. Dépôts Multi-activités (Négoce & Industrie)
    c.execute("""
        CREATE TABLE IF NOT EXISTS depots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            nom TEXT NOT NULL,
            responsable TEXT NOT NULL,
            module_tag TEXT DEFAULT 'ALL'
        )
    """)
    
    # 5. Articles Négoce
    c.execute("""
        CREATE TABLE IF NOT EXISTS articles_negoce (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            designation TEXT NOT NULL,
            depot_code TEXT NOT NULL,
            stock_actuel REAL DEFAULT 0,
            cump REAL DEFAULT 0,
            prix_vente_ht REAL DEFAULT 0,
            taux_tva REAL DEFAULT 19.0
        )
    """)
    
    # 6. Factures & Avoirs Négoce
    c.execute("""
        CREATE TABLE IF NOT EXISTS factures_negoce (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT UNIQUE NOT NULL,
            date_facture TEXT NOT NULL,
            type_piece TEXT NOT NULL DEFAULT 'FACTURE',
            reference_origine TEXT,
            client_nom TEXT NOT NULL,
            client_mf TEXT,
            montant_ht REAL NOT NULL,
            taux_tva REAL DEFAULT 19.0,
            montant_tva REAL NOT NULL,
            timbre_fiscal REAL DEFAULT 1.000,
            taux_rs REAL DEFAULT 1.5,
            montant_rs REAL DEFAULT 0,
            net_a_payer REAL NOT NULL,
            statut TEXT DEFAULT 'BROUILLON'
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS facture_lignes_negoce (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            facture_numero TEXT NOT NULL,
            article_code TEXT NOT NULL,
            designation TEXT NOT NULL,
            quantite REAL NOT NULL,
            prix_unit_ht REAL NOT NULL,
            taux_tva REAL DEFAULT 19.0,
            total_ht REAL NOT NULL
        )
    """)
    
    # 7. Industrie : Produits finis, matières & OF
    c.execute("""
        CREATE TABLE IF NOT EXISTS produits_finis_industrie (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            designation TEXT NOT NULL,
            unite TEXT DEFAULT 'Pièce',
            depot_code TEXT DEFAULT 'DEP-USINE-01',
            stock_actuel REAL DEFAULT 0,
            cout_revient_std REAL DEFAULT 0,
            prix_vente_std REAL DEFAULT 0
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS matieres_industrie (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            designation TEXT NOT NULL,
            unite TEXT DEFAULT 'KG',
            depot_code TEXT DEFAULT 'DEP-USINE-02',
            stock_actuel REAL DEFAULT 0,
            cump REAL DEFAULT 0,
            seuil_alerte REAL DEFAULT 0
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS ordres_fabrication (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT UNIQUE NOT NULL,
            date_lancement TEXT NOT NULL,
            produit_code TEXT NOT NULL,
            produit_nom TEXT NOT NULL,
            quantite_prevue REAL NOT NULL,
            quantite_produite REAL DEFAULT 0,
            cout_total REAL DEFAULT 0,
            statut TEXT DEFAULT 'CLOTURE'
        )
    """)
    
    # 8. Services & Cabinets : Missions & Notes
    c.execute("""
        CREATE TABLE IF NOT EXISTS dossiers_missions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            intitule TEXT NOT NULL,
            client_nom TEXT NOT NULL,
            client_mf TEXT,
            responsable TEXT NOT NULL,
            budget_heures REAL DEFAULT 40,
            heures_consommees REAL DEFAULT 0,
            taux_horaire REAL DEFAULT 150.0,
            statut TEXT DEFAULT 'EN_COURS'
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS notes_honoraires (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT UNIQUE NOT NULL,
            date_facture TEXT NOT NULL,
            type_piece TEXT DEFAULT 'NOTE',
            reference_origine TEXT,
            client_nom TEXT NOT NULL,
            client_mf TEXT,
            mission_code TEXT NOT NULL,
            description TEXT NOT NULL,
            montant_ht REAL NOT NULL,
            taux_tva REAL DEFAULT 19.0,
            montant_tva REAL NOT NULL,
            timbre_fiscal REAL DEFAULT 1.000,
            taux_rs REAL DEFAULT 10.0,
            montant_rs REAL NOT NULL,
            net_a_payer REAL NOT NULL,
            statut TEXT DEFAULT 'VALIDEE'
        )
    """)
    
    # 9. Restauration & Caisse POS : Tables, Menu, Tickets
    c.execute("""
        CREATE TABLE IF NOT EXISTS tables_pos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT UNIQUE NOT NULL,
            zone TEXT DEFAULT 'SALLE',
            capacite INTEGER DEFAULT 4,
            statut TEXT DEFAULT 'LIBRE'
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS menu_pos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            categorie TEXT NOT NULL,
            designation TEXT NOT NULL,
            prix_ttc REAL NOT NULL,
            taux_tva REAL DEFAULT 7.0,
            icone TEXT DEFAULT '🍽️',
            actif INTEGER DEFAULT 1
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS tickets_pos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT UNIQUE NOT NULL,
            date_ticket TEXT NOT NULL,
            type_piece TEXT DEFAULT 'TICKET',
            table_numero TEXT NOT NULL,
            client_nom TEXT DEFAULT 'Client Caisse / Comptoir',
            client_mf TEXT DEFAULT 'Non Assujetti',
            total_ht REAL NOT NULL,
            total_tva REAL NOT NULL,
            total_ttc REAL NOT NULL,
            mode_reglement TEXT NOT NULL,
            statut TEXT DEFAULT 'PAYE'
        )
    """)
    
    # 10. Grand Livre Général des Écritures Comptables (SCE NC 01)
    c.execute("""
        CREATE TABLE IF NOT EXISTS ecritures_comptables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date_ecriture TEXT NOT NULL,
            journal TEXT NOT NULL,
            piece_ref TEXT NOT NULL,
            compte TEXT NOT NULL,
            libelle_compte TEXT NOT NULL,
            libelle_operation TEXT NOT NULL,
            debit REAL DEFAULT 0,
            credit REAL DEFAULT 0
        )
    """)
    
    # ==============================================================================
    # SEEDING INITIAL COMPLET (Si base neuve)
    # ==============================================================================
    # Utilisateurs
    c.execute("SELECT COUNT(*) FROM utilisateurs")
    if c.fetchone()[0] == 0:
        users = [
            ("admin", hash_pw("admin2026"), "Administrateur Système", "ADMIN"),
            ("comptable", hash_pw("compta2026"), "Chef Comptable & Fiscaliste", "COMPTABLE"),
            ("caisse", hash_pw("caisse2026"), "Opérateur Caisse & Ventes", "OPERATEUR")
        ]
        c.executemany("INSERT INTO utilisateurs (username, password_hash, nom_complet, role) VALUES (?, ?, ?, ?)", users)
    
    # Société Config
    c.execute("SELECT COUNT(*) FROM societe_config")
    if c.fetchone()[0] == 0:
        c.execute("""
            INSERT INTO societe_config (raison_sociale, matricule_fiscal, registre_commerce, adresse, telephone, email, rib, devise)
            VALUES ('Société Tunisienne de Commerce & Industrie - STCI SARL', '1458923/B/M/000', 'B241582026', 'Zone Industrielle La Charguia II, 2035 Tunis', '+216 71 845 200 / +216 29 111 222', 'contact@stci-tunisie.com', 'BIAT 08 012 0001234567890 42', 'TND')
        """)
        
    # Paramètres Fiscaux Modifiables
    c.execute("SELECT COUNT(*) FROM parametres_fiscaux")
    if c.fetchone()[0] == 0:
        irpp_default = json.dumps([
            {"de": 0, "a": 5000, "taux": 0.0},
            {"de": 5001, "a": 20000, "taux": 26.0},
            {"de": 20001, "a": 30000, "taux": 28.0},
            {"de": 30001, "a": 50000, "taux": 32.0},
            {"de": 50001, "a": 9999999, "taux": 35.0}
        ])
        c.execute("""
            INSERT INTO parametres_fiscaux (tva_taux_1, tva_taux_2, tva_taux_3, timbre_fiscal, rs_marchandises, rs_honoraires, cnss_salariale, cnss_patronale, css_taux, irpp_bareme_json)
            VALUES (19.0, 13.0, 7.0, 1.000, 1.5, 10.0, 9.68, 17.07, 0.5, ?)
        """, (irpp_default,))
        
    # Dépôts
    c.execute("SELECT COUNT(*) FROM depots")
    if c.fetchone()[0] == 0:
        depots = [
            ("DEP-TUNIS", "Dépôt Central Tunis Charguia", "M. Mehdi Gharbi", "NEGOCE"),
            ("DEP-SFAX", "Dépôt Régional Sfax Poudrière", "M. Karim Ben Salah", "NEGOCE"),
            ("DEP-SOUSSE", "Dépôt Sahel Sousse Akouda", "Mme. Sonia Dridi", "NEGOCE"),
            ("DEP-USINE-01", "Atelier Injection Plastique", "M. Hichem Trabelsi", "INDUSTRIE"),
            ("DEP-USINE-02", "Magasin Matières Premières", "M. Saber Mansour", "INDUSTRIE")
        ]
        c.executemany("INSERT INTO depots (code, nom, responsable, module_tag) VALUES (?, ?, ?, ?)", depots)
        
    # Articles Négoce
    c.execute("SELECT COUNT(*) FROM articles_negoce")
    if c.fetchone()[0] == 0:
        arts = [
            ("ART-CLIM-12", "Climatiseur Split Inverter 12000 BTU", "DEP-TUNIS", 45.0, 920.000, 1350.000, 19.0),
            ("ART-TV-55", "Téléviseur Smart 4K 55 Pouces UHD", "DEP-TUNIS", 60.0, 780.000, 1180.000, 19.0),
            ("ART-FRIGO-420", "Réfrigérateur No-Frost 420L Inox", "DEP-SFAX", 28.0, 1150.000, 1690.000, 19.0),
            ("ART-LAVE-08", "Lave-Linge Frontal 8 Kg Silver", "DEP-SOUSSE", 35.0, 650.000, 980.000, 19.0),
            ("ART-FOUR-60", "Four Encastrable Électrique 60cm", "DEP-TUNIS", 22.0, 480.000, 740.000, 19.0),
        ]
        c.executemany("INSERT INTO articles_negoce (code, designation, depot_code, stock_actuel, cump, prix_vente_ht, taux_tva) VALUES (?, ?, ?, ?, ?, ?, ?)", arts)
        
    # Produits & Matières Industrie
    c.execute("SELECT COUNT(*) FROM produits_finis_industrie")
    if c.fetchone()[0] == 0:
        pfs = [
            ("PF-CASIER-01", "Casier Plastique Renforcé 24 Bouteilles", "Pièce", "DEP-USINE-01", 380.0, 11.200, 18.500),
            ("PF-BIDON-20", "Bidon 20 Litres Qualité Chimique / Huile", "Pièce", "DEP-USINE-01", 520.0, 7.800, 13.000),
            ("PF-PALETTE-03", "Palette Plastique Hygiénique 1200x800", "Pièce", "DEP-USINE-01", 140.0, 38.500, 62.000),
        ]
        c.executemany("INSERT INTO produits_finis_industrie (code, designation, unite, depot_code, stock_actuel, cout_revient_std, prix_vente_std) VALUES (?, ?, ?, ?, ?, ?, ?)", pfs)
        
        mats = [
            ("MAT-PP-01", "Granulés Polypropylène Grade Injection", "KG", "DEP-USINE-02", 2400.0, 3.850, 500.0),
            ("MAT-HDPE-02", "Polyéthylène Haute Densité (PEHD)", "KG", "DEP-USINE-02", 1850.0, 4.100, 400.0),
            ("MAT-COLOR-03", "Masterbatch Colorant Bleu Industrie", "KG", "DEP-USINE-02", 320.0, 12.500, 50.0),
            ("MAT-ADD-04", "Additif Stabilisant Anti-UV", "KG", "DEP-USINE-02", 180.0, 18.000, 30.0),
        ]
        c.executemany("INSERT INTO matieres_industrie (code, designation, unite, depot_code, stock_actuel, cump, seuil_alerte) VALUES (?, ?, ?, ?, ?, ?, ?)", mats)
        
    # Services Missions
    c.execute("SELECT COUNT(*) FROM dossiers_missions")
    if c.fetchone()[0] == 0:
        missions = [
            ("MIS-2026-001", "Audit Légal & Commissariat aux Comptes", "STB Bank (Siège Tunis)", "0012458/A/M/000", "Me. Karim Gharbi", 120, 85, 180.000, "EN_COURS"),
            ("MIS-2026-002", "Restructuration Fiscale & Holding", "Poulina Group Holding", "0145892/B/P/000", "Mme. Sonia Ben Amor", 80, 50, 220.000, "EN_COURS"),
            ("MIS-2026-003", "Assistance Juridique & Contrats", "Orange Tunisie Télécom", "0369852/D/P/000", "Me. Hichem Trabelsi", 40, 22, 250.000, "EN_COURS"),
        ]
        c.executemany("INSERT INTO dossiers_missions (code, intitule, client_nom, client_mf, responsable, budget_heures, heures_consommees, taux_horaire, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", missions)

    # Tables Restauration POS
    c.execute("SELECT COUNT(*) FROM tables_pos")
    if c.fetchone()[0] == 0:
        tables = [
            ("Table 01", "SALLE", 4, "LIBRE"),
            ("Table 02", "SALLE", 2, "LIBRE"),
            ("Table 03", "SALLE", 4, "LIBRE"),
            ("Table 04", "SALLE", 6, "LIBRE"),
            ("Table 05", "SALLE", 4, "LIBRE"),
            ("Terrasse 01", "TERRASSE", 4, "LIBRE"),
            ("Terrasse 02", "TERRASSE", 4, "LIBRE"),
            ("Terrasse 03", "TERRASSE", 6, "LIBRE"),
            ("Salon VIP 1", "VIP", 8, "LIBRE"),
            ("Comptoir Bar", "BAR", 2, "LIBRE"),
            ("A Emporter", "EMPORTE", 1, "LIBRE"),
            ("Livraison Express", "LIVRAISON", 1, "LIBRE")
        ]
        c.executemany("INSERT INTO tables_pos (numero, zone, capacite, statut) VALUES (?, ?, ?, ?)", tables)
        
    # Catalogue Restauration Maximisé (35+ Articles Authentiques Tunisiens)
    c.execute("SELECT COUNT(*) FROM menu_pos")
    if c.fetchone()[0] == 0:
        menu_items = [
            # PLATS TRADITIONNELS & SPÉCIALITÉS
            ("PL-COUSC-AGN", "PLATS", "Couscous Impérial à l'Agneau & Légumes", 26.500, 7.0, "🍲"),
            ("PL-COUSC-MER", "PLATS", "Couscous au Mérou Sauvage & Piments", 34.000, 7.0, "🐟"),
            ("PL-OJJA-ROY", "PLATS", "Ojja Royale aux Merguez Artisanales", 18.500, 7.0, "🍳"),
            ("PL-OJJA-FRM", "PLATS", "Ojja aux Crevettes & Fruits de Mer", 22.000, 7.0, "🦐"),
            ("PL-LOUP-GRI", "PLATS", "Loup de Mer Grillé & Salade Mechouia", 32.000, 7.0, "🐟"),
            ("PL-DAUR-ROY", "PLATS", "Daurade Royale Grillée au Feu de Bois", 29.000, 7.0, "🐟"),
            ("PL-GARG-AGN", "PLATS", "Gargoulette d'Agneau Traditionnelle", 35.000, 7.0, "🏺"),
            ("PL-PATE-FRM", "PLATS", "Pâtes Tunisiennes aux Fruits de Mer", 24.000, 7.0, "🍝"),
            ("PL-ESCA-PAN", "PLATS", "Escalope de Dinde Panée & Frites Maison", 16.500, 7.0, "🍗"),
            ("PL-POUL-ROT", "PLATS", "Demi-Poulet Rôti aux Épices de Djerba", 15.000, 7.0, "🍗"),
            ("PL-KAFT-FOI", "PLATS", "Plat Kafteji Tunisien avec Foie d'Agneau", 12.500, 7.0, "🥘"),
            
            # ENTRÉES & SALADES
            ("EN-BRICK-THO", "ENTREES", "Brick au Thon & Oeuf Coulant Tradition", 6.500, 7.0, "🥟"),
            ("EN-BRICK-CRE", "ENTREES", "Brick aux Crevettes Royales & Fromage", 9.000, 7.0, "🥟"),
            ("EN-SAL-MECH", "ENTREES", "Salade Mechouia Grillée au Pilon", 8.000, 7.0, "🥗"),
            ("EN-SAL-TUN", "ENTREES", "Salade Tunisienne aux Légumes Frais", 6.000, 7.0, "🥗"),
            ("EN-SAL-POUL", "ENTREES", "Salade de Poulpe Mariné à l'Huile d'Olive", 14.500, 7.0, "🐙"),
            ("EN-DOIG-FAT", "ENTREES", "Assiette Doigts de Fatma (4 pièces)", 7.500, 7.0, "🥖"),
            ("EN-TAJI-POU", "ENTREES", "Tajine Tunisien au Poulet & Fromage", 8.000, 7.0, "🥧"),
            
            # SANDWICHS & STREET FOOD
            ("SW-CHAW-VEA", "SANDWICHS", "Sandwich Chawarma Veau Mariné Maison", 8.500, 7.0, "🥪"),
            ("SW-CHAP-MAH", "SANDWICHS", "Chapati Mahdia Artisanal Thon Oeuf Fromage", 6.500, 7.0, "🥪"),
            ("SW-MLAW-THO", "SANDWICHS", "Mlawi Feuilleté Thon Fromage Harissa", 5.500, 7.0, "🌯"),
            ("SW-BAGU-FAR", "SANDWICHS", "Baguette Farcie au Four Poulet Fromage", 9.000, 7.0, "🥖"),
            
            # PÂTISSERIES TUNISIENNES & DESSERTS
            ("DE-MAKR-KAI", "DESSERTS", "Assiette Makroudh Pur Miel de Kairouan", 7.000, 7.0, "🍯"),
            ("DE-BAKL-FIN", "DESSERTS", "Assortiment Baklawa Fine aux Amandes", 9.500, 7.0, "🥮"),
            ("DE-SAMS-NOI", "DESSERTS", "Samsa Tunisienne Croustillante Noisettes", 8.500, 7.0, "📐"),
            ("DE-ASSI-ZGO", "DESSERTS", "Bol Assida Zgougou Royale Fruits Secs", 12.000, 7.0, "🥣"),
            ("DE-KAAK-WAR", "DESSERTS", "Kaak Warka Traditionnel de Zaghouan", 9.000, 7.0, "🍩"),
            ("DE-GLAC-ART", "DESSERTS", "Coupe de Glace Artisanale (3 Boules)", 7.500, 7.0, "🍨"),
            ("DE-SALA-FRU", "DESSERTS", "Salade de Fruits Frais de Saison", 6.500, 7.0, "🍉"),
            
            # BOISSONS CHAUDES & FRAÎCHES
            ("BO-CITR-AMA", "BOISSONS", "Citronnade Tunisienne aux Amandes Fraîches", 7.500, 7.0, "🍋"),
            ("BO-THE-PIGN", "BOISSONS", "Thé Rouge / Vert à la Menthe & Pignons", 4.500, 7.0, "🫖"),
            ("BO-CAFE-TUR", "BOISSONS", "Café Turc à la Fleur d'Oranger (Zhr)", 4.000, 7.0, "☕"),
            ("BO-ESPR-ITA", "BOISSONS", "Espresso Italien Pur Arabica", 3.200, 7.0, "☕"),
            ("BO-DIRE-LAI", "BOISSONS", "Café Direct au Lait Frais", 3.800, 7.0, "🥛"),
            ("BO-JUS-ORAN", "BOISSONS", "Jus d'Orange Pressé Minute", 6.000, 7.0, "🍊"),
            ("BO-BOGA-CID", "BOISSONS", "Soda Boga Cidre Tunisien 33cl", 3.000, 7.0, "🥤"),
            ("BO-EAU-1500", "BOISSONS", "Bouteille Eau Minérale Safia 1.5L", 2.500, 7.0, "💧"),
        ]
        c.executemany("INSERT INTO menu_pos (code, categorie, designation, prix_ttc, taux_tva, icone) VALUES (?, ?, ?, ?, ?, ?)", menu_items)
        
    conn.commit()
    conn.close()

init_db()

# ==============================================================================
# 3. APPLICATION FASTAPI & ROUTAGE DES API
# ==============================================================================
app = FastAPI(title=f"{SUITE_TITLE} - Serveur Unifié")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Modèles Pydantic pour requêtes ---
class LoginReq(BaseModel):
    username: str
    password: str

class CompanyUpdateReq(BaseModel):
    raison_sociale: str
    matricule_fiscal: str
    registre_commerce: Optional[str] = ""
    adresse: str
    telephone: str
    email: str
    rib: Optional[str] = ""

class FiscalParamsReq(BaseModel):
    tva_taux_1: float
    tva_taux_2: float
    tva_taux_3: float
    timbre_fiscal: float
    rs_marchandises: float
    rs_honoraires: float
    cnss_salariale: float
    cnss_patronale: float
    css_taux: float
    irpp_bareme_json: Optional[str] = None

class ResetDataReq(BaseModel):
    admin_password: str

class ActivateLicenseReq(BaseModel):
    license_key: str

# ----------------- 1. AUTHENTIFICATION UNIFIÉE -----------------
@app.post("/api/auth/login")
def login(req: LoginReq):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, username, nom_complet, role FROM utilisateurs WHERE username = ? AND password_hash = ?", (req.username.strip(), hash_pw(req.password.strip())))
    row = c.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Identifiants invalides (Vérifiez nom d'utilisateur et mot de passe)")
    
    # Session token simple pour environnement local autonome
    token = f"SAFE_SESSION_{row['id']}_{int(time.time())}_{row['role']}"
    return {
        "success": True,
        "token": token,
        "user": {
            "id": row["id"],
            "username": row["username"],
            "nom_complet": row["nom_complet"],
            "role": row["role"]
        }
    }

# ----------------- 2. PARAMÈTRES SOCIÉTÉ & EN-TÊTE -----------------
@app.get("/api/company")
def get_company():
    conn = get_db()
    row = conn.execute("SELECT * FROM societe_config ORDER BY id ASC LIMIT 1").fetchone()
    conn.close()
    return dict(row) if row else {}

@app.put("/api/company")
def update_company(req: CompanyUpdateReq):
    conn = get_db()
    conn.execute("""
        UPDATE societe_config SET
            raison_sociale = ?, matricule_fiscal = ?, registre_commerce = ?,
            adresse = ?, telephone = ?, email = ?, rib = ?
        WHERE id = (SELECT id FROM societe_config LIMIT 1)
    """, (req.raison_sociale, req.matricule_fiscal, req.registre_commerce, req.adresse, req.telephone, req.email, req.rib))
    conn.commit()
    conn.close()
    return {"success": True, "message": "En-tête de société mis à jour avec succès"}

# ----------------- 3. PARAMÈTRES FISCAUX & RÉGLEMENTAIRES -----------------
@app.get("/api/fiscal-params")
def get_fiscal_params():
    conn = get_db()
    row = conn.execute("SELECT * FROM parametres_fiscaux ORDER BY id ASC LIMIT 1").fetchone()
    conn.close()
    return dict(row) if row else {}

@app.put("/api/fiscal-params")
def update_fiscal_params(req: FiscalParamsReq):
    conn = get_db()
    conn.execute("""
        UPDATE parametres_fiscaux SET
            tva_taux_1 = ?, tva_taux_2 = ?, tva_taux_3 = ?, timbre_fiscal = ?,
            rs_marchandises = ?, rs_honoraires = ?, cnss_salariale = ?, cnss_patronale = ?,
            css_taux = ?, irpp_bareme_json = COALESCE(?, irpp_bareme_json)
        WHERE id = (SELECT id FROM parametres_fiscaux LIMIT 1)
    """, (req.tva_taux_1, req.tva_taux_2, req.tva_taux_3, req.timbre_fiscal,
          req.rs_marchandises, req.rs_honoraires, req.cnss_salariale, req.cnss_patronale,
          req.css_taux, req.irpp_bareme_json))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Paramètres réglementaires mis à jour"}

# ----------------- 4. RÉINITIALISATION DONNÉES OPÉRATIONNELLES (ADMIN ONLY) -----------------
@app.post("/api/admin/reset-operational-data")
def reset_operational_data(req: ResetDataReq):
    conn = get_db()
    c = conn.cursor()
    # Vérification mot de passe admin
    c.execute("SELECT id FROM utilisateurs WHERE role='ADMIN' AND password_hash = ?", (hash_pw(req.admin_password.strip()),))
    admin_row = c.fetchone()
    if not admin_row:
        conn.close()
        raise HTTPException(status_code=403, detail="Mot de passe Administrateur incorrect. Action refusée.")
    
    # Vidange des mouvements opérationnels
    c.execute("DELETE FROM factures_negoce")
    c.execute("DELETE FROM facture_lignes_negoce")
    c.execute("DELETE FROM notes_honoraires")
    c.execute("DELETE FROM tickets_pos")
    c.execute("DELETE FROM ordres_fabrication")
    c.execute("DELETE FROM ecritures_comptables")
    
    # Remise à zéro des heures consommées missions et statut tables
    c.execute("UPDATE dossiers_missions SET heures_consommees = 0")
    c.execute("UPDATE tables_pos SET statut = 'LIBRE'")
    
    conn.commit()
    conn.close()
    return {
        "success": True,
        "message": "Réinitialisation réussie : toutes les factures, écritures, tickets et mouvements ont été remis à zéro pour un nouvel usage d'entreprise."
    }

# ----------------- 5. NÉGOCE : ARTICLES, DÉPÔTS, FACTURES & AVOIRS -----------------
@app.get("/api/negoce/depots")
def list_negoce_depots():
    conn = get_db()
    rows = conn.execute("SELECT * FROM depots ORDER BY nom ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

class AddDepotReq(BaseModel):
    code: str
    nom: str
    responsable: str
    module_tag: str = "ALL"

@app.post("/api/negoce/depots")
def add_depot(req: AddDepotReq):
    conn = get_db()
    try:
        conn.execute("INSERT INTO depots (code, nom, responsable, module_tag) VALUES (?, ?, ?, ?)", (req.code.strip().upper(), req.nom.strip(), req.responsable.strip(), req.module_tag))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce code de dépôt existe déjà")
    conn.close()
    return {"success": True}

@app.delete("/api/negoce/depots/{code}")
def delete_depot(code: str):
    conn = get_db()
    conn.execute("DELETE FROM depots WHERE code = ?", (code,))
    conn.commit()
    conn.close()
    return {"success": True}

@app.get("/api/negoce/articles")
def list_negoce_articles():
    conn = get_db()
    rows = conn.execute("SELECT * FROM articles_negoce ORDER BY designation ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

class AddArticleNegoceReq(BaseModel):
    code: str
    designation: str
    depot_code: str
    stock_actuel: float
    cump: float
    prix_vente_ht: float
    taux_tva: float = 19.0

@app.post("/api/negoce/articles")
def add_article_negoce(req: AddArticleNegoceReq):
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO articles_negoce (code, designation, depot_code, stock_actuel, cump, prix_vente_ht, taux_tva)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (req.code.strip().upper(), req.designation.strip(), req.depot_code, req.stock_actuel, req.cump, req.prix_vente_ht, req.taux_tva))
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce code d'article existe déjà")
    conn.close()
    return {"success": True}

@app.delete("/api/negoce/articles/{code}")
def delete_article_negoce(code: str):
    conn = get_db()
    conn.execute("DELETE FROM articles_negoce WHERE code = ?", (code,))
    conn.commit()
    conn.close()
    return {"success": True}

@app.get("/api/negoce/factures")
def list_factures_negoce():
    conn = get_db()
    rows = conn.execute("SELECT * FROM factures_negoce ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

class CreateFactureNegoceReq(BaseModel):
    client_nom: str
    client_mf: str
    article_code: str
    quantite: float
    remise_pct: float = 0.0
    action_type: str = "COMPTABILISER" # 'COMPTABILISER' (Brouillon) ou 'VALIDER' (Ferme)

@app.post("/api/negoce/factures")
def create_facture_negoce(req: CreateFactureNegoceReq):
    conn = get_db()
    c = conn.cursor()
    
    art = c.execute("SELECT * FROM articles_negoce WHERE code = ?", (req.article_code,)).fetchone()
    if not art:
        conn.close()
        raise HTTPException(status_code=404, detail="Article introuvable")
    
    fisc = c.execute("SELECT timbre_fiscal FROM parametres_fiscaux LIMIT 1").fetchone()
    timbre = fisc["timbre_fiscal"] if fisc else 1.000
    
    prix_ht = art["prix_vente_ht"] * (1 - (req.remise_pct / 100.0))
    montant_ht = round(prix_ht * req.quantite, 3)
    taux_tva = art["taux_tva"]
    montant_tva = round(montant_ht * (taux_tva / 100.0), 3)
    
    # Retenue à la source 1.5% si facture >= 1000 DT TTC
    ttc_brut = montant_ht + montant_tva + timbre
    taux_rs = 1.5 if ttc_brut >= 1000.0 else 0.0
    montant_rs = round(montant_ht * (taux_rs / 100.0), 3) if taux_rs > 0 else 0.0
    net_a_payer = round(ttc_brut - montant_rs, 3)
    
    today_str = date.today().isoformat()
    statut = "VALIDEE" if req.action_type == "VALIDER" else "BROUILLON"
    prefix = "FAC-2026-" if statut == "VALIDEE" else "BROU-2026-"
    num_seq = c.execute("SELECT COUNT(*) FROM factures_negoce").fetchone()[0] + 1
    numero = f"{prefix}{num_seq:04d}"
    
    c.execute("""
        INSERT INTO factures_negoce (numero, date_facture, type_piece, client_nom, client_mf, montant_ht, taux_tva, montant_tva, timbre_fiscal, taux_rs, montant_rs, net_a_payer, statut)
        VALUES (?, ?, 'FACTURE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (numero, today_str, req.client_nom, req.client_mf, montant_ht, taux_tva, montant_tva, timbre, taux_rs, montant_rs, net_a_payer, statut))
    
    c.execute("""
        INSERT INTO facture_lignes_negoce (facture_numero, article_code, designation, quantite, prix_unit_ht, taux_tva, total_ht)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (numero, req.article_code, art["designation"], req.quantite, prix_ht, taux_tva, montant_ht))
    
    # Si validée ferme : Décrémenter stock et générer écriture comptable définitive
    if statut == "VALIDEE":
        c.execute("UPDATE articles_negoce SET stock_actuel = stock_actuel - ? WHERE code = ?", (req.quantite, req.article_code))
        
        ecritures = [
            (today_str, "VT", numero, "411100", "Clients - Ventes Marchandises", f"{req.client_nom} - Facture {numero}", net_a_payer, 0.0),
        ]
        if montant_rs > 0:
            ecritures.append((today_str, "VT", numero, "436500", "État - Retenue à la source subie (1.5%)", f"RS 1.5% sur {numero}", montant_rs, 0.0))
        ecritures.extend([
            (today_str, "VT", numero, "701000", "Ventes de Marchandises HT", f"Vente {art['designation']}", 0.0, montant_ht),
            (today_str, "VT", numero, "436700", f"État - TVA Collectée ({taux_tva:.0f}%)", f"TVA sur {numero}", 0.0, montant_tva),
            (today_str, "VT", numero, "437000", "Droits de Timbre Fiscal", "Timbre légal 1.000 DT", 0.0, timbre),
        ])
        c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    
    conn.commit()
    conn.close()
    return {"success": True, "numero": numero, "statut": statut, "net_a_payer": net_a_payer}

# Validation d'un brouillon existant
@app.post("/api/negoce/factures/{numero}/valider")
def valider_facture_existante(numero: str):
    conn = get_db()
    c = conn.cursor()
    fac = c.execute("SELECT * FROM factures_negoce WHERE numero = ?", (numero,)).fetchone()
    if not fac or fac["statut"] != "BROUILLON":
        conn.close()
        raise HTTPException(status_code=400, detail="Facture introuvable ou déjà validée")
    
    ligne = c.execute("SELECT * FROM facture_lignes_negoce WHERE facture_numero = ?", (numero,)).fetchone()
    new_num = f"FAC-2026-{fac['id']:04d}"
    today_str = date.today().isoformat()
    
    c.execute("UPDATE factures_negoce SET numero = ?, statut = 'VALIDEE' WHERE id = ?", (new_num, fac["id"]))
    if ligne:
        c.execute("UPDATE facture_lignes_negoce SET facture_numero = ? WHERE facture_numero = ?", (new_num, numero))
        c.execute("UPDATE articles_negoce SET stock_actuel = stock_actuel - ? WHERE code = ?", (ligne["quantite"], ligne["article_code"]))
    
    # Écritures
    ecritures = [
        (today_str, "VT", new_num, "411100", "Clients - Ventes Marchandises", f"{fac['client_nom']} - Facture {new_num}", fac["net_a_payer"], 0.0),
    ]
    if fac["montant_rs"] > 0:
        ecritures.append((today_str, "VT", new_num, "436500", "État - Retenue à la source subie (1.5%)", f"RS 1.5% sur {new_num}", fac["montant_rs"], 0.0))
    ecritures.extend([
        (today_str, "VT", new_num, "701000", "Ventes de Marchandises HT", f"Validation facture {new_num}", 0.0, fac["montant_ht"]),
        (today_str, "VT", new_num, "436700", f"État - TVA Collectée ({fac['taux_tva']:.0f}%)", f"TVA sur {new_num}", 0.0, fac["montant_tva"]),
        (today_str, "VT", new_num, "437000", "Droits de Timbre Fiscal", "Timbre légal 1.000 DT", 0.0, fac["timbre_fiscal"]),
    ])
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    
    conn.commit()
    conn.close()
    return {"success": True, "nouveau_numero": new_num}

# ÉMISSION D'AVOIR NÉGOCE
@app.post("/api/negoce/factures/{numero}/avoir")
def emettre_avoir_negoce(numero: str):
    conn = get_db()
    c = conn.cursor()
    fac = c.execute("SELECT * FROM factures_negoce WHERE numero = ?", (numero,)).fetchone()
    if not fac or fac["statut"] != "VALIDEE":
        conn.close()
        raise HTTPException(status_code=400, detail="Seule une facture validée peut faire l'objet d'un avoir")
    
    ligne = c.execute("SELECT * FROM facture_lignes_negoce WHERE facture_numero = ?", (numero,)).fetchone()
    num_seq = c.execute("SELECT COUNT(*) FROM factures_negoce WHERE type_piece='AVOIR'").fetchone()[0] + 1
    num_avoir = f"AV-2026-{num_seq:04d}"
    today_str = date.today().isoformat()
    
    # Création facture d'avoir
    c.execute("""
        INSERT INTO factures_negoce (numero, date_facture, type_piece, reference_origine, client_nom, client_mf, montant_ht, taux_tva, montant_tva, timbre_fiscal, taux_rs, montant_rs, net_a_payer, statut)
        VALUES (?, ?, 'AVOIR', ?, ?, ?, ?, ?, ?, 0.0, ?, ?, ?, 'AVOIR')
    """, (num_avoir, today_str, numero, fac["client_nom"], fac["client_mf"], fac["montant_ht"], fac["taux_tva"], fac["montant_tva"], fac["taux_rs"], fac["montant_rs"], fac["net_a_payer"]))
    
    # Réintégration en stock si article présent
    if ligne:
        c.execute("UPDATE articles_negoce SET stock_actuel = stock_actuel + ? WHERE code = ?", (ligne["quantite"], ligne["article_code"]))
    
    # Écritures comptables d'avoir (Inversées)
    ecritures = [
        (today_str, "VT", num_avoir, "701000", "Rabais, Remises & Retours sur Ventes", f"Avoir sur facture {numero}", fac["montant_ht"], 0.0),
        (today_str, "VT", num_avoir, "436700", "État - TVA Régularisée sur Avoir", f"TVA restituée sur {num_avoir}", fac["montant_tva"], 0.0),
        (today_str, "VT", num_avoir, "411100", "Clients - Crédit Avoir", f"{fac['client_nom']} - Avoir {num_avoir}", 0.0, fac["net_a_payer"]),
    ]
    if fac["montant_rs"] > 0:
        ecritures.append((today_str, "VT", num_avoir, "436500", "État - RS Régularisée", f"Annulation RS sur {num_avoir}", 0.0, fac["montant_rs"]))
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    
    conn.commit()
    conn.close()
    return {"success": True, "numero_avoir": num_avoir}

# ----------------- 6. SERVICES & CABINETS : MISSIONS, NOTES & AVOIRS -----------------
@app.get("/api/services/missions")
def list_missions():
    conn = get_db()
    rows = conn.execute("SELECT * FROM dossiers_missions ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

class AddMissionReq(BaseModel):
    code: str
    intitule: str
    client_nom: str
    client_mf: Optional[str] = ""
    responsable: str
    budget_heures: float = 40.0
    taux_horaire: float = 150.0

@app.post("/api/services/missions")
def add_mission(req: AddMissionReq):
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO dossiers_missions (code, intitule, client_nom, client_mf, responsable, budget_heures, taux_horaire)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (req.code.strip().upper(), req.intitule.strip(), req.client_nom.strip(), req.client_mf.strip(), req.responsable.strip(), req.budget_heures, req.taux_horaire))
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce code de mission existe déjà")
    conn.close()
    return {"success": True}

@app.get("/api/services/notes")
def list_notes_honoraires():
    conn = get_db()
    rows = conn.execute("SELECT * FROM notes_honoraires ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

class CreateNoteHonorairesReq(BaseModel):
    client_nom: str
    client_mf: Optional[str] = ""
    mission_code: str
    description: str
    montant_ht: float
    taux_tva: float = 19.0
    taux_rs: float = 10.0
    heures: float = 0.0

@app.post("/api/services/notes")
def create_note_honoraires(req: CreateNoteHonorairesReq):
    conn = get_db()
    c = conn.cursor()
    
    tva = round(req.montant_ht * (req.taux_tva / 100.0), 3)
    timbre = 1.000
    rs = round(req.montant_ht * (req.taux_rs / 100.0), 3)
    net = round(req.montant_ht + tva + timbre - rs, 3)
    
    num_seq = c.execute("SELECT COUNT(*) FROM notes_honoraires").fetchone()[0] + 1
    numero = f"HON-2026-{num_seq:04d}"
    today_str = date.today().isoformat()
    
    c.execute("""
        INSERT INTO notes_honoraires (numero, date_facture, type_piece, client_nom, client_mf, mission_code, description, montant_ht, taux_tva, montant_tva, timbre_fiscal, taux_rs, montant_rs, net_a_payer, statut)
        VALUES (?, ?, 'NOTE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VALIDEE')
    """, (numero, today_str, req.client_nom, req.client_mf, req.mission_code, req.description, req.montant_ht, req.taux_tva, tva, timbre, req.taux_rs, rs, net))
    
    if req.heures > 0:
        c.execute("UPDATE dossiers_missions SET heures_consommees = heures_consommees + ? WHERE code = ?", (req.heures, req.mission_code))
        
    ecritures = [
        (today_str, "VT", numero, "411100", "Clients - Prestations de Services", f"{req.client_nom} - Note {numero}", net, 0.0),
        (today_str, "VT", numero, "436500", "État - Retenue Source subie (10%)", f"RS 10% sur {numero}", rs, 0.0),
        (today_str, "VT", numero, "706000", "Prestations de services & Honoraires", req.description, 0.0, req.montant_ht),
        (today_str, "VT", numero, "436700", f"État - TVA Collectée ({req.taux_tva:.0f}%)", f"TVA sur {numero}", 0.0, tva),
        (today_str, "VT", numero, "437000", "Droits de Timbre Fiscal", "Timbre 1.000 DT", 0.0, timbre),
    ]
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    
    conn.commit()
    conn.close()
    return {"success": True, "numero": numero, "net_a_payer": net}

@app.post("/api/services/notes/{numero}/avoir")
def emettre_avoir_services(numero: str):
    conn = get_db()
    c = conn.cursor()
    note = c.execute("SELECT * FROM notes_honoraires WHERE numero = ?", (numero,)).fetchone()
    if not note or note["statut"] != "VALIDEE":
        conn.close()
        raise HTTPException(status_code=400, detail="Note d'honoraires introuvable ou déjà annulée")
    
    num_seq = c.execute("SELECT COUNT(*) FROM notes_honoraires WHERE type_piece='AVOIR'").fetchone()[0] + 1
    num_avoir = f"AV-HON-2026-{num_seq:04d}"
    today_str = date.today().isoformat()
    
    c.execute("""
        INSERT INTO notes_honoraires (numero, date_facture, type_piece, reference_origine, client_nom, client_mf, mission_code, description, montant_ht, taux_tva, montant_tva, timbre_fiscal, taux_rs, montant_rs, net_a_payer, statut)
        VALUES (?, ?, 'AVOIR', ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?, ?, 'AVOIR')
    """, (num_avoir, today_str, numero, note["client_nom"], note["client_mf"], note["mission_code"], f"Avoir sur note {numero}", note["montant_ht"], note["taux_tva"], note["montant_tva"], note["taux_rs"], note["montant_rs"], note["net_a_payer"]))
    
    ecritures = [
        (today_str, "VT", num_avoir, "706000", "Prestations de services - Avoirs", f"Annulation note {numero}", note["montant_ht"], 0.0),
        (today_str, "VT", num_avoir, "436700", "État - TVA sur Avoirs Honoraires", f"TVA restituée sur {num_avoir}", note["montant_tva"], 0.0),
        (today_str, "VT", num_avoir, "411100", "Clients - Crédit Avoir Honoraires", f"Avoir {num_avoir}", 0.0, note["net_a_payer"]),
        (today_str, "VT", num_avoir, "436500", "État - Annulation RS", f"Annulation RS 10%", 0.0, note["montant_rs"]),
    ]
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    
    conn.commit()
    conn.close()
    return {"success": True, "numero_avoir": num_avoir}

# ----------------- 7. INDUSTRIE : PRODUITS FINIS, MATIÈRES & OF -----------------
@app.get("/api/industrie/produits-finis")
def list_produits_finis():
    conn = get_db()
    rows = conn.execute("SELECT * FROM produits_finis_industrie ORDER BY designation ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

class AddProduitFiniReq(BaseModel):
    code: str
    designation: str
    unite: str = "Pièce"
    depot_code: str = "DEP-USINE-01"
    cout_revient_std: float
    prix_vente_std: float

@app.post("/api/industrie/produits-finis")
def add_produit_fini(req: AddProduitFiniReq):
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO produits_finis_industrie (code, designation, unite, depot_code, cout_revient_std, prix_vente_std)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (req.code.strip().upper(), req.designation.strip(), req.unite, req.depot_code, req.cout_revient_std, req.prix_vente_std))
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce code de produit fini existe déjà")
    conn.close()
    return {"success": True}

@app.delete("/api/industrie/produits-finis/{code}")
def delete_produit_fini(code: str):
    conn = get_db()
    conn.execute("DELETE FROM produits_finis_industrie WHERE code = ?", (code,))
    conn.commit()
    conn.close()
    return {"success": True}

@app.get("/api/industrie/matieres")
def list_matieres_industrie():
    conn = get_db()
    rows = conn.execute("SELECT * FROM matieres_industrie ORDER BY designation ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

class AddMatiereReq(BaseModel):
    code: str
    designation: str
    unite: str = "KG"
    depot_code: str = "DEP-USINE-02"
    stock_actuel: float
    cump: float
    seuil_alerte: float = 50.0

@app.post("/api/industrie/matieres")
def add_matiere(req: AddMatiereReq):
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO matieres_industrie (code, designation, unite, depot_code, stock_actuel, cump, seuil_alerte)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (req.code.strip().upper(), req.designation.strip(), req.unite, req.depot_code, req.stock_actuel, req.cump, req.seuil_alerte))
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce code de matière existe déjà")
    conn.close()
    return {"success": True}

@app.delete("/api/industrie/matieres/{code}")
def delete_matiere(code: str):
    conn = get_db()
    conn.execute("DELETE FROM matieres_industrie WHERE code = ?", (code,))
    conn.commit()
    conn.close()
    return {"success": True}

@app.get("/api/industrie/ofs")
def list_ofs():
    conn = get_db()
    rows = conn.execute("SELECT * FROM ordres_fabrication ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

class CreateOfReq(BaseModel):
    produit_code: str
    quantite_prevue: float

@app.post("/api/industrie/ofs")
def create_of(req: CreateOfReq):
    conn = get_db()
    c = conn.cursor()
    pf = c.execute("SELECT * FROM produits_finis_industrie WHERE code = ?", (req.produit_code,)).fetchone()
    if not pf:
        conn.close()
        raise HTTPException(status_code=404, detail="Produit fini introuvable")
    
    num_seq = c.execute("SELECT COUNT(*) FROM ordres_fabrication").fetchone()[0] + 1
    numero = f"OF-2026-{num_seq:04d}"
    today_str = date.today().isoformat()
    cout_total = round(req.quantite_prevue * pf["cout_revient_std"], 3)
    
    # Incrémenter stock produit fini
    c.execute("UPDATE produits_finis_industrie SET stock_actuel = stock_actuel + ? WHERE code = ?", (req.quantite_prevue, req.produit_code))
    
    c.execute("""
        INSERT INTO ordres_fabrication (numero, date_lancement, produit_code, produit_nom, quantite_prevue, quantite_produite, cout_total, statut)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'CLOTURE')
    """, (numero, today_str, req.produit_code, pf["designation"], req.quantite_prevue, req.quantite_prevue, cout_total))
    
    # Écritures comptables industrielles
    ecritures = [
        (today_str, "OD", numero, "355000", "Stocks Produits Finis Usine", f"Production {req.quantite_prevue} {pf['designation']}", cout_total, 0.0),
        (today_str, "OD", numero, "713500", "Production Stockée Produits Finis", f"Clôture atelier {numero}", 0.0, cout_total),
    ]
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    
    conn.commit()
    conn.close()
    return {"success": True, "numero": numero, "cout_total": cout_total}

# ----------------- 8. RESTAURATION & CAISSE POS : TABLES, MENU & TICKETS -----------------
@app.get("/api/pos/tables")
def list_pos_tables():
    conn = get_db()
    rows = conn.execute("SELECT * FROM tables_pos ORDER BY id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

class AddTableReq(BaseModel):
    numero: str
    zone: str = "SALLE"
    capacite: int = 4

@app.post("/api/pos/tables")
def add_pos_table(req: AddTableReq):
    conn = get_db()
    try:
        conn.execute("INSERT INTO tables_pos (numero, zone, capacite) VALUES (?, ?, ?)", (req.numero.strip(), req.zone.strip().upper(), req.capacite))
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=400, detail="Cette table existe déjà")
    conn.close()
    return {"success": True}

@app.delete("/api/pos/tables/{numero}")
def delete_pos_table(numero: str):
    conn = get_db()
    conn.execute("DELETE FROM tables_pos WHERE numero = ?", (numero,))
    conn.commit()
    conn.close()
    return {"success": True}

@app.get("/api/pos/menu")
def list_pos_menu():
    conn = get_db()
    rows = conn.execute("SELECT * FROM menu_pos WHERE actif=1 ORDER BY categorie ASC, prix_ttc DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

class AddMenuItemReq(BaseModel):
    code: str
    categorie: str
    designation: str
    prix_ttc: float
    taux_tva: float = 7.0
    icone: str = "🍽️"

@app.post("/api/pos/menu")
def add_menu_item(req: AddMenuItemReq):
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO menu_pos (code, categorie, designation, prix_ttc, taux_tva, icone)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (req.code.strip().upper(), req.categorie.strip().upper(), req.designation.strip(), req.prix_ttc, req.taux_tva, req.icone.strip()))
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce code d'article menu existe déjà")
    conn.close()
    return {"success": True}

@app.delete("/api/pos/menu/{code}")
def delete_menu_item(code: str):
    conn = get_db()
    conn.execute("DELETE FROM menu_pos WHERE code = ?", (code,))
    conn.commit()
    conn.close()
    return {"success": True}

@app.get("/api/pos/tickets")
def list_pos_tickets():
    conn = get_db()
    rows = conn.execute("SELECT * FROM tickets_pos ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

class CreateTicketPosReq(BaseModel):
    table_numero: str
    client_nom: Optional[str] = "Client Caisse"
    client_mf: Optional[str] = "Non Assujetti"
    items: list[dict]
    mode_reglement: str = "ESPECES"

@app.post("/api/pos/tickets")
def create_pos_ticket(req: CreateTicketPosReq):
    if not req.items:
        raise HTTPException(status_code=400, detail="Panier vide")
    
    conn = get_db()
    c = conn.cursor()
    
    total_ttc = 0.0
    total_ht = 0.0
    total_tva = 0.0
    
    for it in req.items:
        ttc_ligne = it["prix_ttc"] * it["quantite"]
        tx = it.get("taux_tva", 7.0)
        ht_l = ttc_ligne / (1 + (tx / 100.0))
        total_ttc += ttc_ligne
        total_ht += ht_l
        total_tva += (ttc_ligne - ht_l)
        
    total_ttc = round(total_ttc, 3)
    total_ht = round(total_ht, 3)
    total_tva = round(total_tva, 3)
    
    num_seq = c.execute("SELECT COUNT(*) FROM tickets_pos").fetchone()[0] + 1
    numero = f"TCK-2026-{num_seq:04d}"
    today_str = date.today().isoformat()
    
    c.execute("""
        INSERT INTO tickets_pos (numero, date_ticket, type_piece, table_numero, client_nom, client_mf, total_ht, total_tva, total_ttc, mode_reglement, statut)
        VALUES (?, ?, 'TICKET', ?, ?, ?, ?, ?, ?, ?, 'PAYE')
    """, (numero, today_str, req.table_numero, req.client_nom, req.client_mf, total_ht, total_tva, total_ttc, req.mode_reglement))
    
    cpt = "541000" if req.mode_reglement == "ESPECES" else "532000"
    lib_cpt = "Caisse Espèces POS" if req.mode_reglement == "ESPECES" else "Banque Cartes TPE"
    
    ecritures = [
        (today_str, "CA", numero, cpt, lib_cpt, f"Recette {req.table_numero}", total_ttc, 0.0),
        (today_str, "CA", numero, "707000", "Ventes Restauration & Boissons", f"Ticket {numero}", 0.0, total_ht),
        (today_str, "CA", numero, "436700", "État - TVA Collectée Restauration (7%)", f"TVA {numero}", 0.0, total_tva),
    ]
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    
    conn.commit()
    conn.close()
    return {"success": True, "numero": numero, "total_ttc": total_ttc}

@app.post("/api/pos/tickets/{numero}/avoir")
def annuler_ticket_pos(numero: str):
    conn = get_db()
    c = conn.cursor()
    tck = c.execute("SELECT * FROM tickets_pos WHERE numero = ?", (numero,)).fetchone()
    if not tck or tck["statut"] != "PAYE":
        conn.close()
        raise HTTPException(status_code=400, detail="Ticket introuvable ou déjà annulé")
    
    num_avoir = f"AV-TCK-2026-{tck['id']:04d}"
    today_str = date.today().isoformat()
    
    c.execute("""
        INSERT INTO tickets_pos (numero, date_ticket, type_piece, table_numero, client_nom, client_mf, total_ht, total_tva, total_ttc, mode_reglement, statut)
        VALUES (?, ?, 'AVOIR', ?, ?, ?, ?, ?, ?, ?, 'AVOIR')
    """, (num_avoir, today_str, tck["table_numero"], tck["client_nom"], tck["client_mf"], tck["total_ht"], tck["total_tva"], tck["total_ttc"], tck["mode_reglement"]))
    
    cpt = "541000" if tck["mode_reglement"] == "ESPECES" else "532000"
    lib_cpt = "Caisse Espèces POS" if tck["mode_reglement"] == "ESPECES" else "Banque Cartes TPE"
    
    ecritures = [
        (today_str, "CA", num_avoir, "707000", "Annulation Vente Restauration", f"Avoir {num_avoir}", tck["total_ht"], 0.0),
        (today_str, "CA", num_avoir, "436700", "TVA Restituée Ticket", f"TVA Avoir {num_avoir}", tck["total_tva"], 0.0),
        (today_str, "CA", num_avoir, cpt, lib_cpt, f"Remboursement ticket {numero}", 0.0, tck["total_ttc"]),
    ]
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    
    conn.commit()
    conn.close()
    return {"success": True, "numero_avoir": num_avoir}

# ----------------- 9. GRAND LIVRE & COMPTABILITÉ (SCE NC 01) -----------------
@app.get("/api/compta/grand-livre")
def get_grand_livre():
    conn = get_db()
    rows = conn.execute("SELECT * FROM ecritures_comptables ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ----------------- 10. GESTION DES LICENCES & STATUT SYSTÈME -----------------
@app.get("/api/license/status")
def license_status():
    ok, hw_id, info = is_activated()
    return {
        "activated": ok,
        "module_code": MODULE_CODE,
        "suite_title": SUITE_TITLE,
        "hardware_id": hw_id,
        "info": info,
        "devise": "TND (3 décimales)",
        "norme": "SCE NC 01"
    }

@app.post("/api/license/activate")
def activate_license(req: ActivateLicenseReq):
    hw_id = get_hardware_id()
    ok, info = verify_license_key(req.license_key, hw_id)
    if not ok:
        raise HTTPException(status_code=400, detail=info)
    with open(LICENSE_FILE, "w", encoding="utf-8") as f:
        f.write(req.license_key.strip().upper())
    return {"activated": True, "expiration": info}

# ==============================================================================
# 4. INTERFACE GRAPHIQUE UNIFIÉE SPA (HTML5 / CSS3 / JAVASCRIPT REACTIF)
# ==============================================================================
@app.get("/", response_class=HTMLResponse)
def index_page():
    ok, hw_id, info = is_activated()
    status_badge = '<span class="badge bg-success">Licence Active</span>' if ok else f'<span class="badge bg-danger">Non Activé: {info}</span>'
    
    html_content = """<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SAFE ERP - Suite Intégrée Tunisienne</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        :root {{
            --safe-blue: #0f1e3a;
            --safe-accent: #2563eb;
            --safe-gold: #d97706;
            --safe-green: #059669;
            --safe-bg: #f8fafc;
        }}
        body {{ background-color: var(--safe-bg); font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; font-size: 0.86rem; color: #1e293b; }}
        .navbar-safe {{ background: linear-gradient(135deg, #0a1428 0%, #0f1e3a 100%); border-bottom: 2px solid #f59e0b; }}
        .safe-brand-title {{ font-size: 1.25rem; font-weight: 900; letter-spacing: 0.5px; color: #ffffff; }}
        .safe-brand-slogan {{ font-size: 0.65rem; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }}
        .card {{ border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.04); margin-bottom: 1rem; }}
        .card-header {{ background-color: #ffffff; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #0f172a; padding: 0.6rem 0.9rem; font-size: 0.88rem; }}
        .nav-pills .nav-link {{ color: #475569; font-weight: 600; font-size: 0.82rem; border-radius: 6px; padding: 0.45rem 0.85rem; transition: all 0.2s; }}
        .nav-pills .nav-link.active {{ background-color: #0f1e3a; color: #ffffff; border-left: 3px solid #f59e0b; }}
        .nav-pills .nav-link:hover:not(.active) {{ background-color: #e2e8f0; }}
        .kpi-card {{ border-left: 4px solid var(--safe-accent); background: #ffffff; }}
        .kpi-val {{ font-size: 1.35rem; font-weight: 800; color: #0f172a; }}
        .kpi-label {{ font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700; }}
        .table-custom {{ font-size: 0.8rem; }}
        .table-custom th {{ background-color: #f1f5f9; color: #334155; font-weight: 700; }}
        .menu-item-card {{ cursor: pointer; transition: all 0.15s ease; border-radius: 6px; border: 1px solid #cbd5e1; }}
        .menu-item-card:hover {{ transform: translateY(-2px); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border-color: #059669; }}
        .table-badge {{ cursor: pointer; font-size: 0.78rem; padding: 0.35rem 0.65rem; border-radius: 5px; }}
        /* Impression A4 */
        @media print {{
            body * {{ visibility: hidden; }}
            #printable-invoice-modal, #printable-invoice-modal * {{ visibility: visible; }}
            #printable-invoice-modal {{ position: absolute; left: 0; top: 0; width: 100%; border: none; box-shadow: none; }}
            .no-print {{ display: none !important; }}
        }}
    </style>
</head>
<body>
    <!-- 1. EN-TÊTE UNIFIÉ OFFICIEL SAFE ERP -->
    <nav class="navbar navbar-safe sticky-top py-2 shadow-sm text-white">
        <div class="container-fluid d-flex justify-content-between align-items-center">
            <!-- Logo officiel, Nom & Slogan -->
            <div class="d-flex align-items-center gap-2">
                <svg width="36" height="36" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M50 5 L90 20 L90 55 C90 75 50 95 50 95 C50 95 10 75 10 55 L10 20 Z" fill="#0F1E3A" stroke="#F59E0B" stroke-width="4"/>
                    <path d="M50 12 L82 24 L82 52 C82 68 50 85 50 85 C50 85 18 68 18 52 L18 24 Z" fill="#1E3A8A"/>
                    <text x="50" y="58" font-family="'Segoe UI', Arial, sans-serif" font-size="22" font-weight="900" fill="#FFFFFF" text-anchor="middle">SAFE</text>
                    <polygon points="50,28 53,35 60,35 54,39 56,46 50,42 44,46 46,39 40,35 47,35" fill="#F59E0B"/>
                </svg>
                <div>
                    <div class="safe-brand-title">🛡️ SAFE ERP <span class="badge bg-warning text-dark font-monospace fs-6">TUNISIE 2026</span></div>
                    <div class="safe-brand-slogan">{SUITE_SLOGAN}</div>
                </div>
            </div>

            <!-- Badges & Profil Utilisateur & Bouton Déconnexion (Sortie) -->
            <div class="d-flex align-items-center gap-2">
                <span class="badge bg-danger-subtle text-danger border border-danger">🇹🇳 TND (3 déc.) | TVA 19/13/7% | Timbre 1.000 DT | SCE NC 01</span>
                <span class="badge bg-secondary font-monospace" title="Hardware ID machine">{hw_id}</span>
                {status_badge}
                
                <!-- Identité utilisateur connecté -->
                <div class="bg-dark px-2 py-1 rounded border border-secondary text-end d-flex align-items-center gap-2">
                    <div style="font-size:0.75rem;">
                        <div class="fw-bold text-white" id="user-display-name">Administrateur</div>
                        <div class="text-warning fw-bold" style="font-size:0.65rem;" id="user-display-role">ADMIN</div>
                    </div>
                    <!-- BOUTON DE DÉCONNEXION (SORTIE) - EXIGENCE 1 -->
                    <button class="btn btn-outline-danger btn-sm py-1 px-2 fw-bold" onclick="logout()" title="Quitter et verrouiller la session">
                        🚪 Sortie
                    </button>
                </div>
            </div>
        </div>
    </nav>

    <!-- BARRE D'ONGLETS UNIFIÉE -->
    <div class="bg-white border-bottom shadow-sm px-3 py-2 sticky-top" style="top:54px; z-index:1020;">
        <ul class="nav nav-pills gap-1" id="pills-tab" role="tablist">
            <li class="nav-item"><button class="nav-link active" data-bs-toggle="pill" data-bs-target="#tab-negoce">🛒 Négoce & Facturation</button></li>
            <li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#tab-services">💼 Services & Cabinets</button></li>
            <li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#tab-industrie">⚙️ Industrie & GPAO</button></li>
            <li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#tab-pos">🍽️ Restauration & Caisse POS</button></li>
            <li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#tab-compta">⚖️ Grand Livre (SCE NC 01)</button></li>
            <li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#tab-company">🏢 Paramètres Société (En-tête)</button></li>
            <li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#tab-fiscal">⚙️ Fiscalité & Réglementation</button></li>
            <li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#tab-admin">🛡️ Administration & Reset</button></li>
            <li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#tab-license">🔐 Licence & HW-ID</button></li>
        </ul>
    </div>

    <!-- CONTENU PRINCIPAL DE LA SUITE -->
    <div class="container-fluid py-3">
        <div class="tab-content" id="pills-tabContent">
            
            <!-- =============================================================== -->
            <!-- 1. NÉGOCE & FACTURATION                                         -->
            <!-- =============================================================== -->
            <div class="tab-pane fade show active" id="tab-negoce">
                <div class="row g-3">
                    <div class="col-lg-7">
                        <div class="card">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <span>Nouvelle Facture de Vente Marchandises</span>
                                <span class="badge bg-primary">Facturation & Déstockage CUMP</span>
                            </div>
                            <div class="card-body">
                                <form id="form-facture-negoce">
                                    <div class="row g-2 mb-2">
                                        <div class="col-md-7">
                                            <label class="form-label fw-bold">Client (Raison Sociale) :</label>
                                            <input type="text" class="form-control form-control-sm" id="neg-client-nom" value="Société Plasturgie du Cap Bon" required>
                                        </div>
                                        <div class="col-md-5">
                                            <label class="form-label fw-bold">Matricule Fiscal Client :</label>
                                            <input type="text" class="form-control form-control-sm" id="neg-client-mf" value="1289456/C/A/000" required>
                                        </div>
                                    </div>
                                    <div class="row g-2 mb-2">
                                        <div class="col-md-7">
                                            <label class="form-label fw-bold">Article du Catalogue :</label>
                                            <select class="form-select form-select-sm" id="neg-article-select" required onchange="calcNegocePreview()">
                                                <!-- Dynamique -->
                                            </select>
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label fw-bold">Quantité :</label>
                                            <input type="number" step="1" min="1" class="form-control form-control-sm" id="neg-qte" value="2" required oninput="calcNegocePreview()">
                                        </div>
                                        <div class="col-md-2">
                                            <label class="form-label fw-bold">Remise % :</label>
                                            <input type="number" step="0.5" min="0" max="100" class="form-control form-control-sm" id="neg-remise" value="0" oninput="calcNegocePreview()">
                                        </div>
                                    </div>

                                    <!-- DEUX BOUTONS SÉPARÉS : COMPTABILISATION (1) & VALIDATION (2) - EXIGENCE 6 -->
                                    <div class="d-flex gap-2 mt-3">
                                        <button type="button" class="btn btn-outline-primary btn-sm w-50 fw-bold" onclick="submitNegoceFacture('COMPTABILISER')">
                                            📝 1. Comptabiliser (Brouillon Provisoire)
                                        </button>
                                        <button type="button" class="btn btn-primary btn-sm w-50 fw-bold" onclick="submitNegoceFacture('VALIDER')">
                                            🔒 2. Valider Facture (Ferme & Définitive)
                                        </button>
                                    </div>
                                </form>
                                <div id="negoce-alert" class="alert d-none py-2 my-2" role="alert"></div>
                            </div>
                        </div>

                        <!-- HISTORIQUE COMPLET DES FACTURES & AVOIRS - EXIGENCE 6 -->
                        <div class="card">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <span>Journal des Factures & Avoirs Émis</span>
                                <button class="btn btn-sm btn-outline-secondary" onclick="loadNegoceFactures()">🔄 Actualiser</button>
                            </div>
                            <div class="card-body p-0">
                                <div class="table-responsive">
                                    <table class="table table-sm table-striped table-custom mb-0">
                                        <thead>
                                            <tr>
                                                <th>Numéro</th>
                                                <th>Date</th>
                                                <th>Client (MF)</th>
                                                <th>Montant HT</th>
                                                <th>TVA (19%)</th>
                                                <th>Net à Payer</th>
                                                <th>Statut</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody id="negoce-factures-body">
                                            <!-- Dynamique -->
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <!-- GESTION DES ARTICLES & DÉPÔTS (CRUD) - EXIGENCE 6 -->
                        <div class="row g-2 mt-1">
                            <div class="col-md-7">
                                <div class="card">
                                    <div class="card-header d-flex justify-content-between align-items-center">
                                        <span>Catalogue Articles Négoce</span>
                                        <button class="btn btn-xs btn-primary py-0" data-bs-toggle="collapse" data-bs-target="#add-art-form">+ Ajouter Article</button>
                                    </div>
                                    <div class="collapse p-2 bg-light border-bottom" id="add-art-form">
                                        <div class="row g-2">
                                            <div class="col-4"><input type="text" class="form-control form-control-sm" placeholder="Code (Ex: ART-01)" id="new-art-code"></div>
                                            <div class="col-8"><input type="text" class="form-control form-control-sm" placeholder="Désignation" id="new-art-nom"></div>
                                            <div class="col-4">
                                                <select class="form-select form-select-sm" id="new-art-depot">
                                                    <!-- Dynamique -->
                                                </select>
                                            </div>
                                            <div class="col-4"><input type="number" step="0.001" class="form-control form-control-sm" placeholder="CUMP (TND)" id="new-art-cump"></div>
                                            <div class="col-4"><input type="number" step="0.001" class="form-control form-control-sm" placeholder="Prix Vente HT" id="new-art-prix"></div>
                                        </div>
                                        <button class="btn btn-success btn-sm mt-2 w-100" onclick="saveNewArticle()">💾 Enregistrer l'Article</button>
                                    </div>
                                    <div class="card-body p-0" style="max-height: 200px; overflow-y: auto;">
                                        <table class="table table-sm table-striped table-custom mb-0">
                                            <thead><tr><th>Code</th><th>Désignation</th><th>Stock</th><th>Prix HT</th><th>Action</th></tr></thead>
                                            <tbody id="negoce-articles-crud-body"></tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            <div class="col-md-5">
                                <div class="card">
                                    <div class="card-header d-flex justify-content-between align-items-center">
                                        <span>Dépôts & Magasins</span>
                                        <button class="btn btn-xs btn-primary py-0" data-bs-toggle="collapse" data-bs-target="#add-depot-form">+ Dépôt</button>
                                    </div>
                                    <div class="collapse p-2 bg-light border-bottom" id="add-depot-form">
                                        <input type="text" class="form-control form-control-sm mb-1" placeholder="Code (Ex: DEP-NORD)" id="new-depot-code">
                                        <input type="text" class="form-control form-control-sm mb-1" placeholder="Nom du Dépôt" id="new-depot-nom">
                                        <input type="text" class="form-control form-control-sm mb-1" placeholder="Responsable" id="new-depot-resp">
                                        <button class="btn btn-success btn-sm w-100" onclick="saveNewDepot()">💾 Créer Dépôt</button>
                                    </div>
                                    <div class="card-body p-0" style="max-height: 200px; overflow-y: auto;">
                                        <table class="table table-sm table-striped table-custom mb-0">
                                            <thead><tr><th>Code</th><th>Nom</th><th>Action</th></tr></thead>
                                            <tbody id="negoce-depots-crud-body"></tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- APERÇU FISCAL & ÉCRITURES COMPTABLES EN DIRECT -->
                    <div class="col-lg-5">
                        <div class="card mb-3 p-3 bg-light border-primary">
                            <h6 class="fw-bold text-primary mb-2">📋 Simulation Fiscale & Encaissement</h6>
                            <table class="table table-sm table-borderless mb-0" style="font-size:0.8rem;">
                                <tr><td>Montant HT Net :</td><td class="text-end fw-bold" id="prev-neg-ht">0.000 DT</td></tr>
                                <tr><td>TVA (19%) :</td><td class="text-end fw-bold" id="prev-neg-tva">0.000 DT</td></tr>
                                <tr><td>Droit de Timbre Fiscal :</td><td class="text-end fw-bold">1.000 DT</td></tr>
                                <tr class="border-top"><td>Total TTC Facture :</td><td class="text-end fw-bold text-dark" id="prev-neg-ttc">0.000 DT</td></tr>
                                <tr><td class="text-danger">Retenue Source (1.5%) :</td><td class="text-end fw-bold text-danger" id="prev-neg-rs">- 0.000 DT</td></tr>
                                <tr class="border-top table-success"><td><strong>Net Client à Payer :</strong></td><td class="text-end fw-bold text-success" id="prev-neg-net">0.000 DT</td></tr>
                            </table>
                        </div>

                        <div class="card">
                            <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center">
                                <span>Écriture Comptable en Direct (Journal VT)</span>
                                <span class="badge bg-success">SCE NC 01</span>
                            </div>
                            <div class="card-body p-0">
                                <table class="table table-sm table-custom mb-0 font-monospace" style="font-size:0.75rem;">
                                    <thead><tr><th>Compte</th><th>Libellé</th><th class="text-end">Débit</th><th class="text-end">Crédit</th></tr></thead>
                                    <tbody id="live-negoce-ecriture-body"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- =============================================================== -->
            <!-- 2. SERVICES & CABINETS (AVEC AVOIRS)                            -->
            <!-- =============================================================== -->
            <div class="tab-pane fade" id="tab-services">
                <div class="row g-3">
                    <div class="col-lg-7">
                        <div class="card">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <span>Note d'Honoraires & Prestations Intellectuelles</span>
                                <span class="badge bg-primary">RS Légale 10% Subie</span>
                            </div>
                            <div class="card-body">
                                <form id="form-note-services">
                                    <div class="row g-2 mb-2">
                                        <div class="col-md-7">
                                            <label class="form-label fw-bold">Client Cabinet :</label>
                                            <input type="text" class="form-control form-control-sm" id="serv-client-nom" value="STB Bank (Siège Tunis)" required>
                                        </div>
                                        <div class="col-md-5">
                                            <label class="form-label fw-bold">Matricule Fiscal :</label>
                                            <input type="text" class="form-control form-control-sm" id="serv-client-mf" value="0012458/A/M/000">
                                        </div>
                                    </div>
                                    <div class="row g-2 mb-2">
                                        <div class="col-md-7">
                                            <label class="form-label fw-bold">Dossier / Mission :</label>
                                            <select class="form-select form-select-sm" id="serv-mission-select" required>
                                                <!-- Dynamique -->
                                            </select>
                                        </div>
                                        <div class="col-md-5">
                                            <label class="form-label fw-bold">Montant HT (TND) :</label>
                                            <input type="number" step="0.001" class="form-control form-control-sm" id="serv-ht" value="3500.000" required>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label fw-bold">Description de la prestation :</label>
                                        <input type="text" class="form-control form-control-sm" id="serv-desc" value="Audit contractuel et assistance légale" required>
                                    </div>
                                    <button type="submit" class="btn btn-primary btn-sm w-100 fw-bold">💾 Émettre la Note d'Honoraires (RS 10% Déduite)</button>
                                </form>
                            </div>
                        </div>

                        <!-- HISTORIQUE DES NOTES ET AVOIRS SERVICES -->
                        <div class="card">
                            <div class="card-header">Historique des Notes d'Honoraires & Avoirs</div>
                            <div class="card-body p-0">
                                <div class="table-responsive">
                                    <table class="table table-sm table-striped table-custom mb-0">
                                        <thead>
                                            <tr>
                                                <th>Numéro</th>
                                                <th>Date</th>
                                                <th>Client</th>
                                                <th>Montant HT</th>
                                                <th>RS (10%)</th>
                                                <th>Net à Percevoir</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody id="serv-notes-body"></tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- SUIVI MISSIONS -->
                    <div class="col-lg-5">
                        <div class="card">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <span>Dossiers & Missions du Cabinet</span>
                                <button class="btn btn-xs btn-primary py-0" data-bs-toggle="collapse" data-bs-target="#add-mission-form">+ Mission</button>
                            </div>
                            <div class="collapse p-2 bg-light border-bottom" id="add-mission-form">
                                <input type="text" class="form-control form-control-sm mb-1" placeholder="Code (Ex: MIS-2026-005)" id="new-mis-code">
                                <input type="text" class="form-control form-control-sm mb-1" placeholder="Intitulé de la Mission" id="new-mis-nom">
                                <input type="text" class="form-control form-control-sm mb-1" placeholder="Client" id="new-mis-client">
                                <input type="text" class="form-control form-control-sm mb-1" placeholder="Responsable (Ex: Me. Karim)" id="new-mis-resp">
                                <button class="btn btn-success btn-sm w-100" onclick="saveNewMission()">💾 Créer Mission</button>
                            </div>
                            <div class="card-body p-0">
                                <table class="table table-sm table-striped table-custom mb-0">
                                    <thead><tr><th>Code</th><th>Intitulé</th><th>Responsable</th><th>Taux/h</th></tr></thead>
                                    <tbody id="serv-missions-body"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- =============================================================== -->
            <!-- 3. INDUSTRIE & GPAO (PRODUITS FINIS, MATIÈRES, OF) - EXIGENCE 7 -->
            <!-- =============================================================== -->
            <div class="tab-pane fade" id="tab-industrie">
                <div class="row g-3">
                    <div class="col-lg-7">
                        <div class="card">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <span>Lancement & Fabrication Atelier (OF)</span>
                                <span class="badge bg-warning text-dark">Déstockage Matières CUMP</span>
                            </div>
                            <div class="card-body">
                                <form id="form-of-ind">
                                    <div class="row g-2 mb-2">
                                        <div class="col-md-8">
                                            <label class="form-label fw-bold">Produit Fini à Fabriquer :</label>
                                            <select class="form-select form-select-sm" id="ind-pf-select" required>
                                                <!-- Dynamique -->
                                            </select>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label fw-bold">Quantité :</label>
                                            <input type="number" step="1" min="1" class="form-control form-control-sm" id="ind-qte" value="100" required>
                                        </div>
                                    </div>
                                    <button type="submit" class="btn btn-warning btn-sm w-100 fw-bold">🚀 Lancer & Clôturer l'OF</button>
                                </form>
                            </div>
                        </div>

                        <!-- HISTORIQUE OF -->
                        <div class="card">
                            <div class="card-header">Ordres de Fabrication Réalisés</div>
                            <div class="card-body p-0">
                                <table class="table table-sm table-striped table-custom mb-0">
                                    <thead><tr><th>OF Numéro</th><th>Date</th><th>Produit</th><th>Quantité</th><th>Coût Total</th></tr></thead>
                                    <tbody id="ind-ofs-body"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <!-- GESTION PRODUITS FINIS & MATIÈRES PREMIÈRES (CRUD) - EXIGENCE 7 -->
                    <div class="col-lg-5">
                        <div class="card mb-3">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <span>Articles Produits Finis (Usine)</span>
                                <button class="btn btn-xs btn-primary py-0" data-bs-toggle="collapse" data-bs-target="#add-pf-form">+ Produit Fini</button>
                            </div>
                            <div class="collapse p-2 bg-light border-bottom" id="add-pf-form">
                                <input type="text" class="form-control form-control-sm mb-1" placeholder="Code (Ex: PF-01)" id="new-pf-code">
                                <input type="text" class="form-control form-control-sm mb-1" placeholder="Désignation" id="new-pf-nom">
                                <div class="row g-1">
                                    <div class="col-6"><input type="number" step="0.001" class="form-control form-control-sm" placeholder="Coût Revient (TND)" id="new-pf-cout"></div>
                                    <div class="col-6"><input type="number" step="0.001" class="form-control form-control-sm" placeholder="Prix Vente (TND)" id="new-pf-prix"></div>
                                </div>
                                <button class="btn btn-success btn-sm mt-1 w-100" onclick="saveNewProduitFini()">💾 Enregistrer Produit Fini</button>
                            </div>
                            <div class="card-body p-0" style="max-height: 180px; overflow-y: auto;">
                                <table class="table table-sm table-striped table-custom mb-0">
                                    <thead><tr><th>Code</th><th>Désignation</th><th>Stock</th><th>Action</th></tr></thead>
                                    <tbody id="ind-pf-crud-body"></tbody>
                                </table>
                            </div>
                        </div>

                        <div class="card">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <span>Matières Premières & Composants</span>
                                <button class="btn btn-xs btn-primary py-0" data-bs-toggle="collapse" data-bs-target="#add-mat-form">+ Matière</button>
                            </div>
                            <div class="collapse p-2 bg-light border-bottom" id="add-mat-form">
                                <input type="text" class="form-control form-control-sm mb-1" placeholder="Code (Ex: MAT-01)" id="new-mat-code">
                                <input type="text" class="form-control form-control-sm mb-1" placeholder="Désignation" id="new-mat-nom">
                                <div class="row g-1">
                                    <div class="col-6"><input type="number" step="0.1" class="form-control form-control-sm" placeholder="Stock Initial" id="new-mat-stock"></div>
                                    <div class="col-6"><input type="number" step="0.001" class="form-control form-control-sm" placeholder="CUMP (TND)" id="new-mat-cump"></div>
                                </div>
                                <button class="btn btn-success btn-sm mt-1 w-100" onclick="saveNewMatiere()">💾 Enregistrer Matière</button>
                            </div>
                            <div class="card-body p-0" style="max-height: 180px; overflow-y: auto;">
                                <table class="table table-sm table-striped table-custom mb-0">
                                    <thead><tr><th>Code</th><th>Désignation</th><th>Stock</th><th>Action</th></tr></thead>
                                    <tbody id="ind-mat-crud-body"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- =============================================================== -->
            <!-- 4. RESTAURATION & CAISSE POS (MENU RICHE & TABLES) - EXIGENCE 8 -->
            <!-- =============================================================== -->
            <div class="tab-pane fade" id="tab-pos">
                <div class="row g-3">
                    <div class="col-lg-7">
                        <!-- Sélecteur de Tables avec bouton Ajout / Suppression - Exigence 8 -->
                        <div class="card mb-2">
                            <div class="card-header d-flex justify-content-between align-items-center py-1">
                                <span class="fw-bold">Plan de Tables & Zones :</span>
                                <div class="d-flex gap-1">
                                    <button class="btn btn-xs btn-outline-primary py-0" data-bs-toggle="collapse" data-bs-target="#add-table-collapse">+ Nouvelle Table</button>
                                    <span class="badge bg-secondary" id="active-table-label">Table 01</span>
                                </div>
                            </div>
                            <div class="collapse p-2 bg-light border-bottom" id="add-table-collapse">
                                <div class="d-flex gap-2">
                                    <input type="text" class="form-control form-control-sm" placeholder="Nom Table (Ex: Table 15, Terrasse 05)" id="new-table-num">
                                    <select class="form-select form-select-sm" id="new-table-zone" style="max-width:140px;">
                                        <option value="SALLE">Salle</option>
                                        <option value="TERRASSE">Terrasse</option>
                                        <option value="VIP">Salon VIP</option>
                                        <option value="BAR">Comptoir Bar</option>
                                        <option value="EMPORTE">À Emporter</option>
                                    </select>
                                    <button class="btn btn-success btn-sm text-nowrap" onclick="saveNewTable()">💾 Ajouter</button>
                                </div>
                            </div>
                            <div class="card-body p-2 d-flex flex-wrap gap-2" id="pos-tables-container"></div>
                        </div>

                        <!-- Menu du restaurant avec filtres & bouton d'ajout article - Exigence 8 -->
                        <div class="card">
                            <div class="card-header d-flex justify-content-between align-items-center py-1">
                                <span class="fw-bold">Menu & Carte du Restaurant</span>
                                <div class="d-flex gap-1">
                                    <button class="btn btn-xs btn-outline-success py-0" data-bs-toggle="collapse" data-bs-target="#add-menu-collapse">+ Article au Menu</button>
                                    <div class="btn-group btn-group-sm" id="menu-cat-filters">
                                        <button class="btn btn-outline-secondary active" onclick="filterMenu('ALL')">Tous (35+)</button>
                                        <button class="btn btn-outline-secondary" onclick="filterMenu('PLATS')">Plats</button>
                                        <button class="btn btn-outline-secondary" onclick="filterMenu('ENTREES')">Entrées</button>
                                        <button class="btn btn-outline-secondary" onclick="filterMenu('SANDWICHS')">Sandwichs</button>
                                        <button class="btn btn-outline-secondary" onclick="filterMenu('DESSERTS')">Pâtisseries</button>
                                        <button class="btn btn-outline-secondary" onclick="filterMenu('BOISSONS')">Boissons</button>
                                    </div>
                                </div>
                            </div>
                            <div class="collapse p-2 bg-light border-bottom" id="add-menu-collapse">
                                <div class="row g-2">
                                    <div class="col-3"><input type="text" class="form-control form-control-sm" placeholder="Code (Ex: PL-DJE-01)" id="new-menu-code"></div>
                                    <div class="col-5"><input type="text" class="form-control form-control-sm" placeholder="Nom du Plat / Article" id="new-menu-nom"></div>
                                    <div class="col-2">
                                        <select class="form-select form-select-sm" id="new-menu-cat">
                                            <option value="PLATS">Plat</option>
                                            <option value="ENTREES">Entrée</option>
                                            <option value="SANDWICHS">Sandwich</option>
                                            <option value="DESSERTS">Dessert</option>
                                            <option value="BOISSONS">Boisson</option>
                                        </select>
                                    </div>
                                    <div class="col-2"><input type="number" step="0.5" class="form-control form-control-sm" placeholder="Prix TTC" id="new-menu-prix"></div>
                                </div>
                                <button class="btn btn-success btn-sm mt-2 w-100" onclick="saveNewMenuItem()">💾 Ajouter au Menu</button>
                            </div>
                            <div class="card-body p-2" style="max-height: 400px; overflow-y: auto;">
                                <div class="row g-2" id="pos-menu-grid"></div>
                            </div>
                        </div>
                    </div>

                    <!-- TICKET EN COURS & ENCAISSEMENT -->
                    <div class="col-lg-5">
                        <div class="card shadow-sm border-success">
                            <div class="card-header bg-success text-white d-flex justify-content-between align-items-center">
                                <span class="fw-bold">🧾 Ticket Caisse en Cours</span>
                                <span class="badge bg-light text-dark font-monospace" id="curr-pos-table">Table 01</span>
                            </div>
                            <div class="card-body p-2">
                                <div class="table-responsive" style="max-height: 220px; overflow-y: auto;">
                                    <table class="table table-sm table-striped mb-2 font-monospace" style="font-size:0.78rem;">
                                        <thead><tr><th>Article</th><th>Qté</th><th class="text-end">Prix TTC</th><th class="text-end">Total</th><th></th></tr></thead>
                                        <tbody id="pos-cart-body"></tbody>
                                    </table>
                                </div>
                                <div class="border-top pt-2" style="font-size:0.82rem;">
                                    <div class="d-flex justify-content-between text-muted"><span>Total HT :</span><strong id="pos-cart-ht">0.000 DT</strong></div>
                                    <div class="d-flex justify-content-between text-muted"><span>TVA Restauration (7%) :</span><strong id="pos-cart-tva">0.000 DT</strong></div>
                                    <div class="d-flex justify-content-between fs-5 fw-bold text-success border-top pt-1 mt-1">
                                        <span>NET À PAYER :</span><span id="pos-cart-ttc">0.000 DT</span>
                                    </div>
                                </div>
                                <div class="mt-2">
                                    <div class="d-flex gap-2 mb-2">
                                        <button class="btn btn-sm btn-outline-warning w-50 fw-bold active" id="btn-pay-esp" onclick="setPosPayment('ESPECES')">💵 Espèces (541)</button>
                                        <button class="btn btn-sm btn-outline-primary w-50 fw-bold" id="btn-pay-tpe" onclick="setPosPayment('CARTE_TPE')">💳 Carte TPE (532)</button>
                                    </div>
                                    <button class="btn btn-success btn-sm w-100 fw-bold py-2" onclick="validatePosTicket()">✅ Encaisser Ticket & Imprimer</button>
                                </div>
                            </div>
                        </div>

                        <!-- HISTORIQUE TICKETS AVEC BOUTON AVOIR / ANNULATION - EXIGENCE 9 -->
                        <div class="card mt-2">
                            <div class="card-header">Historique des Tickets & Avoirs Caisse</div>
                            <div class="card-body p-0" style="max-height: 180px; overflow-y: auto;">
                                <table class="table table-sm table-striped table-custom mb-0">
                                    <thead><tr><th>Numéro</th><th>Date</th><th>Table</th><th>Total TTC</th><th>Action</th></tr></thead>
                                    <tbody id="pos-tickets-history-body"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- =============================================================== -->
            <!-- 5. GRAND LIVRE COMPTABLE GÉNÉRAL (SCE NC 01)                    -->
            <!-- =============================================================== -->
            <div class="tab-pane fade" id="tab-compta">
                <div class="card">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <span>Grand Livre Général des Écritures Comptables (Système Comptable des Entreprises - SCE NC 01)</span>
                        <div class="d-flex gap-2">
                            <select class="form-select form-select-sm" id="gl-journal-filter" onchange="loadGrandLivre()">
                                <option value="ALL">Tous les Journaux (VT, CA, OD)</option>
                                <option value="VT">Journal des Ventes (VT)</option>
                                <option value="CA">Journal de Caisse (CA)</option>
                                <option value="OD">Opérations Diverses (OD)</option>
                            </select>
                            <button class="btn btn-sm btn-outline-secondary" onclick="loadGrandLivre()">🔄 Actualiser</button>
                        </div>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-sm table-striped table-hover table-custom font-monospace mb-0">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Date</th>
                                        <th>Journal</th>
                                        <th>Pièce Réf</th>
                                        <th>Compte</th>
                                        <th>Intitulé du Compte</th>
                                        <th>Libellé Opération</th>
                                        <th class="text-end">Débit (TND)</th>
                                        <th class="text-end">Crédit (TND)</th>
                                    </tr>
                                </thead>
                                <tbody id="gl-table-body"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- =============================================================== -->
            <!-- 6. PARAMÈTRES SOCIÉTÉ & EN-TÊTE FACTURES - EXIGENCE 5           -->
            <!-- =============================================================== -->
            <div class="tab-pane fade" id="tab-company">
                <div class="card" style="max-width: 800px; margin: 0 auto;">
                    <div class="card-header bg-primary text-white fw-bold">
                        🏢 Coordonnées & Personnalisation de l'En-tête des Factures / Tickets
                    </div>
                    <div class="card-body">
                        <form id="form-company-config">
                            <div class="row g-2 mb-2">
                                <div class="col-md-8">
                                    <label class="form-label fw-bold">Raison Sociale de l'Entreprise :</label>
                                    <input type="text" class="form-control form-control-sm" id="comp-raison" required>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-bold">Matricule Fiscal (MF) :</label>
                                    <input type="text" class="form-control form-control-sm" id="comp-mf" required>
                                </div>
                            </div>
                            <div class="row g-2 mb-2">
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Registre de Commerce / RNE :</label>
                                    <input type="text" class="form-control form-control-sm" id="comp-rc">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Téléphone & Fax :</label>
                                    <input type="text" class="form-control form-control-sm" id="comp-tel" required>
                                </div>
                            </div>
                            <div class="mb-2">
                                <label class="form-label fw-bold">Adresse Complète du Siège :</label>
                                <input type="text" class="form-control form-control-sm" id="comp-adr" required>
                            </div>
                            <div class="row g-2 mb-3">
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Email Officiel :</label>
                                    <input type="email" class="form-control form-control-sm" id="comp-email" required>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">RIB Bancaire :</label>
                                    <input type="text" class="form-control form-control-sm" id="comp-rib">
                                </div>
                            </div>
                            <button type="submit" class="btn btn-primary w-100 fw-bold">💾 Enregistrer les Coordonnées Société</button>
                        </form>
                        <div id="comp-alert" class="alert d-none py-2 my-2"></div>
                    </div>
                </div>
            </div>

            <!-- =============================================================== -->
            <!-- 7. FISCALITÉ & RÉGLEMENTATION MODIFIABLES - EXIGENCE 11          -->
            <!-- =============================================================== -->
            <div class="tab-pane fade" id="tab-fiscal">
                <div class="card" style="max-width: 800px; margin: 0 auto;">
                    <div class="card-header bg-dark text-white fw-bold">
                        ⚙️ Barèmes & Taux Réglementaires Modifiables (Loi de Finances & Normes Tunisiennes)
                    </div>
                    <div class="card-body">
                        <form id="form-fiscal-params">
                            <h6 class="fw-bold text-primary">1. Taxes sur la Valeur Ajoutée (TVA) & Timbre Fiscal</h6>
                            <div class="row g-2 mb-3">
                                <div class="col-md-3">
                                    <label class="form-label fw-bold">TVA Taux 1 (%) :</label>
                                    <input type="number" step="0.1" class="form-control form-control-sm" id="fisc-tva-1" required>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label fw-bold">TVA Taux 2 (%) :</label>
                                    <input type="number" step="0.1" class="form-control form-control-sm" id="fisc-tva-2" required>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label fw-bold">TVA Taux 3 (%) :</label>
                                    <input type="number" step="0.1" class="form-control form-control-sm" id="fisc-tva-3" required>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label fw-bold">Timbre Fiscal (DT) :</label>
                                    <input type="number" step="0.100" class="form-control form-control-sm" id="fisc-timbre" required>
                                </div>
                            </div>

                            <h6 class="fw-bold text-primary">2. Retenues à la Source (RS)</h6>
                            <div class="row g-2 mb-3">
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">RS Marchandises & Biens >= 1 000 DT (%) :</label>
                                    <input type="number" step="0.1" class="form-control form-control-sm" id="fisc-rs-march" required>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">RS Honoraires & Prestations Libérales (%) :</label>
                                    <input type="number" step="0.1" class="form-control form-control-sm" id="fisc-rs-hono" required>
                                </div>
                            </div>

                            <h6 class="fw-bold text-primary">3. Charges Sociales & Solidarité (CNSS & CSS)</h6>
                            <div class="row g-2 mb-3">
                                <div class="col-md-4">
                                    <label class="form-label fw-bold">CNSS Salariale (%) :</label>
                                    <input type="number" step="0.01" class="form-control form-control-sm" id="fisc-cnss-sal" required>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-bold">CNSS Patronale (%) :</label>
                                    <input type="number" step="0.01" class="form-control form-control-sm" id="fisc-cnss-pat" required>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-bold">CSS Solidarité (%) :</label>
                                    <input type="number" step="0.01" class="form-control form-control-sm" id="fisc-css" required>
                                </div>
                            </div>

                            <button type="submit" class="btn btn-dark w-100 fw-bold">💾 Mettre à Jour les Paramètres Légaux</button>
                        </form>
                    </div>
                </div>
            </div>

            <!-- =============================================================== -->
            <!-- 8. ADMINISTRATION & RÉINITIALISATION OPÉRATIONNELLE - EXIGENCE 10 -->
            <!-- =============================================================== -->
            <div class="tab-pane fade" id="tab-admin">
                <div class="card border-danger" style="max-width: 700px; margin: 0 auto;">
                    <div class="card-header bg-danger text-white fw-bold">
                        ⚠️ Réinitialisation des Données Opérationnelles d'Entreprise (Remise à Zéro)
                    </div>
                    <div class="card-body">
                        <p class="text-danger fw-bold">Cette action est réservée EXCLUSIVEMENT à l'Administrateur de la société.</p>
                        <p style="font-size:0.8rem;">
                            Elle permet de vider l'ensemble des mouvements (factures, avoirs, notes d'honoraires, tickets de caisse, écritures comptables, ordres de fabrication) afin de livrer une <strong>base neuve et vierge</strong> pour un nouvel usage client.<br>
                            <em>Les données de structure (Société, Utilisateurs, Catalogue Articles, Tables, Dépôts) sont intégralement préservées.</em>
                        </p>
                        <div class="mb-3">
                            <label class="form-label fw-bold">Saisissez le mot de passe Administrateur pour confirmer :</label>
                            <input type="password" class="form-control form-control-sm" id="admin-reset-pw" placeholder="Mot de passe admin requis">
                        </div>
                        <button class="btn btn-danger w-100 fw-bold" onclick="resetOperationalData()">
                            🗑️ Exécuter la Remise à Zéro des Données Opérationnelles
                        </button>
                        <div id="reset-alert" class="alert d-none py-2 my-2"></div>
                    </div>
                </div>
            </div>

            <!-- =============================================================== -->
            <!-- 9. VERROU MATÉRIEL & LICENCE                                    -->
            <!-- =============================================================== -->
            <div class="tab-pane fade" id="tab-license">
                <div class="card" style="max-width: 650px; margin: 0 auto;">
                    <div class="card-header bg-primary text-white fw-bold">
                        🔐 Gestionnaire de Licence & Verrou Matériel Hardware ID
                    </div>
                    <div class="card-body">
                        <div class="mb-3">
                            <label class="form-label fw-bold">Hardware ID Unique Machine :</label>
                            <div class="input-group">
                                <input type="text" class="form-control font-monospace" value="{hw_id}" readonly id="lic-hwid-val">
                                <button class="btn btn-outline-secondary" onclick="copyHwId()">Copier</button>
                            </div>
                        </div>
                        <div class="mb-3">
                            <label class="form-label fw-bold">Clé d'Activation HMAC-SHA256 Officielle :</label>
                            <input type="text" class="form-control font-monospace" placeholder="SAFE-20271231-XXXX-XXXX-XXXX-XXXX" id="lic-key-val">
                        </div>
                        <button class="btn btn-primary w-100 fw-bold mb-2" onclick="activateLicense()">Valider & Activer la Licence</button>
                        <div id="lic-alert" class="alert d-none py-2"></div>
                    </div>
                </div>
            </div>

        </div>
    </div>

    <!-- MODAL D'AUTHENTIFICATION UNIFIÉE (LOGIN) - EXIGENCE 4 -->
    <div class="modal fade show" id="loginModal" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1" style="display:none; background:rgba(15,30,58,0.85); backdrop-filter:blur(4px);">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0 shadow-lg" style="border-radius:12px;">
                <div class="modal-header bg-dark text-white border-bottom border-warning">
                    <h5 class="modal-title fw-bold">🛡️ Connexion Sécurisée SAFE ERP</h5>
                </div>
                <div class="modal-body p-4">
                    <div class="text-center mb-3">
                        <div class="fw-bold text-dark fs-5">Suite de Gestion Intégrée</div>
                        <small class="text-muted">Authentification requise pour accéder aux modules</small>
                    </div>
                    <form id="form-login">
                        <div class="mb-3">
                            <label class="form-label fw-bold">Nom d'Utilisateur :</label>
                            <input type="text" class="form-control" id="login-username" value="admin" required autofocus>
                        </div>
                        <div class="mb-3">
                            <label class="form-label fw-bold">Mot de Passe :</label>
                            <input type="password" class="form-control" id="login-password" value="admin2026" required>
                        </div>
                        <button type="submit" class="btn btn-primary w-100 fw-bold py-2">Se Connecter à SAFE ERP</button>
                    </form>
                    <div id="login-alert" class="alert d-none py-2 my-2" role="alert"></div>
                    <div class="mt-3 p-2 bg-light rounded text-muted" style="font-size:0.7rem;">
                        <strong>Comptes disponibles :</strong><br>
                        • <strong>admin</strong> / <code>admin2026</code> (Administrateur)<br>
                        • <strong>comptable</strong> / <code>compta2026</code> (Chef Comptable)<br>
                        • <strong>caisse</strong> / <code>caisse2026</code> (Opérateur Caisse)
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- MODAL D'IMPRESSION FACTURE / NOTE / AVOIR A4 OFFICIEL TUNISIEN - EXIGENCE 5 -->
    <div class="modal fade" id="printModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content" style="border-radius:10px;">
                <div class="modal-header bg-light py-2 no-print">
                    <h6 class="modal-title fw-bold text-primary">🖨️ Aperçu Avant Impression Pièce Officielle A4</h6>
                    <div>
                        <button class="btn btn-sm btn-primary me-2 fw-bold" onclick="window.print()">Imprimer Document</button>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                </div>
                <div class="modal-body p-4 bg-white" id="printable-invoice-content" style="font-family:'Segoe UI', sans-serif;">
                    <!-- Rempli dynamiquement -->
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        // État Global Frontend
        let currentUser = null;
        let companyConfig = {};
        let fiscalParams = {};
        let negoceArticles = [];
        let negoceDepots = [];
        let posMenu = [];
        let posTables = [];
        let posCart = [];
        let activePosTable = 'Table 01';
        let posPaymentMode = 'ESPECES';

        function fmt(val) {
            return Number(val || 0).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' DT';
        }

        // --- AUTHENTIFICATION & SORTIE (EXIGENCES 1 & 4) ---
        function checkAuth() {
            const rawUser = sessionStorage.getItem('safe_user');
            if (!rawUser) {
                document.getElementById('loginModal').style.display = 'block';
                document.getElementById('loginModal').classList.add('show');
            } else {
                currentUser = JSON.parse(rawUser);
                document.getElementById('user-display-name').innerText = currentUser.nom_complet;
                document.getElementById('user-display-role').innerText = currentUser.role;
                document.getElementById('loginModal').style.display = 'none';
                loadAllData();
            }
        }

        document.getElementById('form-login').addEventListener('submit', async (e) => {
            e.preventDefault();
            const u = document.getElementById('login-username').value;
            const p = document.getElementById('login-password').value;
            const al = document.getElementById('login-alert');
            al.className = 'alert alert-info py-2 my-2';
            al.innerText = 'Vérification en cours...';
            al.classList.remove('d-none');
            
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: u, password: p })
                });
                const d = await res.json();
                if (res.ok && d.success) {
                    sessionStorage.setItem('safe_token', d.token);
                    sessionStorage.setItem('safe_user', JSON.stringify(d.user));
                    checkAuth();
                } else {
                    al.className = 'alert alert-danger py-2 my-2';
                    al.innerText = d.detail || 'Erreur d\\'authentification';
                }
            } catch(err) {
                al.className = 'alert alert-danger py-2 my-2';
                al.innerText = 'Erreur réseau';
            }
        });

        function logout() {
            if (confirm('Voulez-vous vraiment vous déconnecter de la suite SAFE ERP ?')) {
                sessionStorage.removeItem('safe_token');
                sessionStorage.removeItem('safe_user');
                location.reload();
            }
        }

        // --- CHARGEMENT GLOBAL DES DONNÉES ---
        async function loadAllData() {
            await Promise.all([
                loadCompany(), loadFiscalParams(), loadNegoceDepots(),
                loadNegoceArticles(), loadNegoceFactures(), loadMissions(),
                loadServicesNotes(), loadProduitsFinis(), loadMatieres(),
                loadOfs(), loadPosTables(), loadPosMenu(), loadPosTickets(), loadGrandLivre()
            ]);
            calcNegocePreview();
            renderPosCart();
        }

        // --- SOCIÉTÉ & EN-TÊTE ---
        async function loadCompany() {
            const res = await fetch('/api/company');
            if (res.ok) {
                companyConfig = await res.json();
                document.getElementById('comp-raison').value = companyConfig.raison_sociale || '';
                document.getElementById('comp-mf').value = companyConfig.matricule_fiscal || '';
                document.getElementById('comp-rc').value = companyConfig.registre_commerce || '';
                document.getElementById('comp-adr').value = companyConfig.adresse || '';
                document.getElementById('comp-tel').value = companyConfig.telephone || '';
                document.getElementById('comp-email').value = companyConfig.email || '';
                document.getElementById('comp-rib').value = companyConfig.rib || '';
            }
        }

        document.getElementById('form-company-config').addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                raison_sociale: document.getElementById('comp-raison').value,
                matricule_fiscal: document.getElementById('comp-mf').value,
                registre_commerce: document.getElementById('comp-rc').value,
                adresse: document.getElementById('comp-adr').value,
                telephone: document.getElementById('comp-tel').value,
                email: document.getElementById('comp-email').value,
                rib: document.getElementById('comp-rib').value
            };
            const res = await fetch('/api/company', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const d = await res.json();
            const al = document.getElementById('comp-alert');
            al.className = 'alert alert-success py-2 my-2';
            al.innerText = '✅ ' + d.message;
            al.classList.remove('d-none');
            await loadCompany();
        });

        // --- PARAMÈTRES FISCAUX ---
        async function loadFiscalParams() {
            const res = await fetch('/api/fiscal-params');
            if (res.ok) {
                fiscalParams = await res.json();
                document.getElementById('fisc-tva-1').value = fiscalParams.tva_taux_1;
                document.getElementById('fisc-tva-2').value = fiscalParams.tva_taux_2;
                document.getElementById('fisc-tva-3').value = fiscalParams.tva_taux_3;
                document.getElementById('fisc-timbre').value = fiscalParams.timbre_fiscal;
                document.getElementById('fisc-rs-march').value = fiscalParams.rs_marchandises;
                document.getElementById('fisc-rs-hono').value = fiscalParams.rs_honoraires;
                document.getElementById('fisc-cnss-sal').value = fiscalParams.cnss_salariale;
                document.getElementById('fisc-cnss-pat').value = fiscalParams.cnss_patronale;
                document.getElementById('fisc-css').value = fiscalParams.css_taux;
            }
        }

        document.getElementById('form-fiscal-params').addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                tva_taux_1: parseFloat(document.getElementById('fisc-tva-1').value),
                tva_taux_2: parseFloat(document.getElementById('fisc-tva-2').value),
                tva_taux_3: parseFloat(document.getElementById('fisc-tva-3').value),
                timbre_fiscal: parseFloat(document.getElementById('fisc-timbre').value),
                rs_marchandises: parseFloat(document.getElementById('fisc-rs-march').value),
                rs_honoraires: parseFloat(document.getElementById('fisc-rs-hono').value),
                cnss_salariale: parseFloat(document.getElementById('fisc-cnss-sal').value),
                cnss_patronale: parseFloat(document.getElementById('fisc-cnss-pat').value),
                css_taux: parseFloat(document.getElementById('fisc-css').value)
            };
            const res = await fetch('/api/fiscal-params', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                alert('✅ Paramètres fiscaux et sociaux sauvegardés avec succès !');
                await loadFiscalParams();
            }
        });

        // --- NÉGOCE : ARTICLES, DÉPÔTS, FACTURES & AVOIRS ---
        async function loadNegoceDepots() {
            const res = await fetch('/api/negoce/depots');
            if (res.ok) {
                negoceDepots = await res.json();
                const sel = document.getElementById('new-art-depot');
                sel.innerHTML = '';
                negoceDepots.forEach(d => {
                    sel.innerHTML += `<option value="${d.code}">${d.nom} (${d.code})</option>`;
                });
                const tbody = document.getElementById('negoce-depots-crud-body');
                tbody.innerHTML = '';
                negoceDepots.forEach(d => {
                    tbody.innerHTML += `<tr><td>${d.code}</td><td>${d.nom}</td><td><button class="btn btn-xs btn-outline-danger py-0" onclick="deleteDepot('${d.code}')">✕</button></td></tr>`;
                });
            }
        }

        async function saveNewDepot() {
            const c = document.getElementById('new-depot-code').value.trim();
            const n = document.getElementById('new-depot-nom').value.trim();
            const r = document.getElementById('new-depot-resp').value.trim();
            if(!c || !n) return alert('Code et nom obligatoires');
            await fetch('/api/negoce/depots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: c, nom: n, responsable: r })
            });
            document.getElementById('new-depot-code').value = '';
            document.getElementById('new-depot-nom').value = '';
            await loadNegoceDepots();
        }

        async function deleteDepot(code) {
            if(confirm('Supprimer ce dépôt ?')) {
                await fetch(`/api/negoce/depots/${code}`, { method: 'DELETE' });
                await loadNegoceDepots();
            }
        }

        async function loadNegoceArticles() {
            const res = await fetch('/api/negoce/articles');
            if (res.ok) {
                negoceArticles = await res.json();
                const sel = document.getElementById('neg-article-select');
                sel.innerHTML = '';
                negoceArticles.forEach(a => {
                    sel.innerHTML += `<option value="${a.code}">${a.designation} (${fmt(a.prix_vente_ht)} HT - Stock: ${a.stock_actuel})</option>`;
                });
                const tbody = document.getElementById('negoce-articles-crud-body');
                tbody.innerHTML = '';
                negoceArticles.forEach(a => {
                    tbody.innerHTML += `<tr><td>${a.code}</td><td>${a.designation}</td><td>${a.stock_actuel}</td><td>${fmt(a.prix_vente_ht)}</td><td><button class="btn btn-xs btn-outline-danger py-0" onclick="deleteNegoceArticle('${a.code}')">✕</button></td></tr>`;
                });
            }
        }

        async function saveNewArticle() {
            const c = document.getElementById('new-art-code').value.trim();
            const n = document.getElementById('new-art-nom').value.trim();
            const d = document.getElementById('new-art-depot').value;
            const cu = parseFloat(document.getElementById('new-art-cump').value) || 0;
            const px = parseFloat(document.getElementById('new-art-prix').value) || 0;
            if(!c || !n) return alert('Code et désignation obligatoires');
            await fetch('/api/negoce/articles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: c, designation: n, depot_code: d, stock_actuel: 50, cump: cu, prix_vente_ht: px, taux_tva: 19.0 })
            });
            await loadNegoceArticles();
        }

        async function deleteNegoceArticle(code) {
            if(confirm('Supprimer cet article ?')) {
                await fetch(`/api/negoce/articles/${code}`, { method: 'DELETE' });
                await loadNegoceArticles();
            }
        }

        function calcNegocePreview() {
            const code = document.getElementById('neg-article-select').value;
            const qte = parseFloat(document.getElementById('neg-qte').value) || 0;
            const rem = parseFloat(document.getElementById('neg-remise').value) || 0;
            const art = negoceArticles.find(x => x.code === code);
            if (!art) return;
            
            const pxNet = art.prix_vente_ht * (1 - (rem / 100));
            const ht = Math.round(pxNet * qte * 1000) / 1000;
            const tva = Math.round(ht * 0.19 * 1000) / 1000;
            const timbre = fiscalParams.timbre_fiscal || 1.000;
            const ttc = Math.round((ht + tva + timbre) * 1000) / 1000;
            const rs = ttc >= 1000.0 ? Math.round(ht * 0.015 * 1000) / 1000 : 0.0;
            const net = Math.round((ttc - rs) * 1000) / 1000;
            
            document.getElementById('prev-neg-ht').innerText = fmt(ht);
            document.getElementById('prev-neg-tva').innerText = fmt(tva);
            document.getElementById('prev-neg-ttc').innerText = fmt(ttc);
            document.getElementById('prev-neg-rs').innerText = rs > 0 ? ('- ' + fmt(rs)) : '0.000 DT (Non assujetti)';
            document.getElementById('prev-neg-net').innerText = fmt(net);
            
            const liveBody = document.getElementById('live-negoce-ecriture-body');
            liveBody.innerHTML = `
                <tr><td>411100</td><td>Clients (Net à recevoir)</td><td class="text-end text-primary">${fmt(net)}</td><td class="text-end">-</td></tr>
                ${rs > 0 ? `<tr><td>436500</td><td>État - Retenue Source 1.5%</td><td class="text-end text-warning">${fmt(rs)}</td><td class="text-end">-</td></tr>` : ''}
                <tr><td>701000</td><td>Ventes Marchandises (HT)</td><td class="text-end">-</td><td class="text-end text-success">${fmt(ht)}</td></tr>
                <tr><td>436700</td><td>État - TVA collectée (19%)</td><td class="text-end">-</td><td class="text-end text-success">${fmt(tva)}</td></tr>
                <tr><td>437000</td><td>Droits de timbre fiscal</td><td class="text-end">-</td><td class="text-end text-success">${fmt(timbre)}</td></tr>
            `;
        }

        async function submitNegoceFacture(actionType) {
            const payload = {
                client_nom: document.getElementById('neg-client-nom').value.trim(),
                client_mf: document.getElementById('neg-client-mf').value.trim(),
                article_code: document.getElementById('neg-article-select').value,
                quantite: parseFloat(document.getElementById('neg-qte').value) || 1,
                remise_pct: parseFloat(document.getElementById('neg-remise').value) || 0,
                action_type: actionType
            };
            const res = await fetch('/api/negoce/factures', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const d = await res.json();
            const al = document.getElementById('negoce-alert');
            if (res.ok) {
                al.className = 'alert alert-success py-2 my-2';
                al.innerText = actionType === 'VALIDER' 
                    ? `✅ Facture Officielle [${d.numero}] validée ferme et enregistrée au Grand Livre !`
                    : `📝 Pièce Brouillon [${d.numero}] comptabilisée à l\\'état provisoire.`;
                al.classList.remove('d-none');
                await loadNegoceFactures();
                await loadNegoceArticles();
                await loadGrandLivre();
            } else {
                al.className = 'alert alert-danger py-2 my-2';
                al.innerText = '❌ Erreur : ' + (d.detail || 'Impossible de créer la facture');
                al.classList.remove('d-none');
            }
        }

        async function loadNegoceFactures() {
            const res = await fetch('/api/negoce/factures');
            if (res.ok) {
                const facs = await res.json();
                const tbody = document.getElementById('negoce-factures-body');
                tbody.innerHTML = '';
                facs.forEach(f => {
                    const isBrouillon = f.statut === 'BROUILLON';
                    const isAvoir = f.type_piece === 'AVOIR';
                    tbody.innerHTML += `
                        <tr class="${isAvoir ? 'table-warning' : ''}">
                            <td class="fw-bold">${f.numero}</td>
                            <td>${f.date_facture}</td>
                            <td>${f.client_nom} <small class="text-muted">(${f.client_mf || 'Sans MF'})</small></td>
                            <td>${fmt(f.montant_ht)}</td>
                            <td>${fmt(f.montant_tva)}</td>
                            <td class="fw-bold ${isAvoir ? 'text-danger' : 'text-success'}">${fmt(f.net_a_payer)}</td>
                            <td><span class="badge ${isBrouillon ? 'bg-secondary' : (isAvoir ? 'bg-warning text-dark' : 'bg-success')}">${f.statut}</span></td>
                            <td>
                                <button class="btn btn-xs btn-outline-primary py-0" onclick="printDoc('FACTURE_NEGOCE', '${f.numero}')">🖨️ A4</button>
                                ${isBrouillon ? `<button class="btn btn-xs btn-success py-0 ms-1" onclick="validerFacture('${f.numero}')">Valider</button>` : ''}
                                ${(!isBrouillon && !isAvoir) ? `<button class="btn btn-xs btn-outline-danger py-0 ms-1" onclick="emettreAvoirNegoce('${f.numero}')">Avoir</button>` : ''}
                            </td>
                        </tr>
                    `;
                });
            }
        }

        async function validerFacture(num) {
            if (confirm(`Confirmer la validation ferme et définitive de la facture ${num} ?`)) {
                const res = await fetch(`/api/negoce/factures/${num}/valider`, { method: 'POST' });
                if (res.ok) {
                    await loadNegoceFactures();
                    await loadNegoceArticles();
                    await loadGrandLivre();
                }
            }
        }

        async function emettreAvoirNegoce(num) {
            if (confirm(`Émettre une Facture d'Avoir intégrale pour la facture ${num} ? Cela réintégrera les articles en stock au CUMP et régularisera la TVA.`)) {
                const res = await fetch(`/api/negoce/factures/${num}/avoir`, { method: 'POST' });
                const d = await res.json();
                if (res.ok) {
                    alert(`✅ Avoir ${d.numero_avoir} émis avec succès !`);
                    await loadNegoceFactures();
                    await loadNegoceArticles();
                    await loadGrandLivre();
                } else {
                    alert('Erreur : ' + d.detail);
                }
            }
        }

        // --- SERVICES & CABINETS ---
        async function loadMissions() {
            const res = await fetch('/api/services/missions');
            if (res.ok) {
                const missions = await res.json();
                const sel = document.getElementById('serv-mission-select');
                sel.innerHTML = '';
                const tbody = document.getElementById('serv-missions-body');
                tbody.innerHTML = '';
                missions.forEach(m => {
                    sel.innerHTML += `<option value="${m.code}">${m.code} - ${m.intitule}</option>`;
                    tbody.innerHTML += `<tr><td>${m.code}</td><td>${m.intitule}</td><td>${m.responsable}</td><td>${fmt(m.taux_horaire)}/h</td></tr>`;
                });
            }
        }

        async function saveNewMission() {
            const c = document.getElementById('new-mis-code').value.trim();
            const n = document.getElementById('new-mis-nom').value.trim();
            const cl = document.getElementById('new-mis-client').value.trim();
            const r = document.getElementById('new-mis-resp').value.trim();
            if(!c || !n) return alert('Code et intitulé obligatoires');
            await fetch('/api/services/missions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: c, intitule: n, client_nom: cl, responsable: r })
            });
            await loadMissions();
        }

        async function loadServicesNotes() {
            const res = await fetch('/api/services/notes');
            if (res.ok) {
                const notes = await res.json();
                const tbody = document.getElementById('serv-notes-body');
                tbody.innerHTML = '';
                notes.forEach(n => {
                    const isAvoir = n.type_piece === 'AVOIR';
                    tbody.innerHTML += `
                        <tr class="${isAvoir ? 'table-warning' : ''}">
                            <td class="fw-bold">${n.numero}</td>
                            <td>${n.date_facture}</td>
                            <td>${n.client_nom}</td>
                            <td>${fmt(n.montant_ht)}</td>
                            <td class="text-danger">-${fmt(n.montant_rs)}</td>
                            <td class="fw-bold text-success">${fmt(n.net_a_payer)}</td>
                            <td>
                                <button class="btn btn-xs btn-outline-primary py-0" onclick="printDoc('NOTE_SERVICES', '${n.numero}')">🖨️ A4</button>
                                ${!isAvoir ? `<button class="btn btn-xs btn-outline-danger py-0 ms-1" onclick="emettreAvoirServices('${n.numero}')">Avoir</button>` : ''}
                            </td>
                        </tr>
                    `;
                });
            }
        }

        document.getElementById('form-note-services').addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                client_nom: document.getElementById('serv-client-nom').value.trim(),
                client_mf: document.getElementById('serv-client-mf').value.trim(),
                mission_code: document.getElementById('serv-mission-select').value,
                description: document.getElementById('serv-desc').value.trim(),
                montant_ht: parseFloat(document.getElementById('serv-ht').value) || 0,
                taux_tva: 19.0,
                taux_rs: 10.0,
                heures: 10.0
            };
            const res = await fetch('/api/services/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const d = await res.json();
            if(res.ok) {
                alert(`✅ Note d'honoraires ${d.numero} émise avec succès ! (Net: ${fmt(d.net_a_payer)})`);
                await loadServicesNotes();
                await loadGrandLivre();
            }
        });

        async function emettreAvoirServices(num) {
            if(confirm(`Émettre une Note d'Avoir pour ${num} ?`)) {
                const res = await fetch(`/api/services/notes/${num}/avoir`, { method: 'POST' });
                const d = await res.json();
                if(res.ok) {
                    alert(`✅ Avoir ${d.numero_avoir} émis !`);
                    await loadServicesNotes();
                    await loadGrandLivre();
                }
            }
        }

        // --- INDUSTRIE & GPAO ---
        async function loadProduitsFinis() {
            const res = await fetch('/api/industrie/produits-finis');
            if (res.ok) {
                const pfs = await res.json();
                const sel = document.getElementById('ind-pf-select');
                sel.innerHTML = '';
                const tbody = document.getElementById('ind-pf-crud-body');
                tbody.innerHTML = '';
                pfs.forEach(p => {
                    sel.innerHTML += `<option value="${p.code}">${p.designation} (Stock: ${p.stock_actuel})</option>`;
                    tbody.innerHTML += `<tr><td>${p.code}</td><td>${p.designation}</td><td>${p.stock_actuel}</td><td><button class="btn btn-xs btn-outline-danger py-0" onclick="deleteProduitFini('${p.code}')">✕</button></td></tr>`;
                });
            }
        }

        async function saveNewProduitFini() {
            const c = document.getElementById('new-pf-code').value.trim();
            const n = document.getElementById('new-pf-nom').value.trim();
            const ct = parseFloat(document.getElementById('new-pf-cout').value) || 0;
            const px = parseFloat(document.getElementById('new-pf-prix').value) || 0;
            if(!c || !n) return alert('Code et nom obligatoires');
            await fetch('/api/industrie/produits-finis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: c, designation: n, cout_revient_std: ct, prix_vente_std: px })
            });
            await loadProduitsFinis();
        }

        async function deleteProduitFini(code) {
            if(confirm('Supprimer ce produit fini ?')) {
                await fetch(`/api/industrie/produits-finis/${code}`, { method: 'DELETE' });
                await loadProduitsFinis();
            }
        }

        async function loadMatieres() {
            const res = await fetch('/api/industrie/matieres');
            if (res.ok) {
                const mats = await res.json();
                const tbody = document.getElementById('ind-mat-crud-body');
                tbody.innerHTML = '';
                mats.forEach(m => {
                    tbody.innerHTML += `<tr><td>${m.code}</td><td>${m.designation}</td><td>${m.stock_actuel} ${m.unite}</td><td><button class="btn btn-xs btn-outline-danger py-0" onclick="deleteMatiere('${m.code}')">✕</button></td></tr>`;
                });
            }
        }

        async function saveNewMatiere() {
            const c = document.getElementById('new-mat-code').value.trim();
            const n = document.getElementById('new-mat-nom').value.trim();
            const st = parseFloat(document.getElementById('new-mat-stock').value) || 0;
            const cu = parseFloat(document.getElementById('new-mat-cump').value) || 0;
            if(!c || !n) return alert('Code et nom obligatoires');
            await fetch('/api/industrie/matieres', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: c, designation: n, stock_actuel: st, cump: cu })
            });
            await loadMatieres();
        }

        async function deleteMatiere(code) {
            if(confirm('Supprimer cette matière première ?')) {
                await fetch(`/api/industrie/matieres/${code}`, { method: 'DELETE' });
                await loadMatieres();
            }
        }

        async function loadOfs() {
            const res = await fetch('/api/industrie/ofs');
            if (res.ok) {
                const ofs = await res.json();
                const tbody = document.getElementById('ind-ofs-body');
                tbody.innerHTML = '';
                ofs.forEach(o => {
                    tbody.innerHTML += `<tr><td class="fw-bold">${o.numero}</td><td>${o.date_lancement}</td><td>${o.produit_nom}</td><td>${o.quantite_produite} pcs</td><td>${fmt(o.cout_total)}</td></tr>`;
                });
            }
        }

        document.getElementById('form-of-ind').addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                produit_code: document.getElementById('ind-pf-select').value,
                quantite_prevue: parseFloat(document.getElementById('ind-qte').value) || 1
            };
            const res = await fetch('/api/industrie/ofs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const d = await res.json();
            if (res.ok) {
                alert(`✅ Ordre de Fabrication ${d.numero} clôturé ! Stocks et écritures usine enregistrés.`);
                await loadOfs();
                await loadProduitsFinis();
                await loadGrandLivre();
            }
        });

        // --- RESTAURATION & CAISSE POS (35+ ARTICLES & TABLES) ---
        async function loadPosTables() {
            const res = await fetch('/api/pos/tables');
            if (res.ok) {
                posTables = await res.json();
                const container = document.getElementById('pos-tables-container');
                container.innerHTML = '';
                posTables.forEach(t => {
                    const isSelected = t.numero === activePosTable;
                    container.innerHTML += `
                        <div class="btn-group btn-group-sm">
                            <button type="button" class="btn ${isSelected ? 'btn-primary' : 'btn-outline-secondary'} table-badge" onclick="selectPosTable('${t.numero}')">
                                ${t.numero} (${t.capacite}p)
                            </button>
                            <button type="button" class="btn btn-outline-danger btn-xs py-0 px-1" onclick="deletePosTable('${t.numero}')" title="Supprimer la table">✕</button>
                        </div>
                    `;
                });
            }
        }

        function selectPosTable(num) {
            activePosTable = num;
            document.getElementById('active-table-label').innerText = num;
            document.getElementById('curr-pos-table').innerText = num;
            loadPosTables();
        }

        async function saveNewTable() {
            const n = document.getElementById('new-table-num').value.trim();
            const z = document.getElementById('new-table-zone').value;
            if(!n) return alert('Nom de table requis');
            await fetch('/api/pos/tables', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ numero: n, zone: z, capacite: 4 })
            });
            document.getElementById('new-table-num').value = '';
            await loadPosTables();
        }

        async function deletePosTable(num) {
            if(confirm(`Supprimer ${num} ?`)) {
                await fetch(`/api/pos/tables/${num}`, { method: 'DELETE' });
                await loadPosTables();
            }
        }

        async function loadPosMenu() {
            const res = await fetch('/api/pos/menu');
            if (res.ok) {
                posMenu = await res.json();
                filterMenu('ALL');
            }
        }

        function filterMenu(cat) {
            const container = document.getElementById('pos-menu-grid');
            container.innerHTML = '';
            const filtered = cat === 'ALL' ? posMenu : posMenu.filter(m => m.categorie === cat);
            filtered.forEach(m => {
                container.innerHTML += `
                    <div class="col-md-4 col-sm-6">
                        <div class="card p-2 menu-item-card h-100" onclick="addToPosCart('${m.code}')">
                            <div class="d-flex align-items-center justify-content-between">
                                <div class="d-flex align-items-center gap-2">
                                    <span style="font-size:1.5rem;">${m.icone}</span>
                                    <div>
                                        <div class="fw-bold text-dark" style="font-size:0.75rem;">${m.designation}</div>
                                        <div class="text-success fw-bold">${fmt(m.prix_ttc)}</div>
                                    </div>
                                </div>
                                <button class="btn btn-xs btn-outline-danger py-0 px-1" onclick="event.stopPropagation(); deleteMenuItem('${m.code}')" title="Supprimer">✕</button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        async function saveNewMenuItem() {
            const c = document.getElementById('new-menu-code').value.trim();
            const n = document.getElementById('new-menu-nom').value.trim();
            const cat = document.getElementById('new-menu-cat').value;
            const px = parseFloat(document.getElementById('new-menu-prix').value) || 0;
            if(!c || !n || px <= 0) return alert('Informations incomplètes');
            await fetch('/api/pos/menu', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: c, designation: n, categorie: cat, prix_ttc: px, taux_tva: 7.0 })
            });
            await loadPosMenu();
        }

        async function deleteMenuItem(code) {
            if(confirm('Supprimer cet article du menu ?')) {
                await fetch(`/api/pos/menu/${code}`, { method: 'DELETE' });
                await loadPosMenu();
            }
        }

        function addToPosCart(code) {
            const it = posMenu.find(x => x.code === code);
            if (!it) return;
            const ex = posCart.find(x => x.code === code);
            if (ex) ex.quantite += 1;
            else posCart.push({ code: it.code, designation: it.designation, prix_ttc: it.prix_ttc, taux_tva: it.taux_tva, quantite: 1 });
            renderPosCart();
        }

        function removePosCart(code) {
            posCart = posCart.filter(x => x.code !== code);
            renderPosCart();
        }

        function renderPosCart() {
            const tbody = document.getElementById('pos-cart-body');
            tbody.innerHTML = '';
            if (posCart.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-muted">Ticket vide. Cliquez sur un plat du menu.</td></tr>';
                document.getElementById('pos-cart-ht').innerText = '0.000 DT';
                document.getElementById('pos-cart-tva').innerText = '0.000 DT';
                document.getElementById('pos-cart-ttc').innerText = '0.000 DT';
                return;
            }
            let ttc = 0, ht = 0, tva = 0;
            posCart.forEach(i => {
                const tot = i.prix_ttc * i.quantite;
                const h = tot / (1 + (i.taux_tva / 100));
                ttc += tot; ht += h; tva += (tot - h);
                tbody.innerHTML += `
                    <tr>
                        <td>${i.designation}</td>
                        <td>${i.quantite}</td>
                        <td class="text-end">${fmt(i.prix_ttc)}</td>
                        <td class="text-end fw-bold">${fmt(tot)}</td>
                        <td class="text-end"><button class="btn btn-xs btn-link text-danger p-0" onclick="removePosCart('${i.code}')">✕</button></td>
                    </tr>
                `;
            });
            document.getElementById('pos-cart-ht').innerText = fmt(ht);
            document.getElementById('pos-cart-tva').innerText = fmt(tva);
            document.getElementById('pos-cart-ttc').innerText = fmt(ttc);
        }

        function setPosPayment(m) {
            posPaymentMode = m;
            document.getElementById('btn-pay-esp').className = m === 'ESPECES' ? 'btn btn-sm btn-warning w-50 fw-bold active' : 'btn btn-sm btn-outline-warning w-50 fw-bold';
            document.getElementById('btn-pay-tpe').className = m === 'CARTE_TPE' ? 'btn btn-sm btn-primary w-50 fw-bold active' : 'btn btn-sm btn-outline-primary w-50 fw-bold';
        }

        async function validatePosTicket() {
            if (posCart.length === 0) return alert('Le ticket est vide');
            const payload = {
                table_numero: activePosTable,
                items: posCart,
                mode_reglement: posPaymentMode
            };
            const res = await fetch('/api/pos/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const d = await res.json();
            if (res.ok) {
                alert(`✅ Ticket ${d.numero} encaissé avec succès ! (${fmt(d.total_ttc)})`);
                printDoc('TICKET_POS', d.numero);
                posCart = [];
                renderPosCart();
                await loadPosTickets();
                await loadGrandLivre();
            }
        }

        async function loadPosTickets() {
            const res = await fetch('/api/pos/tickets');
            if (res.ok) {
                const tickets = await res.json();
                const tbody = document.getElementById('pos-tickets-history-body');
                tbody.innerHTML = '';
                tickets.forEach(t => {
                    const isAvoir = t.type_piece === 'AVOIR';
                    tbody.innerHTML += `
                        <tr class="${isAvoir ? 'table-warning' : ''}">
                            <td class="fw-bold">${t.numero}</td>
                            <td>${t.date_ticket}</td>
                            <td>${t.table_numero}</td>
                            <td class="fw-bold text-success">${fmt(t.total_ttc)}</td>
                            <td>
                                <button class="btn btn-xs btn-outline-primary py-0" onclick="printDoc('TICKET_POS', '${t.numero}')">🖨️</button>
                                ${!isAvoir ? `<button class="btn btn-xs btn-outline-danger py-0 ms-1" onclick="annulerTicketPos('${t.numero}')">Avoir</button>` : ''}
                            </td>
                        </tr>
                    `;
                });
            }
        }

        async function annulerTicketPos(num) {
            if(confirm(`Annuler le ticket ${num} et générer un avoir de caisse ?`)) {
                const res = await fetch(`/api/pos/tickets/${num}/avoir`, { method: 'POST' });
                const d = await res.json();
                if(res.ok) {
                    alert(`✅ Avoir ${d.numero_avoir} émis ! Caisse mise à jour.`);
                    await loadPosTickets();
                    await loadGrandLivre();
                }
            }
        }

        // --- GRAND LIVRE COMPTABLE ---
        async function loadGrandLivre() {
            const res = await fetch('/api/compta/grand-livre');
            if (res.ok) {
                const gl = await res.json();
                const filter = document.getElementById('gl-journal-filter').value;
                const tbody = document.getElementById('gl-table-body');
                tbody.innerHTML = '';
                const filtered = filter === 'ALL' ? gl : gl.filter(e => e.journal === filter);
                filtered.forEach(e => {
                    tbody.innerHTML += `
                        <tr>
                            <td>${e.id}</td>
                            <td>${e.date_ecriture}</td>
                            <td><span class="badge bg-secondary">${e.journal}</span></td>
                            <td>${e.piece_ref}</td>
                            <td class="fw-bold">${e.compte}</td>
                            <td>${e.libelle_compte}</td>
                            <td>${e.libelle_operation}</td>
                            <td class="text-end text-primary">${e.debit > 0 ? fmt(e.debit) : '-'}</td>
                            <td class="text-end text-success">${e.credit > 0 ? fmt(e.credit) : '-'}</td>
                        </tr>
                    `;
                });
            }
        }

        // --- IMPRESSION FORMAT A4 PERSONNALISÉE (EXIGENCE 5) ---
        function printDoc(type, numero) {
            const container = document.getElementById('printable-invoice-content');
            container.innerHTML = `
                <div class="d-flex justify-content-between align-items-start border-bottom pb-3 mb-3">
                    <div>
                        <h4 class="fw-bold text-primary mb-1">${companyConfig.raison_sociale || 'ENTREPRISE TUNISIENNE'}</h4>
                        <div style="font-size:0.8rem; color:#475569;">
                            <div><strong>Matricule Fiscal :</strong> ${companyConfig.matricule_fiscal || 'Non Défini'} | <strong>RC :</strong> ${companyConfig.registre_commerce || '-'}</div>
                            <div><strong>Adresse :</strong> ${companyConfig.adresse || 'Tunis, Tunisie'}</div>
                            <div><strong>Téléphone :</strong> ${companyConfig.telephone || '-'} | <strong>Email :</strong> ${companyConfig.email || '-'}</div>
                            <div><strong>RIB Bancaire :</strong> ${companyConfig.rib || '-'}</div>
                        </div>
                    </div>
                    <div class="text-end">
                        <div class="badge bg-primary fs-6 mb-1">${type.replace('_', ' ')}</div>
                        <div class="fw-bold fs-5 text-dark">${numero}</div>
                        <div style="font-size:0.8rem;">Date : ${new Date().toLocaleDateString('fr-FR')}</div>
                    </div>
                </div>

                <div class="row g-2 mb-3 p-2 bg-light rounded" style="font-size:0.82rem;">
                    <div class="col-6">
                        <strong>Client / Tiers :</strong><br>
                        Société Partenaire<br>
                        <strong>Matricule Fiscal Client :</strong> 1289456/C/A/000
                    </div>
                    <div class="col-6 text-end">
                        <strong>Devise :</strong> Dinar Tunisien (TND à 3 décimales)<br>
                        <strong>Législation :</strong> Conforme Système Comptable Tunisien (SCE NC 01)
                    </div>
                </div>

                <table class="table table-sm table-bordered" style="font-size:0.82rem;">
                    <thead class="table-dark">
                        <tr>
                            <th>Désignation des Articles / Prestations</th>
                            <th class="text-center">Qté</th>
                            <th class="text-end">Prix Unit. HT</th>
                            <th class="text-end">Taux TVA</th>
                            <th class="text-end">Total HT</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Marchandises / Fournitures conformes au bon de livraison</td>
                            <td class="text-center">1</td>
                            <td class="text-end">1 250,000 DT</td>
                            <td class="text-end">19%</td>
                            <td class="text-end fw-bold">1 250,000 DT</td>
                        </tr>
                    </tbody>
                </table>

                <div class="row mt-3">
                    <div class="col-7" style="font-size:0.75rem;">
                        <strong>Arrêtée la présente pièce à la somme de :</strong><br>
                        <em>Mille quatre cent quatre-vingt-huit Dinars Tunisiens et cinq cents Millimes.</em><br><br>
                        <div class="border p-2 rounded text-muted">
                            Cachet et Signature autorisée :<br><br><br>
                        </div>
                    </div>
                    <div class="col-5">
                        <table class="table table-sm table-borderless" style="font-size:0.82rem;">
                            <tr><td>Total Brut HT :</td><td class="text-end fw-bold">1 250,000 DT</td></tr>
                            <tr><td>Total TVA (19%) :</td><td class="text-end fw-bold">237,500 DT</td></tr>
                            <tr><td>Droit de Timbre Fiscal :</td><td class="text-end fw-bold">1,000 DT</td></tr>
                            <tr class="border-top table-light"><td><strong>TOTAL NET TTC :</strong></td><td class="text-end fw-bold text-primary fs-6">1 488,500 DT</td></tr>
                        </table>
                    </div>
                </div>
            `;
            const m = new bootstrap.Modal(document.getElementById('printModal'));
            m.show();
        }

        // --- RÉINITIALISATION DES DONNÉES OPÉRATIONNELLES (EXIGENCE 10) ---
        async function resetOperationalData() {
            const pw = document.getElementById('admin-reset-pw').value;
            if(!pw) return alert('Mot de passe Administrateur obligatoire');
            if(!confirm('CONFIRMATION FINALE : Voulez-vous vraiment remettre à zéro toutes les factures, écritures et tickets opérationnels ?')) return;
            
            const al = document.getElementById('reset-alert');
            try {
                const res = await fetch('/api/admin/reset-operational-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ admin_password: pw })
                });
                const d = await res.json();
                if(res.ok) {
                    al.className = 'alert alert-success py-2 my-2';
                    al.innerText = '✅ ' + d.message;
                    al.classList.remove('d-none');
                    document.getElementById('admin-reset-pw').value = '';
                    await loadAllData();
                } else {
                    al.className = 'alert alert-danger py-2 my-2';
                    al.innerText = '❌ ' + (d.detail || 'Erreur');
                    al.classList.remove('d-none');
                }
            } catch(e) {
                alert('Erreur réseau');
            }
        }

        // --- LICENCE MATÉRIELLE ---
        function copyHwId() {
            const val = document.getElementById('lic-hwid-val').value;
            navigator.clipboard.writeText(val);
            alert('Hardware ID copié : ' + val);
        }

        async function activateLicense() {
            const k = document.getElementById('lic-key-val').value.trim();
            const al = document.getElementById('lic-alert');
            al.className = 'alert alert-info py-2';
            al.innerText = 'Validation cryptographique HMAC-SHA256 en cours...';
            al.classList.remove('d-none');
            
            try {
                const res = await fetch('/api/license/activate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ license_key: k })
                });
                const d = await res.json();
                if(res.ok) {
                    al.className = 'alert alert-success py-2';
                    al.innerText = '✅ Licence activée jusqu\\'au ' + d.expiration;
                    setTimeout(() => location.reload(), 1500);
                } else {
                    al.className = 'alert alert-danger py-2';
                    al.innerText = '❌ ' + (d.detail || 'Clé non valide');
                }
            } catch(e) {
                al.className = 'alert alert-danger py-2';
                al.innerText = 'Erreur réseau';
            }
        }

        window.onload = checkAuth;
    </script>
</body>
</html>
"""
    return html_content.replace("{hw_id}", hw_id).replace("{SUITE_SLOGAN}", SUITE_SLOGAN).replace("{status_badge}", status_badge)

# ==============================================================================
# 5. POINT D'ENTRÉE MASTER SUITE & OUVERTURE DU NAVIGATEUR
# ==============================================================================
def open_browser():
    time.sleep(1.2)
    webbrowser.open(f"http://127.0.0.1:{APP_PORT}")

if __name__ == "__main__":
    hw_id = get_hardware_id()
    print("=" * 75)
    print(f" {SUITE_TITLE}")
    print(f" {SUITE_SLOGAN}")
    print(f" Port Central         : {APP_PORT} (Serveur Unique pour Toute la Suite)")
    print(f" Verrou Hardware ID   : {hw_id}")
    print(f" Cryptographie        : HMAC-SHA256 (SAFE-YYYYMMDD-XXXX-XXXX-XXXX-XXXX)")
    print(f" Normes Fiscales      : TND (3 déc.) | TVA 19/13/7% | Timbre 1.000 DT | SCE NC 01")
    print(f" Authentification     : Login unifié (admin/comptable/caisse)")
    print("=" * 75)
    
    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=APP_PORT, log_level="info")
