# -*- coding: utf-8 -*-
"""
SAFE ERP - MODULE 02 : SERVICES & CABINETS CONSEIL (TUNISIE) - STANDALONE PORT 8002
Gestion des missions, notes d'honoraires, TVA 19%, Timbre 1.000 DT, Retenue à la source 1.5%/3.0% (SCE NC 01)
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

MODULE_CODE = "SERVICES"
MODULE_TITLE = "SAFE Services & Cabinets"
PORT = 8002
SECRET_SALT = b"SAFE_ERP_TUNISIE_2026_MASTER_HMAC_KEY_#991"

prog_data = os.environ.get("PROGRAMDATA", os.path.expanduser("~"))
DATA_DIR = os.path.join(prog_data, "SAFE_ERP_Tunisie", "02_SAFE_Services_Cabinets")
os.makedirs(DATA_DIR, exist_ok=True)
LICENSE_FILE = os.path.join(DATA_DIR, "license.dat")
DB_PATH = os.path.join(DATA_DIR, "safe_services_local.db")

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
            role TEXT NOT NULL DEFAULT 'CONSULTANT'
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
            taux_tva_defaut REAL DEFAULT 19.0,
            taux_rs_defaut REAL DEFAULT 1.5
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS cabinet_clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            matricule_fiscal TEXT,
            secteur TEXT,
            telephone TEXT,
            email TEXT,
            adresse TEXT
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS cabinet_missions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            titre TEXT NOT NULL,
            client_id INTEGER,
            budget_ht REAL DEFAULT 0,
            taux_horaire REAL DEFAULT 120.0,
            statut TEXT DEFAULT 'EN_COURS',
            FOREIGN KEY (client_id) REFERENCES cabinet_clients(id)
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS cabinet_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero_note TEXT UNIQUE NOT NULL,
            date_note TEXT NOT NULL,
            type_piece TEXT DEFAULT 'NOTE_HONORAIRES',
            reference_origine TEXT,
            client_nom TEXT NOT NULL,
            client_mf TEXT,
            mission_titre TEXT,
            montant_ht REAL NOT NULL DEFAULT 0,
            taux_tva REAL NOT NULL DEFAULT 19.0,
            montant_tva REAL NOT NULL DEFAULT 0,
            timbre_fiscal REAL NOT NULL DEFAULT 1.000,
            total_ttc REAL NOT NULL DEFAULT 0,
            taux_rs REAL NOT NULL DEFAULT 1.5,
            montant_rs REAL NOT NULL DEFAULT 0,
            net_a_payer REAL NOT NULL DEFAULT 0,
            statut TEXT DEFAULT 'EMISE'
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
    
    # Seeding
    c.execute("SELECT COUNT(*) FROM utilisateurs")
    if c.fetchone()[0] == 0:
        c.executemany("INSERT INTO utilisateurs (username, password_hash, nom_complet, role) VALUES (?, ?, ?, ?)", [
            ("admin", hash_pw("admin2026"), "Administrateur Cabinet", "ADMIN"),
            ("consultant", hash_pw("cons2026"), "Consultant Senior", "CONSULTANT")
        ])
        
    c.execute("SELECT COUNT(*) FROM societe_config")
    if c.fetchone()[0] == 0:
        c.execute("""
            INSERT INTO societe_config (raison_sociale, matricule_fiscal, registre_commerce, adresse, telephone, email, rib, devise)
            VALUES ('Cabinet Conseil & Expertise Tunisienne - CCET SARL', '1245896/S/A/000', 'B198422026', 'Immeuble Le Grand Bleu, Berges du Lac II, 1053 Tunis', '+216 71 860 700', 'contact@ccet-conseil.tn', 'UIB 12 002 0009876543210 88', 'TND')
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
        c.execute("INSERT INTO fiscal_params (tranches_irpp_json, taux_cnss_salarie, taux_cnss_patronal, taux_css, timbre_fiscal, taux_tva_defaut, taux_rs_defaut) VALUES (?, 9.18, 16.57, 1.0, 1.000, 19.0, 1.5)", (json.dumps(tranches),))

    
    # Migration colonnes enrichies cabinet_missions
    c.execute("PRAGMA table_info(cabinet_missions)")
    _m_cols = [r[1] for r in c.fetchall()]
    for _col, _def in [
        ("responsable", "TEXT DEFAULT 'Associé Gérant'"),
        ("taux_avancement", "INTEGER DEFAULT 0"),
        ("date_debut", "TEXT DEFAULT '2026-01-01'"),
        ("date_echeance", "TEXT DEFAULT '2026-12-31'"),
        ("notes", "TEXT DEFAULT ''")
    ]:
        if _col not in _m_cols:
            c.execute(f"ALTER TABLE cabinet_missions ADD COLUMN {_col} {_def}")

    c.execute("SELECT COUNT(*) FROM cabinet_clients")
    if c.fetchone()[0] == 0:
        c.executemany("INSERT INTO cabinet_clients (nom, matricule_fiscal, secteur, telephone, email, adresse) VALUES (?, ?, ?, ?, ?, ?)", [
            ("Société Nouvelle de Confection Textile", "1024580/X/A/000", "Industrie & Export", "+216 73 444 555", "contact@snct.tn", "Zone Industrielle Monastir"),
            ("Groupe Hôtelier Palm Beach Djerba", "0987452/Y/M/000", "Tourisme & Hôtellerie", "+216 75 700 800", "direction@palmbeach.tn", "Zone Touristique Midoun"),
            ("Clinique Privée Les Jasmins", "1184592/Z/B/000", "Santé Médicale", "+216 71 900 100", "finance@cliniquejasmins.tn", "Centre Urbain Nord Tunis")
        ])

    c.execute("SELECT COUNT(*) FROM cabinet_missions")
    if c.fetchone()[0] == 0:
        c.executemany("INSERT INTO cabinet_missions (code, titre, client_id, budget_ht, taux_horaire, statut) VALUES (?, ?, ?, ?, ?, ?)", [
            ("MIS-2026-001", "Audit Organisationnel & Mise en Conformité Fiscale", 1, 4800.0, 150.0, "EN_COURS"),
            ("MIS-2026-002", "Restructuration Stratégique & Tableau de Bord Financier", 2, 7500.0, 180.0, "EN_COURS"),
            ("MIS-2026-003", "Assistance Comptable & Juridique Mensuelle", 3, 2400.0, 120.0, "TERMINE")
        ])

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
    taux_rs_defaut: float

class CreateNoteReq(BaseModel):
    client_nom: str
    client_mf: Optional[str] = ""
    mission_titre: str
    montant_ht: float
    taux_tva: float = 19.0
    taux_rs: float = 1.5

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
        taux_css = ?, timbre_fiscal = ?, taux_tva_defaut = ?, taux_rs_defaut = ? WHERE id = (SELECT id FROM fiscal_params LIMIT 1)
    """, (req.tranches_irpp_json, req.taux_cnss_salarie, req.taux_cnss_patronal, req.taux_css, req.timbre_fiscal, req.taux_tva_defaut, req.taux_rs_defaut))
    conn.commit()
    conn.close()
    return {"success": True}


# --- MODÈLES & ROUTES CLIENTS & MISSIONS (EXIGENCE 5) ---
class ClientCreateReq(BaseModel):
    nom: str
    matricule_fiscal: Optional[str] = ""
    secteur: Optional[str] = "Services"
    telephone: Optional[str] = ""
    email: Optional[str] = ""
    adresse: Optional[str] = ""

class MissionCreateReq(BaseModel):
    code: str
    titre: str
    client_id: int
    budget_ht: float = 0.0
    taux_horaire: float = 120.0
    responsable: Optional[str] = "Associé Gérant"
    taux_avancement: int = 0
    statut: Optional[str] = "EN_COURS"
    date_debut: Optional[str] = "2026-01-01"
    date_echeance: Optional[str] = "2026-12-31"

class MissionUpdateReq(BaseModel):
    titre: str
    budget_ht: float
    taux_horaire: float
    responsable: str
    taux_avancement: int
    statut: str
    date_debut: str
    date_echeance: str

@app.post("/api/clients")
def add_client(req: ClientCreateReq):
    conn = get_db()
    c = conn.cursor()
    c.execute("""
        INSERT INTO cabinet_clients (nom, matricule_fiscal, secteur, telephone, email, adresse)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (req.nom.strip(), req.matricule_fiscal, req.secteur, req.telephone, req.email, req.adresse))
    conn.commit()
    new_id = c.lastrowid
    conn.close()
    return {"success": True, "id": new_id}

@app.delete("/api/clients/{client_id}")
def delete_client(client_id: int):
    conn = get_db()
    conn.execute("DELETE FROM cabinet_clients WHERE id = ?", (client_id,))
    conn.commit()
    conn.close()
    return {"success": True}

@app.post("/api/missions")
def add_mission(req: MissionCreateReq):
    conn = get_db()
    c = conn.cursor()
    try:
        c.execute("""
            INSERT INTO cabinet_missions (code, titre, client_id, budget_ht, taux_horaire, responsable, taux_avancement, statut, date_debut, date_echeance)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (req.code.strip().upper(), req.titre.strip(), req.client_id, req.budget_ht, req.taux_horaire, req.responsable, req.taux_avancement, req.statut, req.date_debut, req.date_echeance))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce code mission existe déjà")
    new_id = c.lastrowid
    conn.close()
    return {"success": True, "id": new_id}

@app.put("/api/missions/{mission_id}")
def update_mission(mission_id: int, req: MissionUpdateReq):
    conn = get_db()
    conn.execute("""
        UPDATE cabinet_missions SET
            titre = ?, budget_ht = ?, taux_horaire = ?, responsable = ?,
            taux_avancement = ?, statut = ?, date_debut = ?, date_echeance = ?
        WHERE id = ?
    """, (req.titre, req.budget_ht, req.taux_horaire, req.responsable, req.taux_avancement, req.statut, req.date_debut, req.date_echeance, mission_id))
    conn.commit()
    conn.close()
    return {"success": True}

@app.delete("/api/missions/{mission_id}")
def delete_mission(mission_id: int):
    conn = get_db()
    conn.execute("DELETE FROM cabinet_missions WHERE id = ?", (mission_id,))
    conn.commit()
    conn.close()
    return {"success": True}

@app.get("/api/clients")
def list_clients():
    conn = get_db()
    rows = conn.execute("SELECT * FROM cabinet_clients ORDER BY id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/missions")
def list_missions():
    conn = get_db()
    rows = conn.execute("""
        SELECT m.*, c.nom as client_nom FROM cabinet_missions m
        LEFT JOIN cabinet_clients c ON m.client_id = c.id ORDER BY m.id DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/notes")
def list_notes():
    conn = get_db()
    rows = conn.execute("SELECT * FROM cabinet_notes ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/notes")
def create_note(req: CreateNoteReq):
    conn = get_db()
    c = conn.cursor()
    count = c.execute("SELECT COUNT(*) FROM cabinet_notes").fetchone()[0] + 1
    num_note = f"HON-2026-{count:04d}"
    today_str = date.today().isoformat()
    
    ht = req.montant_ht
    tva = round(ht * (req.taux_tva / 100.0), 3)
    timbre = 1.000
    ttc = round(ht + tva + timbre, 3)
    rs = round(ttc * (req.taux_rs / 100.0), 3) if req.taux_rs > 0 else 0.0
    net = round(ttc - rs, 3)
    
    c.execute("""
        INSERT INTO cabinet_notes (
            numero_note, date_note, type_piece, client_nom, client_mf, mission_titre,
            montant_ht, taux_tva, montant_tva, timbre_fiscal, total_ttc, taux_rs, montant_rs, net_a_payer, statut
        ) VALUES (?, ?, 'NOTE_HONORAIRES', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EMISE')
    """, (num_note, today_str, req.client_nom, req.client_mf, req.mission_titre, ht, req.taux_tva, tva, timbre, ttc, req.taux_rs, rs, net))
    
    # Écritures SCE NC 01 : 411 Clients (Net), 432 Retenue Source, 706 Prestations Services (HT), 4367 TVA, 432 Timbre
    ecritures = [
        (today_str, "VT", num_note, "411100", "Clients Nationaux", f"Note {num_note} {req.client_nom}", net, 0),
        (today_str, "VT", num_note, "432000", "État - Retenue à la Source", f"Certificat RS {req.taux_rs}%", rs, 0),
        (today_str, "VT", num_note, "706000", "Prestations de Services", "Honoraires & Conseil HT", 0, ht),
        (today_str, "VT", num_note, "436710", "TVA Collectée Prestations", "TVA 19%", 0, tva),
        (today_str, "VT", num_note, "432000", "Droit de Timbre Fiscal", "Timbre 1.000 DT", 0, timbre)
    ]
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    conn.commit()
    conn.close()
    return {"success": True, "numero_note": num_note, "net_a_payer": net}

@app.post("/api/notes/{id}/avoir")
def emettre_avoir_note(id: int):
    conn = get_db()
    c = conn.cursor()
    n = c.execute("SELECT * FROM cabinet_notes WHERE id = ?", (id,)).fetchone()
    if not n:
        conn.close()
        raise HTTPException(status_code=404, detail="Note introuvable")
    
    count_av = c.execute("SELECT COUNT(*) FROM cabinet_notes WHERE type_piece = 'AVOIR'").fetchone()[0] + 1
    num_av = f"AV-HON-2026-{count_av:04d}"
    today_str = date.today().isoformat()
    
    c.execute("""
        INSERT INTO cabinet_notes (
            numero_note, date_note, type_piece, reference_origine, client_nom, client_mf, mission_titre,
            montant_ht, taux_tva, montant_tva, timbre_fiscal, total_ttc, taux_rs, montant_rs, net_a_payer, statut
        ) VALUES (?, ?, 'AVOIR', ?, ?, ?, ?, ?, ?, ?, 0.0, ?, 0.0, 0.0, ?, 'AVOIR_VALIDE')
    """, (num_av, today_str, n["numero_note"], n["client_nom"], n["client_mf"], n["mission_titre"],
          -n["montant_ht"], n["taux_tva"], -n["montant_tva"], -(n["montant_ht"] + n["montant_tva"]), -(n["montant_ht"] + n["montant_tva"])))
    
    ecritures_extourne = [
        (today_str, "OD", num_av, "706000", "Prestations de Services", f"Extourne Honoraires {num_av}", n["montant_ht"], 0),
        (today_str, "OD", num_av, "436710", "TVA Collectée Prestations", f"Extourne TVA {num_av}", n["montant_tva"], 0),
        (today_str, "OD", num_av, "411100", "Clients Nationaux", f"Crédit Client Avoir {num_av}", 0, n["montant_ht"] + n["montant_tva"])
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
    
    c.execute("DELETE FROM cabinet_notes")
    c.execute("DELETE FROM ecritures_comptables")
    conn.commit()
    conn.close()
    return {"success": True, "message": "Mouvements de notes d'honoraires et écritures comptables remis à zéro"}

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
    print(f" Normes Fiscales      : TND (3 déc.) | TVA 19% | RS 1.5%/3% | Timbre 1 DT")
    print("=" * 70)
    threading.Timer(1.5, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
