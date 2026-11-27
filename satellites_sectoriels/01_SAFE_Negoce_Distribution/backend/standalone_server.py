# -*- coding: utf-8 -*-
"""
SAFE ERP - MODULE 01 : NÉGOCE & DISTRIBUTION (TUNISIE) - STANDALONE PORT 8001
Conforme SCE NC 01, TVA 19/13/7%, Droit de timbre 1.000 DT, Verrou matériel Hardware ID & HMAC-SHA256
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

MODULE_CODE = "NEGOCE"
MODULE_TITLE = "SAFE Négoce & Distribution"
PORT = 8001
SECRET_SALT = b"SAFE_ERP_TUNISIE_2026_MASTER_HMAC_KEY_#991"

prog_data = os.environ.get("PROGRAMDATA", os.path.expanduser("~"))
DATA_DIR = os.path.join(prog_data, "SAFE_ERP_Tunisie", "01_SAFE_Negoce_Distribution")
os.makedirs(DATA_DIR, exist_ok=True)
LICENSE_FILE = os.path.join(DATA_DIR, "license.dat")
DB_PATH = os.path.join(DATA_DIR, "safe_negoce_local.db")

# --- LICENCE & HARDWARE ID ---
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

# --- BASE DE DONNÉES ---
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_pw(pw: str) -> str:
    return hashlib.sha256(pw.encode("utf-8")).hexdigest()

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    # Utilisateurs
    c.execute("""
        CREATE TABLE IF NOT EXISTS utilisateurs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            nom_complet TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'COMMERCIAL'
        )
    """)
    
    # Societe config
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
    
    # Paramètres Fiscaux Modifiables
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
    
    # Dépôts Négoce
    c.execute("""
        CREATE TABLE IF NOT EXISTS negoce_depots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            libelle TEXT NOT NULL,
            adresse TEXT,
            responsable TEXT,
            actif INTEGER DEFAULT 1
        )
    """)
    
    # Articles Négoce
    c.execute("""
        CREATE TABLE IF NOT EXISTS negoce_articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            designation TEXT NOT NULL,
            famille TEXT NOT NULL,
            prix_achat_ht REAL NOT NULL DEFAULT 0,
            prix_vente_ht REAL NOT NULL DEFAULT 0,
            taux_tva REAL NOT NULL DEFAULT 19.0,
            stock_actuel REAL NOT NULL DEFAULT 0,
            depot_id INTEGER,
            FOREIGN KEY (depot_id) REFERENCES negoce_depots(id)
        )
    """)
    
    # Factures Négoce
    c.execute("""
        CREATE TABLE IF NOT EXISTS negoce_factures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero_facture TEXT UNIQUE NOT NULL,
            date_facture TEXT NOT NULL,
            type_piece TEXT DEFAULT 'FACTURE',
            reference_origine TEXT,
            client_nom TEXT NOT NULL,
            client_mf TEXT,
            details_json TEXT,
            total_ht REAL NOT NULL DEFAULT 0,
            total_tva REAL NOT NULL DEFAULT 0,
            timbre_fiscal REAL NOT NULL DEFAULT 1.000,
            total_ttc REAL NOT NULL DEFAULT 0,
            statut TEXT DEFAULT 'VALIDE',
            est_comptabilise INTEGER DEFAULT 0,
            est_valide INTEGER DEFAULT 1
        )
    """)
    
    # Écritures Comptables SCE NC 01
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
    
    # Données par défaut
    c.execute("SELECT COUNT(*) FROM utilisateurs")
    if c.fetchone()[0] == 0:
        c.executemany("INSERT INTO utilisateurs (username, password_hash, nom_complet, role) VALUES (?, ?, ?, ?)", [
            ("admin", hash_pw("admin2026"), "Administrateur Négoce", "ADMIN"),
            ("commercial", hash_pw("comm2026"), "Responsable Commercial", "COMMERCIAL")
        ])
        
    c.execute("SELECT COUNT(*) FROM societe_config")
    if c.fetchone()[0] == 0:
        c.execute("""
            INSERT INTO societe_config (raison_sociale, matricule_fiscal, registre_commerce, adresse, telephone, email, rib, devise)
            VALUES ('Comptoir Général de Distribution Tunisien - CGDT SARL', '1359874/P/A/000', 'B142582026', 'Zone Industrielle Charguia II, 2035 Tunis', '+216 71 800 900', 'direction@cgdt-negoce.tn', 'BIAT 08 001 0001234567890 45', 'TND')
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

    c.execute("SELECT COUNT(*) FROM negoce_depots")
    if c.fetchone()[0] == 0:
        c.executemany("INSERT INTO negoce_depots (code, libelle, adresse, responsable, actif) VALUES (?, ?, ?, ?, 1)", [
            ("DEP-01", "Dépôt Central Charguia", "Zone Industrielle Charguia II", "M. Hassen Trabelsi"),
            ("DEP-02", "Dépôt Régional Sousse", "Zone Portuaire Sousse", "M. Karim Ben Amor"),
            ("DEP-03", "Dépôt Sud Sfax", "Route de Gabès Km 3 Sfax", "M. Nizar Mezghani")
        ])
        
    c.execute("SELECT COUNT(*) FROM negoce_articles")
    if c.fetchone()[0] == 0:
        c.executemany("INSERT INTO negoce_articles (code, designation, famille, prix_achat_ht, prix_vente_ht, taux_tva, stock_actuel, depot_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
            ("ART-ELEC-001", "Câble Cuivre Industriel 3x2.5mm (Rouleau 100m)", "Électricité", 120.000, 165.000, 19.0, 85, 1),
            ("ART-ELEC-002", "Disjoncteur Modulaire 16A Schneider", "Électricité", 14.500, 22.800, 19.0, 240, 1),
            ("ART-PLOM-001", "Tube Multicouche Tube D20 (Barre 4m)", "Plomberie & Chauffage", 18.000, 26.500, 19.0, 150, 2),
            ("ART-OUTI-001", "Perforateur SDS Plus 800W Bosch Pro", "Outillage", 320.000, 445.000, 19.0, 28, 1),
            ("ART-PEIN-001", "Peinture Vinyle Blanche Mat 25kg Astral", "Peinture & Droguerie", 85.000, 118.000, 19.0, 60, 3)
        ])
        
    conn.commit()
    conn.close()

init_db()

# --- APPLICATION FASTAPI ---
app = FastAPI(title=MODULE_TITLE, version="2026.1")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- MODÈLES PYDANTIC ---
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
    adresse: Optional[str] = ""
    responsable: Optional[str] = ""

class ArticleCreateReq(BaseModel):
    code: str
    designation: str
    famille: str
    prix_achat_ht: float
    prix_vente_ht: float
    taux_tva: float = 19.0
    stock_actuel: float = 0.0
    depot_id: int = 1

class FactureActionReq(BaseModel):
    client_nom: str
    client_mf: Optional[str] = ""
    lignes: List[Dict[str, Any]] # [{article_id, code, designation, qte, prix_ht, taux_tva}]

class ResetReq(BaseModel):
    admin_password: str

# --- ROUTES AUTH & LICENCE ---
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
    hw_id = get_hardware_id()
    active = is_activated()
    return {"module": MODULE_CODE, "hardware_id": hw_id, "active": active}

@app.post("/api/license/activate")
def license_activate(req: LicenseActivateReq):
    if not verify_license_key(req.license_key):
        raise HTTPException(status_code=400, detail="Clé de licence invalide ou expirée pour ce poste")
    with open(LICENSE_FILE, "w", encoding="utf-8") as f:
        f.write(req.license_key.strip())
    return {"status": "ACTIVATED", "hardware_id": get_hardware_id()}

# --- ROUTES SOCIÉTÉ & FISCALITÉ ---
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
        UPDATE societe_config SET
            raison_sociale = ?, matricule_fiscal = ?, registre_commerce = ?,
            adresse = ?, telephone = ?, email = ?, rib = ?
        WHERE id = (SELECT id FROM societe_config LIMIT 1)
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
        UPDATE fiscal_params SET
            tranches_irpp_json = ?, taux_cnss_salarie = ?, taux_cnss_patronal = ?,
            taux_css = ?, timbre_fiscal = ?, taux_tva_defaut = ?
        WHERE id = (SELECT id FROM fiscal_params LIMIT 1)
    """, (req.tranches_irpp_json, req.taux_cnss_salarie, req.taux_cnss_patronal, req.taux_css, req.timbre_fiscal, req.taux_tva_defaut))
    conn.commit()
    conn.close()
    return {"success": True}

# --- ROUTES DÉPÔTS ---
@app.get("/api/depots")
def list_depots():
    conn = get_db()
    rows = conn.execute("SELECT * FROM negoce_depots WHERE actif = 1 ORDER BY id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/depots")
def add_depot(req: DepotCreateReq):
    conn = get_db()
    try:
        conn.execute("INSERT INTO negoce_depots (code, libelle, adresse, responsable, actif) VALUES (?, ?, ?, ?, 1)",
                     (req.code.strip().upper(), req.libelle.strip(), req.adresse, req.responsable))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce code dépôt existe déjà")
    conn.close()
    return {"success": True}

@app.delete("/api/depots/{depot_id}")
def delete_depot(depot_id: int):
    conn = get_db()
    conn.execute("UPDATE negoce_depots SET actif = 0 WHERE id = ?", (depot_id,))
    conn.commit()
    conn.close()
    return {"success": True}

# --- ROUTES ARTICLES ---
@app.get("/api/articles")
def list_articles():
    conn = get_db()
    rows = conn.execute("""
        SELECT a.*, d.libelle as depot_nom
        FROM negoce_articles a
        LEFT JOIN negoce_depots d ON a.depot_id = d.id
        ORDER BY a.id DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/articles")
def add_article(req: ArticleCreateReq):
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO negoce_articles (code, designation, famille, prix_achat_ht, prix_vente_ht, taux_tva, stock_actuel, depot_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (req.code.strip().upper(), req.designation.strip(), req.famille.strip(), req.prix_achat_ht, req.prix_vente_ht, req.taux_tva, req.stock_actuel, req.depot_id))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce code article existe déjà")
    conn.close()
    return {"success": True}

@app.delete("/api/articles/{article_id}")
def delete_article(article_id: int):
    conn = get_db()
    conn.execute("DELETE FROM negoce_articles WHERE id = ?", (article_id,))
    conn.commit()
    conn.close()
    return {"success": True}

# --- FACTURATION (2 BOUTONS : COMPTABILISATION & VALIDATION SÉPARÉES) ---
@app.get("/api/factures")
def list_factures():
    conn = get_db()
    rows = conn.execute("SELECT * FROM negoce_factures ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def _calc_totals(lignes):
    tot_ht = 0.0
    tot_tva = 0.0
    for l in lignes:
        qte = float(l.get("qte", 1))
        pu = float(l.get("prix_ht", 0))
        tva_rate = float(l.get("taux_tva", 19.0))
        ht = round(qte * pu, 3)
        tva = round(ht * (tva_rate / 100.0), 3)
        tot_ht += ht
        tot_tva += tva
    timbre = 1.000
    ttc = round(tot_ht + tot_tva + timbre, 3)
    return round(tot_ht, 3), round(tot_tva, 3), timbre, ttc

@app.post("/api/factures/comptabiliser")
def action_comptabiliser(req: FactureActionReq):
    """ACTION 1 : Génère uniquement l'écriture comptable d'engagement sans valider définitivement la sortie physique de stock."""
    if not req.lignes:
        raise HTTPException(status_code=400, detail="Veuillez ajouter au moins une ligne d'article")
    conn = get_db()
    c = conn.cursor()
    
    count = c.execute("SELECT COUNT(*) FROM negoce_factures").fetchone()[0] + 1
    num_fac = f"FAC-2026-{count:04d}"
    today_str = date.today().isoformat()
    tot_ht, tot_tva, timbre, ttc = _calc_totals(req.lignes)
    
    c.execute("""
        INSERT INTO negoce_factures (
            numero_facture, date_facture, type_piece, client_nom, client_mf,
            details_json, total_ht, total_tva, timbre_fiscal, total_ttc,
            statut, est_comptabilise, est_valide
        ) VALUES (?, ?, 'FACTURE', ?, ?, ?, ?, ?, ?, ?, 'COMPTABILISE_NON_VALIDE', 1, 0)
    """, (num_fac, today_str, req.client_nom, req.client_mf, json.dumps(req.lignes), tot_ht, tot_tva, timbre, ttc))
    
    # Écritures SCE NC 01 : Débit 411100 (Client), Crédit 707000 (Vente), Crédit 436710 (TVA), Crédit 432000 (Timbre)
    ecritures = [
        (today_str, "VT", num_fac, "411100", "Clients Nationaux", f"Facturation {req.client_nom}", ttc, 0),
        (today_str, "VT", num_fac, "707000", "Ventes de Marchandises", "Chiffre d'Affaires HT", 0, tot_ht),
        (today_str, "VT", num_fac, "436710", "TVA Collectée Facturée", "TVA sur Ventes", 0, tot_tva),
        (today_str, "VT", num_fac, "432000", "Droit de Timbre Fiscal", "Timbre 1.000 DT", 0, timbre)
    ]
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    conn.commit()
    conn.close()
    return {"success": True, "numero_facture": num_fac, "action": "COMPTABILISATION_EFFECTUEE", "statut": "COMPTABILISE_NON_VALIDE", "total_ttc": ttc}

@app.post("/api/factures/valider")
def action_valider(req: FactureActionReq):
    """ACTION 2 : Validation Définitive et Déstockage Réel des Articles avec émission du document scellé."""
    if not req.lignes:
        raise HTTPException(status_code=400, detail="Veuillez ajouter au moins une ligne d'article")
    conn = get_db()
    c = conn.cursor()
    
    count = c.execute("SELECT COUNT(*) FROM negoce_factures").fetchone()[0] + 1
    num_fac = f"FAC-2026-{count:04d}"
    today_str = date.today().isoformat()
    tot_ht, tot_tva, timbre, ttc = _calc_totals(req.lignes)
    
    # Déstockage physique
    for l in req.lignes:
        art_id = l.get("article_id")
        qte = float(l.get("qte", 1))
        if art_id:
            c.execute("UPDATE negoce_articles SET stock_actuel = stock_actuel - ? WHERE id = ?", (qte, art_id))
            
    c.execute("""
        INSERT INTO negoce_factures (
            numero_facture, date_facture, type_piece, client_nom, client_mf,
            details_json, total_ht, total_tva, timbre_fiscal, total_ttc,
            statut, est_comptabilise, est_valide
        ) VALUES (?, ?, 'FACTURE', ?, ?, ?, ?, ?, ?, ?, 'VALIDE', 1, 1)
    """, (num_fac, today_str, req.client_nom, req.client_mf, json.dumps(req.lignes), tot_ht, tot_tva, timbre, ttc))
    
    ecritures = [
        (today_str, "VT", num_fac, "411100", "Clients Nationaux", f"Facture Validée {req.client_nom}", ttc, 0),
        (today_str, "VT", num_fac, "707000", "Ventes de Marchandises", "Chiffre d'Affaires HT", 0, tot_ht),
        (today_str, "VT", num_fac, "436710", "TVA Collectée Facturée", "TVA sur Ventes", 0, tot_tva),
        (today_str, "VT", num_fac, "432000", "Droit de Timbre Fiscal", "Timbre 1.000 DT", 0, timbre)
    ]
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    conn.commit()
    conn.close()
    return {"success": True, "numero_facture": num_fac, "action": "VALIDATION_ET_DESTOCKAGE_EFFECTUES", "statut": "VALIDE", "total_ttc": ttc}

@app.post("/api/factures/{facture_id}/avoir")
def emettre_avoir(facture_id: int):
    """Émission d'un AVOIR avec réintégration en stock et extourne comptable."""
    conn = get_db()
    c = conn.cursor()
    fac = c.execute("SELECT * FROM negoce_factures WHERE id = ?", (facture_id,)).fetchone()
    if not fac:
        conn.close()
        raise HTTPException(status_code=404, detail="Facture introuvable")
    
    count_av = c.execute("SELECT COUNT(*) FROM negoce_factures WHERE type_piece = 'AVOIR'").fetchone()[0] + 1
    num_avoir = f"AV-2026-{count_av:04d}"
    today_str = date.today().isoformat()
    
    # Restitution stock
    try:
        lignes = json.loads(fac["details_json"])
        for l in lignes:
            art_id = l.get("article_id")
            qte = float(l.get("qte", 1))
            if art_id:
                c.execute("UPDATE negoce_articles SET stock_actuel = stock_actuel + ? WHERE id = ?", (qte, art_id))
    except Exception:
        pass
        
    c.execute("""
        INSERT INTO negoce_factures (
            numero_facture, date_facture, type_piece, reference_origine, client_nom, client_mf,
            details_json, total_ht, total_tva, timbre_fiscal, total_ttc, statut, est_comptabilise, est_valide
        ) VALUES (?, ?, 'AVOIR', ?, ?, ?, ?, ?, ?, 0.0, ?, 'AVOIR_VALIDE', 1, 1)
    """, (num_avoir, today_str, fac["numero_facture"], fac["client_nom"], fac["client_mf"],
          fac["details_json"], -fac["total_ht"], -fac["total_tva"], -(fac["total_ht"] + fac["total_tva"])))
    
    # Écritures d'extourne
    ttc_avoir = fac["total_ht"] + fac["total_tva"]
    ecritures_extourne = [
        (today_str, "OD", num_avoir, "707000", "Ventes de Marchandises", f"Annulation Vente Avoir {num_avoir}", fac["total_ht"], 0),
        (today_str, "OD", num_avoir, "436710", "TVA Collectée Facturée", f"Annulation TVA Avoir {num_avoir}", fac["total_tva"], 0),
        (today_str, "OD", num_avoir, "411100", "Clients Nationaux", f"Crédit Client Avoir {num_avoir}", 0, ttc_avoir)
    ]
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures_extourne)
    conn.commit()
    conn.close()
    return {"success": True, "numero_avoir": num_avoir, "montant_avoir": ttc_avoir}

# --- RÉINITIALISATION OPÉRATIONNELLE ---
@app.post("/api/admin/reset")
def reset_operational_data(req: ResetReq):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id FROM utilisateurs WHERE role='ADMIN' AND password_hash = ?", (hash_pw(req.admin_password.strip()),))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=403, detail="Mot de passe Administrateur incorrect")
    
    c.execute("DELETE FROM negoce_factures")
    c.execute("DELETE FROM ecritures_comptables")
    c.execute("UPDATE negoce_articles SET stock_actuel = 0")
    conn.commit()
    conn.close()
    return {"success": True, "message": "Mouvements de ventes et écritures comptables remis à zéro pour un nouvel usage"}

@app.get("/api/ecritures")
def list_ecritures():
    conn = get_db()
    rows = conn.execute("SELECT * FROM ecritures_comptables ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

# --- AFFICHAGE DE L'INTERFACE WEB ---
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
    print(f" Normes Fiscales      : TND (3 déc.) | TVA 19% | Timbre 1.000 DT | SCE NC 01")
    print("=" * 70)
    threading.Timer(1.5, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
