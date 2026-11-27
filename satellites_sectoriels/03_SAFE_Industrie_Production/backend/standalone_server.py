# -*- coding: utf-8 -*-
"""
SAFE ERP - MODULE 03 : INDUSTRIE & PRODUCTION (TUNISIE) - STANDALONE PORT 8003
Articles produits finis à fabriquer, dépôts, ordres de fabrication, valorisation stocks (SCE NC 01)
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

MODULE_CODE = "INDUSTRIE"
MODULE_TITLE = "SAFE Industrie & Production"
PORT = 8003
SECRET_SALT = b"SAFE_ERP_TUNISIE_2026_MASTER_HMAC_KEY_#991"

prog_data = os.environ.get("PROGRAMDATA", os.path.expanduser("~"))
DATA_DIR = os.path.join(prog_data, "SAFE_ERP_Tunisie", "03_SAFE_Industrie_Production")
os.makedirs(DATA_DIR, exist_ok=True)
LICENSE_FILE = os.path.join(DATA_DIR, "license.dat")
DB_PATH = os.path.join(DATA_DIR, "safe_industrie_local.db")

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
            role TEXT NOT NULL DEFAULT 'CHEF_ATELIER'
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
            taux_tva_defaut REAL DEFAULT 19.0
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS industrie_depots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            libelle TEXT NOT NULL,
            type_stock TEXT NOT NULL DEFAULT 'PRODUITS_FINIS',
            adresse TEXT,
            responsable TEXT,
            actif INTEGER DEFAULT 1
        )
    """)
    
        # Matières Premières / Composants Usine (EXIGENCE 6)
    c.execute("""
        CREATE TABLE IF NOT EXISTS industrie_matieres_premieres (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            designation TEXT NOT NULL,
            famille TEXT DEFAULT 'Composants Usine',
            unite TEXT DEFAULT 'KG',
            cout_achat_ht REAL DEFAULT 0,
            stock_actuel REAL DEFAULT 0,
            depot_nom TEXT DEFAULT 'Magasin Matières'
        )
    """)
    c.execute("SELECT COUNT(*) FROM industrie_matieres_premieres")
    if c.fetchone()[0] == 0:
        c.executemany("""
            INSERT INTO industrie_matieres_premieres (code, designation, famille, unite, cout_achat_ht, stock_actuel, depot_nom)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, [
            ("MP-ACIER-01", "Tôle Acier Galvanisé 2mm", "Métallurgie", "FEUILLE", 45.0, 350.0, "Magasin Matières"),
            ("MP-VIS-M8", "Boulons Haute Résistance M8x40", "Visserie", "PIECE", 0.35, 5000.0, "Magasin Visserie"),
            ("MP-PEINT-GRIS", "Peinture Époxy Poudre Grise", "Revêtement", "KG", 18.5, 120.0, "Atelier Finition")
        ])

    c.execute("""
        CREATE TABLE IF NOT EXISTS industrie_produits_finis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference TEXT UNIQUE NOT NULL,
            designation TEXT NOT NULL,
            gamme TEXT NOT NULL,
            cout_revient_estime REAL NOT NULL DEFAULT 0,
            prix_vente_ht REAL NOT NULL DEFAULT 0,
            stock_actuel REAL NOT NULL DEFAULT 0,
            depot_id INTEGER,
            FOREIGN KEY (depot_id) REFERENCES industrie_depots(id)
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS industrie_ordres_fabrication (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero_of TEXT UNIQUE NOT NULL,
            date_lancement TEXT NOT NULL,
            type_piece TEXT DEFAULT 'ORDRE_FABRICATION',
            reference_origine TEXT,
            produit_ref TEXT NOT NULL,
            produit_nom TEXT NOT NULL,
            quantite_a_fabriquer REAL NOT NULL,
            cout_matiere_ht REAL NOT NULL DEFAULT 0,
            cout_mo_ht REAL NOT NULL DEFAULT 0,
            cout_total_ht REAL NOT NULL DEFAULT 0,
            depot_destination TEXT,
            statut TEXT DEFAULT 'TERMINE_EN_STOCK'
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
            ("admin", hash_pw("admin2026"), "Directeur Industriel", "ADMIN"),
            ("atelier", hash_pw("atel2026"), "Chef d'Atelier Production", "CHEF_ATELIER")
        ])
        
    c.execute("SELECT COUNT(*) FROM societe_config")
    if c.fetchone()[0] == 0:
        c.execute("""
            INSERT INTO societe_config (raison_sociale, matricule_fiscal, registre_commerce, adresse, telephone, email, rib, devise)
            VALUES ('Société Industrielle Mécanique & Plastique Tunisienne - SIMPT SA', '1184950/K/A/000', 'B164822026', 'Zone Industrielle Ben Arous, 2013 Tunis', '+216 71 385 400', 'direction@simpt-industrie.tn', 'BNA 03 004 0001234567890 33', 'TND')
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
        c.execute("INSERT INTO fiscal_params (tranches_irpp_json, taux_cnss_salarie, taux_cnss_patronal, taux_css, timbre_fiscal, taux_tva_defaut) VALUES (?, 9.18, 16.57, 1.0, 1.000, 19.0)", (json.dumps(tranches),))

    c.execute("SELECT COUNT(*) FROM industrie_depots")
    if c.fetchone()[0] == 0:
        c.executemany("INSERT INTO industrie_depots (code, libelle, type_stock, adresse, responsable, actif) VALUES (?, ?, ?, ?, ?, 1)", [
            ("DEP-PF-01", "Magasin Produits Finis Usine", "PRODUITS_FINIS", "Atelier Principal Ben Arous", "M. Foued Cherif"),
            ("DEP-MP-01", "Dépôt Matières Premières & Granulés", "MATIERES_PREMIERES", "Bâtiment Logistique Nord", "M. Adel Ben Mansour"),
            ("DEP-PIECES", "Magasin Composants & Quincaillerie", "COMPOSANTS", "Zone Outillage", "Mme. Fatma Zribi")
        ])

    c.execute("SELECT COUNT(*) FROM industrie_produits_finis")
    if c.fetchone()[0] == 0:
        c.executemany("INSERT INTO industrie_produits_finis (reference, designation, gamme, cout_revient_estime, prix_vente_ht, stock_actuel, depot_id) VALUES (?, ?, ?, ?, ?, ?, ?)", [
            ("PF-INJ-001", "Boîtier Électrique Étanche IP65 Polycarbonate", "Injection Plastique", 14.800, 24.500, 350, 1),
            ("PF-INJ-002", "Caisse Palette Plastique Renforcée 120x80", "Manutention", 62.000, 95.000, 80, 1),
            ("PF-MEC-001", "Raccord Haute Pression Inox Usiné 3/4", "Usinage CNC", 28.500, 46.000, 120, 1),
            ("PF-MEC-002", "Plaque Châssis Support Moteur Découpée Laser", "Tôlerie & Découpe", 45.000, 72.000, 45, 1)
        ])

    c.execute("SELECT COUNT(*) FROM industrie_ordres_fabrication")
    if c.fetchone()[0] == 0:
        c.execute("""
            INSERT INTO industrie_ordres_fabrication (numero_of, date_lancement, type_piece, reference_origine, produit_ref, produit_nom, quantite_a_fabriquer, cout_matiere_ht, cout_mo_ht, cout_total_ht, depot_destination, statut)
            VALUES ('OF-2026-0001', '2026-11-19', 'ORDRE_FABRICATION', NULL, 'PF-INJ-001', 'Boîtier Électrique Étanche IP65 Polycarbonate', 100, 950.000, 530.000, 1480.000, 'Magasin Produits Finis Usine', 'TERMINE_EN_STOCK')
        """)

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

class DepotCreateReq(BaseModel):
    code: str
    libelle: str
    type_stock: str = "PRODUITS_FINIS"
    adresse: Optional[str] = ""
    responsable: Optional[str] = ""

class ProduitFiniCreateReq(BaseModel):
    reference: str
    designation: str
    gamme: str
    cout_revient_estime: float
    prix_vente_ht: float
    stock_actuel: float = 0.0
    depot_id: int = 1

class OfCreateReq(BaseModel):
    produit_ref: str
    quantite: float
    cout_matiere: float
    cout_mo: float

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

@app.get("/api/depots")
def list_depots():
    conn = get_db()
    rows = conn.execute("SELECT * FROM industrie_depots WHERE actif = 1 ORDER BY id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/depots")
def add_depot(req: DepotCreateReq):
    conn = get_db()
    try:
        conn.execute("INSERT INTO industrie_depots (code, libelle, type_stock, adresse, responsable, actif) VALUES (?, ?, ?, ?, ?, 1)",
                     (req.code.strip().upper(), req.libelle.strip(), req.type_stock, req.adresse, req.responsable))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce code dépôt existe déjà")
    conn.close()
    return {"success": True}

@app.delete("/api/depots/{depot_id}")
def delete_depot(depot_id: int):
    conn = get_db()
    conn.execute("UPDATE industrie_depots SET actif = 0 WHERE id = ?", (depot_id,))
    conn.commit()
    conn.close()
    return {"success": True}

# --- PRODUITS FINIS À FABRIQUER ---
# --- ROUTES MATIÈRES PREMIÈRES / COMPOSANTS (EXIGENCE 6) ---
class MatierePremiereCreateReq(BaseModel):
    code: str
    designation: str
    famille: str = "Composants Usine"
    unite: str = "KG"
    cout_achat_ht: float = 0.0
    stock_actuel: float = 0.0
    depot_nom: str = "Magasin Matières"

@app.get("/api/matieres-premieres")
def list_matieres():
    conn = get_db()
    rows = conn.execute("SELECT * FROM industrie_matieres_premieres ORDER BY id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/matieres-premieres")
def add_matiere(req: MatierePremiereCreateReq):
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO industrie_matieres_premieres (code, designation, famille, unite, cout_achat_ht, stock_actuel, depot_nom)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (req.code.strip().upper(), req.designation.strip(), req.famille.strip(), req.unite.strip(), req.cout_achat_ht, req.stock_actuel, req.depot_nom.strip()))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce code matière première existe déjà")
    conn.close()
    return {"success": True}

@app.delete("/api/matieres-premieres/{mat_id}")
def delete_matiere(mat_id: int):
    conn = get_db()
    conn.execute("DELETE FROM industrie_matieres_premieres WHERE id = ?", (mat_id,))
    conn.commit()
    conn.close()
    return {"success": True}

@app.get("/api/produits-finis")
def list_produits_finis():
    conn = get_db()
    rows = conn.execute("""
        SELECT pf.*, d.libelle as depot_nom
        FROM industrie_produits_finis pf
        LEFT JOIN industrie_depots d ON pf.depot_id = d.id
        ORDER BY pf.id DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/produits-finis")
def add_produit_fini(req: ProduitFiniCreateReq):
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO industrie_produits_finis (reference, designation, gamme, cout_revient_estime, prix_vente_ht, stock_actuel, depot_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (req.reference.strip().upper(), req.designation.strip(), req.gamme.strip(), req.cout_revient_estime, req.prix_vente_ht, req.stock_actuel, req.depot_id))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Cette référence produit existe déjà")
    conn.close()
    return {"success": True}

@app.delete("/api/produits-finis/{id}")
def delete_produit_fini(id: int):
    conn = get_db()
    conn.execute("DELETE FROM industrie_produits_finis WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return {"success": True}

# --- ORDRES DE FABRICATION (OF) ---
@app.get("/api/ordres-fabrication")
def list_of():
    conn = get_db()
    rows = conn.execute("SELECT * FROM industrie_ordres_fabrication ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/ordres-fabrication")
def create_of(req: OfCreateReq):
    conn = get_db()
    c = conn.cursor()
    pf = c.execute("SELECT * FROM industrie_produits_finis WHERE reference = ?", (req.produit_ref,)).fetchone()
    if not pf:
        conn.close()
        raise HTTPException(status_code=404, detail="Produit fini introuvable")
    
    count = c.execute("SELECT COUNT(*) FROM industrie_ordres_fabrication").fetchone()[0] + 1
    num_of = f"OF-2026-{count:04d}"
    today_str = date.today().isoformat()
    cout_total = req.cout_matiere + req.cout_mo
    
    # Entrée en stock des produits finis fabriqués
    c.execute("UPDATE industrie_produits_finis SET stock_actuel = stock_actuel + ? WHERE reference = ?", (req.quantite, req.produit_ref))
    
    c.execute("""
        INSERT INTO industrie_ordres_fabrication (
            numero_of, date_lancement, type_piece, produit_ref, produit_nom,
            quantite_a_fabriquer, cout_matiere_ht, cout_mo_ht, cout_total_ht,
            depot_destination, statut
        ) VALUES (?, ?, 'ORDRE_FABRICATION', ?, ?, ?, ?, ?, ?, 'Magasin Produits Finis Usine', 'TERMINE_EN_STOCK')
    """, (num_of, today_str, pf["reference"], pf["designation"], req.quantite, req.cout_matiere, req.cout_mo, cout_total))
    
    # Écritures SCE NC 01 : Débit 355000 (Stocks de Produits Finis) / Crédit 713500 (Variation des Stocks de Produits)
    ecritures = [
        (today_str, "PR", num_of, "355000", "Stocks de Produits Finis", f"Production {req.quantite}x {pf['reference']}", cout_total, 0),
        (today_str, "PR", num_of, "713500", "Variation des Stocks de Produits", "Production Stockée Réelle", 0, cout_total)
    ]
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    conn.commit()
    conn.close()
    return {"success": True, "numero_of": num_of, "cout_total_ht": cout_total}

@app.post("/api/ordres-fabrication/{id}/avoir")
def emettre_avoir_of(id: int):
    conn = get_db()
    c = conn.cursor()
    of_row = c.execute("SELECT * FROM industrie_ordres_fabrication WHERE id = ?", (id,)).fetchone()
    if not of_row:
        conn.close()
        raise HTTPException(status_code=404, detail="OF introuvable")
    
    count_av = c.execute("SELECT COUNT(*) FROM industrie_ordres_fabrication WHERE type_piece = 'AVOIR'").fetchone()[0] + 1
    num_av = f"AV-OF-2026-{count_av:04d}"
    today_str = date.today().isoformat()
    
    # Décrémentation du stock
    c.execute("UPDATE industrie_produits_finis SET stock_actuel = stock_actuel - ? WHERE reference = ?", (of_row["quantite_a_fabriquer"], of_row["produit_ref"]))
    
    c.execute("""
        INSERT INTO industrie_ordres_fabrication (
            numero_of, date_lancement, type_piece, reference_origine, produit_ref, produit_nom,
            quantite_a_fabriquer, cout_matiere_ht, cout_mo_ht, cout_total_ht, depot_destination, statut
        ) VALUES (?, ?, 'AVOIR', ?, ?, ?, ?, ?, ?, ?, ?, 'ANNULATION_AVOIR')
    """, (num_av, today_str, of_row["numero_of"], of_row["produit_ref"], of_row["produit_nom"],
          -of_row["quantite_a_fabriquer"], -of_row["cout_matiere_ht"], -of_row["cout_mo_ht"], -of_row["cout_total_ht"], of_row["depot_destination"]))
    
    # Extourne comptable
    ecritures_extourne = [
        (today_str, "OD", num_av, "713500", "Variation des Stocks de Produits", f"Annulation OF {num_av}", of_row["cout_total_ht"], 0),
        (today_str, "OD", num_av, "355000", "Stocks de Produits Finis", f"Déstockage Annulation {num_av}", 0, of_row["cout_total_ht"])
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
    
    c.execute("DELETE FROM industrie_ordres_fabrication")
    c.execute("DELETE FROM ecritures_comptables")
    c.execute("UPDATE industrie_produits_finis SET stock_actuel = 0")
    conn.commit()
    conn.close()
    return {"success": True, "message": "Mouvements de production et écritures comptables remis à zéro"}

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
    print(f" Normes Fiscales      : TND (3 déc.) | SCE NC 01")
    print("=" * 70)
    threading.Timer(1.5, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
