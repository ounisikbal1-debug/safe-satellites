# -*- coding: utf-8 -*-
"""
SAFE ERP - MODULE 04 : RESTAURATION, CAFÉ & PÂTISSERIE POS (TUNISIE) - STANDALONE PORT 8004
Point de Vente tactile, Menu restaurant & pâtisserie riche, Tables & Comptoir, TVA 7%/19%, SCE NC 01
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
import json
from datetime import date, datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

MODULE_CODE = "RESTAURATION"
MODULE_TITLE = "SAFE Restauration & Point de Vente POS"
PORT = 8004
SECRET_SALT = b"SAFE_ERP_TUNISIE_2026_MASTER_HMAC_KEY_#991"

prog_data = os.environ.get("PROGRAMDATA", os.path.expanduser("~"))
DATA_DIR = os.path.join(prog_data, "SAFE_ERP_Tunisie", "04_SAFE_Restauration_POS")
os.makedirs(DATA_DIR, exist_ok=True)
LICENSE_FILE = os.path.join(DATA_DIR, "license.dat")
DB_PATH = os.path.join(DATA_DIR, "safe_pos_local.db")

def get_hardware_id() -> str:
    raw = f"{uuid.getnode()}-{socket.gethostname()}-{sys.platform}".encode("utf-8")
    return "HW-" + hashlib.sha256(raw).hexdigest()[:12].upper()

def compute_valid_license(hw_id: str, exp_date_str: str) -> str:
    clean_exp = exp_date_str.replace("-", "")
    payload = f"{MODULE_CODE}|{hw_id.upper()}|{clean_exp}".encode("utf-8")
    expected = hmac.new(SECRET_SALT, payload, hashlib.sha256).hexdigest().upper()
    expected_parts = [expected[i:i+4] for i in range(0, 16, 4)]
    return f"SAFE-{clean_exp}-{'-'.join(expected_parts)}"

def verify_license_key(key: str) -> bool:
    try:
        parts = key.strip().split("-")
        if len(parts) != 6 or parts[0] != "SAFE":
            return False
        exp_date_str = parts[1]
        exp_date = datetime.strptime(exp_date_str, "%Y%m%d").date()
        if exp_date < date.today():
            return False
        hw_id = get_hardware_id()
        expected = compute_valid_license(hw_id, exp_date_str)
        return hmac.compare_digest(expected, key.strip())
    except Exception:
        return False

def is_activated() -> bool:
    if not os.path.exists(LICENSE_FILE):
        return False
    try:
        with open(LICENSE_FILE, "r", encoding="utf-8") as f:
            key = f.read().strip()
        return verify_license_key(key)
    except Exception:
        return False

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_pw(pw: str) -> str:
    return hashlib.sha256(pw.encode("utf-8")).hexdigest()

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS utilisateurs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            nom_complet TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'SERVEUR'
        )
    """)
    
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
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS fiscal_params (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tranches_irpp_json TEXT NOT NULL,
            taux_cnss_salarie REAL DEFAULT 9.18,
            taux_cnss_patronal REAL DEFAULT 16.57,
            taux_css REAL DEFAULT 1.0,
            timbre_fiscal REAL DEFAULT 1.000,
            taux_tva_defaut REAL DEFAULT 7.0
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS pos_tables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero_table TEXT UNIQUE NOT NULL,
            zone TEXT NOT NULL DEFAULT 'SALLE',
            capacite INTEGER DEFAULT 4,
            statut TEXT DEFAULT 'LIBRE',
            actif INTEGER DEFAULT 1
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS pos_menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            categorie TEXT NOT NULL,
            code TEXT UNIQUE NOT NULL,
            nom TEXT NOT NULL,
            prix_ttc REAL NOT NULL,
            taux_tva REAL NOT NULL DEFAULT 7.0,
            actif INTEGER DEFAULT 1
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS pos_commandes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero_ticket TEXT UNIQUE NOT NULL,
            date_commande TEXT NOT NULL,
            type_piece TEXT DEFAULT 'TICKET',
            reference_origine TEXT,
            table_numero TEXT NOT NULL,
            serveur_nom TEXT,
            client_nom TEXT DEFAULT 'Client Comptoir / Table',
            client_mf TEXT,
            lignes_json TEXT NOT NULL,
            total_ht REAL NOT NULL DEFAULT 0,
            total_tva REAL NOT NULL DEFAULT 0,
            timbre_fiscal REAL NOT NULL DEFAULT 0,
            total_ttc REAL NOT NULL DEFAULT 0,
            mode_reglement TEXT DEFAULT 'ESPECES',
            statut TEXT DEFAULT 'PAYE'
        )
    """)
    
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
    
    c.execute("SELECT COUNT(*) FROM utilisateurs")
    if c.fetchone()[0] == 0:
        c.executemany("INSERT INTO utilisateurs (username, password_hash, nom_complet, role) VALUES (?, ?, ?, ?)", [
            ("admin", hash_pw("admin2026"), "Directeur Restauration", "ADMIN"),
            ("caisse", hash_pw("caisse2026"), "Chef Caissier", "CAISSIER"),
            ("serveur", hash_pw("serv2026"), "Serveur Salle", "SERVEUR")
        ])
        
    c.execute("SELECT COUNT(*) FROM societe_config")
    if c.fetchone()[0] == 0:
        c.execute("""
            INSERT INTO societe_config (raison_sociale, matricule_fiscal, registre_commerce, adresse, telephone, email, rib, devise)
            VALUES ('Restaurant & Pâtisserie Fine Les Saveurs de Carthage SARL', '1428590/M/C/000', 'B184952026', 'Avenue Habib Bourguiba, 2016 Carthage Tunis', '+216 71 730 400', 'carthage@saveurs-tunisie.tn', 'ATB 01 003 0001234567890 22', 'TND')
        """)
        
    c.execute("SELECT COUNT(*) FROM fiscal_params")
    if c.fetchone()[0] == 0:
        tranches = [
            {"min": 0, "max": 5000, "taux": 0.0},
            {"min": 5000, "max": 20000, "taux": 26.0},
            {"min": 20000, "max": 30000, "taux": 28.0},
            {"min": 30000, "max": 50000, "taux": 32.0},
            {"min": 50000, "max": 999999999, "taux": 35.0}
        ]
        c.execute("INSERT INTO fiscal_params (tranches_irpp_json, taux_cnss_salarie, taux_cnss_patronal, taux_css, timbre_fiscal, taux_tva_defaut) VALUES (?, 9.18, 16.57, 1.0, 1.000, 7.0)", (json.dumps(tranches),))

    # Tables & Comptoir
    c.execute("SELECT COUNT(*) FROM pos_tables")
    if c.fetchone()[0] == 0:
        tables_data = [
            ("Comptoir 1", "COMPTOIR", 1),
            ("Comptoir 2", "COMPTOIR", 1),
            ("Table 1", "SALLE", 4),
            ("Table 2", "SALLE", 4),
            ("Table 3", "SALLE", 2),
            ("Table 4", "SALLE", 6),
            ("Table 5 (Terrasse)", "TERRASSE", 4),
            ("Table 6 (Terrasse)", "TERRASSE", 4),
            ("Table 7 (Terrasse)", "TERRASSE", 6),
            ("Salon VIP 1", "VIP", 8),
            ("Salon VIP 2", "VIP", 10),
            ("Emporter / Livr", "EMPORTER", 1)
        ]
        c.executemany("INSERT INTO pos_tables (numero_table, zone, capacite, statut, actif) VALUES (?, ?, ?, 'LIBRE', 1)", tables_data)

    # Menu Restaurant & Pâtisserie Très Large (37 articles)
    c.execute("SELECT COUNT(*) FROM pos_menu_items")
    if c.fetchone()[0] == 0:
        menu_data = [
            # ENTRÉES & SALADES
            ("ENTREES", "M-ENT-01", "Salade Méchouia Traditionnelle au Thon", 8.500, 7.0),
            ("ENTREES", "M-ENT-02", "Salade Tunisienne aux Légumes Frais", 6.500, 7.0),
            ("ENTREES", "M-ENT-03", "Brik à l'Œuf & Thon de Mahdia", 4.500, 7.0),
            ("ENTREES", "M-ENT-04", "Brik aux Crevettes Royales", 7.500, 7.0),
            ("ENTREES", "M-ENT-05", "Ojja Traditionnelle Merguez Maison", 14.000, 7.0),
            ("ENTREES", "M-ENT-06", "Ojja Fruits de Mer (Crevettes & Calamars)", 22.000, 7.0),
            ("ENTREES", "M-ENT-07", "Soupe Poissons & Langoustines du Golfe", 12.500, 7.0),

            # PLATS PRINCIPAUX TRADITIONNELS & INTERNATIONAUX
            ("PLATS", "M-PLT-01", "Couscous Royal à l'Agneau de Sidi Bouzid", 28.000, 7.0),
            ("PLATS", "M-PLT-02", "Couscous Poisson Mérou à la Sfaxienne", 34.000, 7.0),
            ("PLATS", "M-PLT-03", "Pâtes Tunisiennes aux Fruits de Mer Épicées", 26.500, 7.0),
            ("PLATS", "M-PLT-04", "Loup de Mer Entier Grillé au Feu de Bois", 32.000, 7.0),
            ("PLATS", "M-PLT-05", "Daurade Royale Grillée & Pommes Vapeur", 29.000, 7.0),
            ("PLATS", "M-PLT-06", "Filet de Bœuf Grillé Sauce Poivre Vert", 38.000, 7.0),
            ("PLATS", "M-PLT-07", "Escalope Cordon Bleu Maison Crème Champignons", 19.500, 7.0),
            ("PLATS", "M-PLT-08", "Kamounia Tunisienne à la Viande Tendre", 18.000, 7.0),

            # PIZZAS & SNACKS
            ("PIZZAS", "M-PIZ-01", "Pizza Margherita Tomate Mozzarella Basilic", 13.500, 7.0),
            ("PIZZAS", "M-PIZ-02", "Pizza Thon & Câpres de Kerkennah", 16.500, 7.0),
            ("PIZZAS", "M-PIZ-03", "Pizza Fruits de Mer & Ail Confit", 24.000, 7.0),
            ("PIZZAS", "M-PIZ-04", "Pizza 4 Fromages Affinés", 19.000, 7.0),

            # BOISSONS & CAFÉ
            ("BOISSONS", "M-BOI-01", "Café Express Lavazza Torréfié", 2.800, 7.0),
            ("BOISSONS", "M-BOI-02", "Café Direct / Capucin Mousseux", 3.200, 7.0),
            ("BOISSONS", "M-BOI-03", "Thé à la Menthe Fraîche & Pignons", 4.500, 7.0),
            ("BOISSONS", "M-BOI-04", "Thé aux Amandes Grillées", 4.000, 7.0),
            ("BOISSONS", "M-BOI-05", "Jus d'Orange Frais Pressé 33cl", 5.500, 7.0),
            ("BOISSONS", "M-BOI-06", "Citronnade Maison aux Amandes", 6.000, 7.0),
            ("BOISSONS", "M-BOI-07", "Eau Minérale Safia 1L", 2.000, 7.0),
            ("BOISSONS", "M-BOI-08", "Soda Gazéifié Canette 24cl", 3.000, 7.0),

            # PÂTISSERIE TUNISIENNE & DESSERTS FINS
            ("PATISSERIE", "M-PAT-01", "Assortiment Baklawa Tunisienne aux Pistaches", 7.500, 7.0),
            ("PATISSERIE", "M-PAT-02", "Kaak Warka Traditionnel Zaghouan", 5.000, 7.0),
            ("PATISSERIE", "M-PAT-03", "Assida Zgougou Crème & Noisettes", 8.000, 7.0),
            ("PATISSERIE", "M-PAT-04", "Mille-Feuille Croustillant Vanille Bourbon", 4.500, 7.0),
            ("PATISSERIE", "M-PAT-05", "Cheesecake Framboise & Spéculoos", 7.000, 7.0),
            ("PATISSERIE", "M-PAT-06", "Fondant au Chocolat Noir Cœur Coulant", 8.500, 7.0),
            ("PATISSERIE", "M-PAT-07", "Corbeille de Makroudh Kairouanais", 4.000, 7.0),
            ("PATISSERIE", "M-PAT-08", "Zrir Tunisien au Sésame & Noisettes", 6.500, 7.0)
        ]
        c.executemany("INSERT INTO pos_menu_items (categorie, code, nom, prix_ttc, taux_tva, actif) VALUES (?, ?, ?, ?, ?, 1)", menu_data)

    conn.commit()
    conn.close()

init_db()

app = FastAPI(title=MODULE_TITLE, version="2026.1")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class LoginReq(BaseModel):
    username: str
    password: str

class LicenseActivateReq(BaseModel):
    license_key: str

class CompanyUpdateReq(BaseModel):
    raison_sociale: str
    matricule_fiscal: str
    registre_commerce: Optional[str] = ""
    adresse: str
    telephone: str
    email: str
    rib: Optional[str] = ""

class FiscalUpdateReq(BaseModel):
    tranches_irpp_json: str
    taux_cnss_salarie: float
    taux_cnss_patronal: float
    taux_css: float
    timbre_fiscal: float
    taux_tva_defaut: float

class MenuItemCreateReq(BaseModel):
    categorie: str
    code: str
    nom: str
    prix_ttc: float
    taux_tva: float = 7.0

class TableCreateReq(BaseModel):
    numero_table: str
    zone: str = "SALLE"
    capacite: int = 4

class CommandeLigne(BaseModel):
    item_id: int
    nom: str
    qte: int
    prix_ttc: float

class CreateCommandeReq(BaseModel):
    table_numero: str
    client_nom: Optional[str] = "Client Comptoir / Table"
    client_mf: Optional[str] = ""
    mode_reglement: str = "ESPECES" # ESPECES, CARTE_BANCAIRE, CHEQUE, TICKET_RESTO
    lignes: List[CommandeLigne]

class ResetReq(BaseModel):
    admin_password: str

@app.post("/api/auth/login")
def login(req: LoginReq):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM utilisateurs WHERE username = ? AND password_hash = ?", (req.username.strip(), hash_pw(req.password.strip())))
    user = c.fetchone()
    conn.close()
    if not user:
        raise HTTPException(status_code=401, detail="Identifiants invalides")
    return {"success": True, "user": {"username": user["username"], "nom": user["nom_complet"], "role": user["role"]}}

@app.get("/api/license/status")
def license_status():
    return {"module": MODULE_CODE, "hardware_id": get_hardware_id(), "active": is_activated()}

@app.post("/api/license/activate")
def license_activate(req: LicenseActivateReq):
    if not verify_license_key(req.license_key):
        raise HTTPException(status_code=400, detail="Clé de licence invalide pour ce poste")
    with open(LICENSE_FILE, "w", encoding="utf-8") as f:
        f.write(req.license_key.strip())
    return {"status": "ACTIVATED", "hardware_id": get_hardware_id()}

@app.get("/api/company")
def get_company():
    conn = get_db()
    row = conn.execute("SELECT * FROM societe_config LIMIT 1").fetchone()
    conn.close()
    return dict(row) if row else {}

@app.put("/api/company")
def update_company(req: CompanyUpdateReq):
    conn = get_db()
    conn.execute("""
        UPDATE societe_config SET raison_sociale = ?, matricule_fiscal = ?, registre_commerce = ?,
        adresse = ?, telephone = ?, email = ?, rib = ? WHERE id = (SELECT id FROM societe_config LIMIT 1)
    """, (req.raison_sociale, req.matricule_fiscal, req.registre_commerce, req.adresse, req.telephone, req.email, req.rib))
    conn.commit()
    conn.close()
    return {"success": True}

@app.get("/api/fiscal-params")
def get_fiscal():
    conn = get_db()
    row = conn.execute("SELECT * FROM fiscal_params LIMIT 1").fetchone()
    conn.close()
    return dict(row) if row else {}

@app.put("/api/fiscal-params")
def update_fiscal(req: FiscalUpdateReq):
    conn = get_db()
    conn.execute("""
        UPDATE fiscal_params SET tranches_irpp_json = ?, taux_cnss_salarie = ?, taux_cnss_patronal = ?,
        taux_css = ?, timbre_fiscal = ?, taux_tva_defaut = ? WHERE id = (SELECT id FROM fiscal_params LIMIT 1)
    """, (req.tranches_irpp_json, req.taux_cnss_salarie, req.taux_cnss_patronal, req.taux_css, req.timbre_fiscal, req.taux_tva_defaut))
    conn.commit()
    conn.close()
    return {"success": True}

# --- GESTION TABLES & COMPTOIR ---
@app.get("/api/pos/tables")
def list_tables():
    conn = get_db()
    rows = conn.execute("SELECT * FROM pos_tables WHERE actif = 1 ORDER BY id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/pos/tables")
def add_table(req: TableCreateReq):
    conn = get_db()
    try:
        conn.execute("INSERT INTO pos_tables (numero_table, zone, capacite, statut, actif) VALUES (?, ?, ?, 'LIBRE', 1)",
                     (req.numero_table.strip(), req.zone.strip().upper(), req.capacite))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce nom ou numéro de table existe déjà")
    conn.close()
    return {"success": True}

@app.delete("/api/pos/tables/{id}")
def delete_table(id: int):
    conn = get_db()
    conn.execute("UPDATE pos_tables SET actif = 0 WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return {"success": True}

# --- MENU & CARTE DU RESTAURANT / PÂTISSERIE (AJOUT, MODIF, SUPPR) ---
@app.get("/api/pos/menu")
def list_menu():
    conn = get_db()
    rows = conn.execute("SELECT * FROM pos_menu_items WHERE actif = 1 ORDER BY categorie ASC, id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/pos/menu")
def add_menu_item(req: MenuItemCreateReq):
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO pos_menu_items (categorie, code, nom, prix_ttc, taux_tva, actif)
            VALUES (?, ?, ?, ?, ?, 1)
        """, (req.categorie.strip().upper(), req.code.strip().upper(), req.nom.strip(), req.prix_ttc, req.taux_tva))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce code article existe déjà")
    conn.close()
    return {"success": True}

@app.put("/api/pos/menu/{id}")
def update_menu_item(id: int, req: MenuItemCreateReq):
    conn = get_db()
    conn.execute("""
        UPDATE pos_menu_items SET categorie = ?, code = ?, nom = ?, prix_ttc = ?, taux_tva = ?
        WHERE id = ?
    """, (req.categorie.strip().upper(), req.code.strip().upper(), req.nom.strip(), req.prix_ttc, req.taux_tva, id))
    conn.commit()
    conn.close()
    return {"success": True}

@app.delete("/api/pos/menu/{id}")
def delete_menu_item(id: int):
    conn = get_db()
    conn.execute("UPDATE pos_menu_items SET actif = 0 WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return {"success": True}

# --- COMMANDES, ENCAISSEMENT & AVOIRS POS ---
@app.get("/api/pos/commandes")
def list_commandes():
    conn = get_db()
    rows = conn.execute("SELECT * FROM pos_commandes ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/pos/commandes")
def create_commande(req: CreateCommandeReq):
    if not req.lignes:
        raise HTTPException(status_code=400, detail="Veuillez sélectionner au moins un article")
    conn = get_db()
    c = conn.cursor()
    
    count = c.execute("SELECT COUNT(*) FROM pos_commandes").fetchone()[0] + 1
    num_ticket = f"TCK-2026-{count:04d}"
    today_str = date.today().isoformat()
    
    tot_ttc = sum(l.prix_ttc * l.qte for l in req.lignes)
    # Calcul TVA 7%
    tot_ht = round(tot_ttc / 1.07, 3)
    tot_tva = round(tot_ttc - tot_ht, 3)
    
    c.execute("""
        INSERT INTO pos_commandes (
            numero_ticket, date_commande, type_piece, table_numero, client_nom, client_mf,
            lignes_json, total_ht, total_tva, timbre_fiscal, total_ttc, mode_reglement, statut
        ) VALUES (?, ?, 'TICKET', ?, ?, ?, ?, ?, ?, 0.0, ?, ?, 'PAYE')
    """, (num_ticket, today_str, req.table_numero, req.client_nom, req.client_mf,
          json.dumps([l.dict() for l in req.lignes]), tot_ht, tot_tva, tot_ttc, req.mode_reglement))
    
    # Écritures comptables SCE NC 01 : Caisse 541 / Ventes Restauration 707 & TVA 4367
    ecritures = [
        (today_str, "CA", num_ticket, "541100", "Caisse Principale Restaurant", f"Ticket {num_ticket} {req.table_numero}", tot_ttc, 0),
        (today_str, "CA", num_ticket, "707000", "Ventes Restauration & Pâtisserie", "Recettes Journée HT", 0, tot_ht),
        (today_str, "CA", num_ticket, "436710", "TVA Collectée Restauration (7%)", "TVA sur Ventes Caisse", 0, tot_tva)
    ]
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    conn.commit()
    conn.close()
    return {"success": True, "numero_ticket": num_ticket, "total_ttc": tot_ttc}

@app.post("/api/pos/commandes/{id}/avoir")
def emettre_avoir_ticket(id: int):
    conn = get_db()
    c = conn.cursor()
    tck = c.execute("SELECT * FROM pos_commandes WHERE id = ?", (id,)).fetchone()
    if not tck:
        conn.close()
        raise HTTPException(status_code=404, detail="Ticket introuvable")
    
    count_av = c.execute("SELECT COUNT(*) FROM pos_commandes WHERE type_piece = 'AVOIR'").fetchone()[0] + 1
    num_av = f"AV-TCK-2026-{count_av:04d}"
    today_str = date.today().isoformat()
    
    c.execute("""
        INSERT INTO pos_commandes (
            numero_ticket, date_commande, type_piece, reference_origine, table_numero, client_nom, client_mf,
            lignes_json, total_ht, total_tva, timbre_fiscal, total_ttc, mode_reglement, statut
        ) VALUES (?, ?, 'AVOIR', ?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?, 'ANNULE_AVOIR')
    """, (num_av, today_str, tck["numero_ticket"], tck["table_numero"], tck["client_nom"], tck["client_mf"],
          tck["lignes_json"], -tck["total_ht"], -tck["total_tva"], -tck["total_ttc"], tck["mode_reglement"]))
    
    # Extourne caisse
    ecritures_extourne = [
        (today_str, "CA", num_av, "707000", "Ventes Restauration & Pâtisserie", f"Annulation Recette {num_av}", tck["total_ht"], 0),
        (today_str, "CA", num_av, "436710", "TVA Collectée Restauration (7%)", f"Annulation TVA {num_av}", tck["total_tva"], 0),
        (today_str, "CA", num_av, "541100", "Caisse Principale Restaurant", f"Remboursement Caisse {num_av}", 0, tck["total_ttc"])
    ]
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures_extourne)
    conn.commit()
    conn.close()
    return {"success": True, "numero_avoir": num_av}

@app.post("/api/admin/reset")
def reset_operational_data(req: ResetReq):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id FROM utilisateurs WHERE role='ADMIN' AND password_hash = ?", (hash_pw(req.admin_password.strip()),))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=403, detail="Mot de passe Administrateur incorrect")
    
    c.execute("DELETE FROM pos_commandes")
    c.execute("DELETE FROM ecritures_comptables")
    conn.commit()
    conn.close()
    return {"success": True, "message": "Tickets de caisse et écritures comptables remis à zéro"}

# --- GESTION DES UTILISATEURS (ADMIN ONLY) ---
class UserCreateReq(BaseModel):
    username: str
    password: str
    nom_complet: str
    role: str = "COMMERCIAL"

@app.get("/api/users")
def list_users():
    conn = get_db()
    rows = conn.execute("SELECT id, username, nom_complet, role FROM utilisateurs ORDER BY id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/users")
def add_user(req: UserCreateReq):
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO utilisateurs (username, password_hash, nom_complet, role)
            VALUES (?, ?, ?, ?)
        """, (req.username.strip().lower(), hash_pw(req.password.strip()), req.nom_complet.strip(), req.role.strip().upper()))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce nom d'utilisateur existe déjà")
    conn.close()
    return {"success": True}

@app.delete("/api/users/{user_id}")
def delete_user(user_id: int):
    conn = get_db()
    row = conn.execute("SELECT username, role FROM utilisateurs WHERE id = ?", (user_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if row["username"] == "admin" or row["role"] == "ADMIN":
        admin_count = conn.execute("SELECT COUNT(*) FROM utilisateurs WHERE role = 'ADMIN' AND id != ?", (user_id,)).fetchone()[0]
        if admin_count == 0:
            conn.close()
            raise HTTPException(status_code=400, detail="Impossible de supprimer le compte administrateur principal")
    conn.execute("DELETE FROM utilisateurs WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return {"success": True}

@app.get("/safe-logo.png")
def serve_logo():
    base_p = getattr(sys, '_MEIPASS', os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    logo_file = os.path.join(base_p, "web_dist", "safe-logo.png")
    if not os.path.exists(logo_file):
        logo_file = os.path.join(os.path.dirname(__file__), "safe-logo.png")
    return FileResponse(logo_file, media_type="image/png")

@app.get("/", response_class=HTMLResponse)
def serve_ui():
    base_p = getattr(sys, '_MEIPASS', os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    html_file = os.path.join(base_p, "web_dist", "index.html")
    with open(html_file, "r", encoding="utf-8") as f:
        return f.read()

if __name__ == "__main__":
    hw_id = get_hardware_id()
    print("=" * 70)
    print(f" {MODULE_TITLE} (STANDALONE)")
    print(f" Port Local           : {PORT}")
    print(f" Verrou Hardware ID   : {hw_id}")
    print(f" Cryptographie        : HMAC-SHA256")
    print(f" Normes Fiscales      : TND (3 déc.) | TVA 7% | SCE NC 01")
    print("=" * 70)
    threading.Timer(1.5, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
