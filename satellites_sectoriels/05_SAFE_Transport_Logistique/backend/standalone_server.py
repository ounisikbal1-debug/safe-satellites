# -*- coding: utf-8 -*-
"""
================================================================================
SAFE ERP - MODULE 05 : TRANSPORT DE MARCHANDISES & LIVRAISON DE COLIS (TUNISIE)
================================================================================
Gestion du Fret Lourd (Lettres de Voiture) ET de la Livraison Express de Colis
(Colis E-commerce, Messagerie, Cash on Delivery / COD, Suivi par gouvernorats)
Conforme aux normes tunisiennes SCE NC 01, TVA 7%/19%, Timbre 1.000 DT,
Verrou matériel Hardware ID & HMAC-SHA256 unifié avec la Suite SAFE ERP.
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

APP_MODULE = "TRANSPORT"
MODULE_TITLE = "SAFE Transport, Logistique & Livraison Colis"
PORT = 8005
SECRET_SALT = b"SAFE_ERP_TUNISIE_2026_MASTER_HMAC_KEY_#991"

prog_data = os.environ.get("PROGRAMDATA", os.path.expanduser("~"))
DATA_DIR = os.path.join(prog_data, "SAFE_ERP_Tunisie", "05_SAFE_Transport_Logistique")
os.makedirs(DATA_DIR, exist_ok=True)
LICENSE_FILE = os.path.join(DATA_DIR, "license.dat")
DB_PATH = os.path.join(DATA_DIR, "safe_transport_local.db")

# ==============================================================================
# 1. VERROU MATÉRIEL (HARDWARE ID) & LICENCES HMAC-SHA256
# ==============================================================================
def get_hardware_id() -> str:
    raw = f"{uuid.getnode()}-{socket.gethostname()}-{sys.platform}".encode("utf-8")
    return "HW-" + hashlib.sha256(raw).hexdigest()[:12].upper()

def compute_valid_license(hw_id: str, exp_date_str: str) -> str:
    clean_exp = exp_date_str.replace("-", "")
    payload = f"{APP_MODULE}|{hw_id.upper()}|{clean_exp}".encode("utf-8")
    expected = hmac.new(SECRET_SALT, payload, hashlib.sha256).hexdigest().upper()
    expected_parts = [expected[i:i+4] for i in range(0, 16, 4)]
    return f"SAFE-{clean_exp}-{'-'.join(expected_parts)}"

def verify_license_key(key: str, hw_id: str) -> tuple[bool, str]:
    try:
        parts = key.strip().upper().split("-")
        if len(parts) != 6 or parts[0] != "SAFE":
            return False, "Format de clé invalide"
        exp_str = parts[1]
        exp_date = datetime.strptime(exp_str, "%Y%m%d").date()
        if exp_date < date.today():
            return False, f"Licence expirée le {exp_date.isoformat()}"
        
        valid = False
        for mod in ["SAFE_ERP_GLOBAL", "TRANSPORT"]:
            payload = f"{mod}|{hw_id.upper()}|{exp_str}".encode("utf-8")
            expected = hmac.new(SECRET_SALT, payload, hashlib.sha256).hexdigest().upper()
            expected_parts = [expected[i:i+4] for i in range(0, 16, 4)]
            if parts[2:] == expected_parts:
                valid = True
                break
        if not valid:
            return False, "Clé non valide pour ce PC"
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
# 2. BASE DE DONNÉES SQLITE : FLOTTE, FRET LOURD & LIVRAISON COLIS
# ==============================================================================
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_pw(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    # 1. Utilisateurs
    c.execute("""
        CREATE TABLE IF NOT EXISTS utilisateurs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            nom_complet TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'EXPLOITANT'
        )
    """)
    
    # 2. Paramètres Société (pour en-tête des lettres de voiture et bordereaux colis)
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
            secteurs_is_rs_json TEXT NOT NULL,
            taux_cnss_salarie REAL DEFAULT 9.68,
            taux_cnss_patronal REAL DEFAULT 17.07,
            taux_accident_travail REAL DEFAULT 0.50,
            taux_css REAL DEFAULT 0.5,
            taux_css_societes REAL DEFAULT 3.0,
            taux_is_defaut REAL DEFAULT 20.0,
            minimum_impot_taux REAL DEFAULT 0.2,
            minimum_impot_plancher REAL DEFAULT 500.0,
            taux_rs_ventes REAL DEFAULT 1.0,
            taux_rs_honoraires REAL DEFAULT 3.0,
            taux_rs_loyers REAL DEFAULT 10.0,
            timbre_fiscal REAL DEFAULT 1.000,
            taux_tva_defaut REAL DEFAULT 7.0
        )
    """)
    c.execute("PRAGMA table_info(fiscal_params)")
    _cols = [r[1] for r in c.fetchall()]
    for _col, _def in [
        ("secteurs_is_rs_json", "TEXT DEFAULT ''"),
        ("taux_cnss_salarie", "REAL DEFAULT 9.68"),
        ("taux_cnss_patronal", "REAL DEFAULT 17.07"),
        ("taux_accident_travail", "REAL DEFAULT 0.50"),
        ("taux_css", "REAL DEFAULT 0.5"),
        ("taux_css_societes", "REAL DEFAULT 3.0"),
        ("taux_is_defaut", "REAL DEFAULT 20.0"),
        ("minimum_impot_taux", "REAL DEFAULT 0.2"),
        ("minimum_impot_plancher", "REAL DEFAULT 500.0"),
        ("taux_rs_ventes", "REAL DEFAULT 1.0"),
        ("taux_rs_honoraires", "REAL DEFAULT 3.0"),
        ("taux_rs_loyers", "REAL DEFAULT 10.0")
    ]:
        if _col not in _cols:
            c.execute(f"ALTER TABLE fiscal_params ADD COLUMN {_col} {_def}")
    c.execute("SELECT COUNT(*) FROM fiscal_params")
    if c.fetchone()[0] == 0:
        tranches = [
            {"min": 0, "max": 5000, "taux": 0.0},
            {"min": 5000, "max": 10000, "taux": 15.0},
            {"min": 10000, "max": 20000, "taux": 25.0},
            {"min": 20000, "max": 30000, "taux": 30.0},
            {"min": 30000, "max": 40000, "taux": 33.0},
            {"min": 40000, "max": 50000, "taux": 36.0},
            {"min": 50000, "max": 70000, "taux": 38.0},
            {"min": 70000, "max": 999999999, "taux": 40.0}
        ]
        c.execute("INSERT INTO fiscal_params (tranches_irpp_json, taux_cnss_salarie, taux_cnss_patronal, taux_css, timbre_fiscal, taux_tva_defaut, taux_rs_defaut) VALUES (?, 9.68, 17.07, 0.5, 1.000, 7.0, 1.0)", (json.dumps(tranches),))
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plate_number TEXT UNIQUE NOT NULL,
            vehicle_type TEXT NOT NULL,
            driver_name TEXT NOT NULL,
            capacity_tons REAL DEFAULT 0,
            telephone_chauffeur TEXT,
            status TEXT DEFAULT 'DISPONIBLE'
        )
    """)
    
    # 4. Fret Lourd : Lettres de Voiture / Ordres de Transport
    c.execute("""
        CREATE TABLE IF NOT EXISTS transport_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            waybill_number TEXT UNIQUE NOT NULL,
            order_date TEXT NOT NULL,
            type_piece TEXT DEFAULT 'LETTRE_VOITURE',
            reference_origine TEXT,
            client_name TEXT NOT NULL,
            client_mf TEXT,
            origin_city TEXT NOT NULL,
            destination_city TEXT NOT NULL,
            cargo_description TEXT,
            weight_tons REAL DEFAULT 0,
            vehicle_plate TEXT,
            freight_ht REAL NOT NULL DEFAULT 0,
            fuel_surcharge_ht REAL NOT NULL DEFAULT 0,
            vat_rate REAL NOT NULL DEFAULT 7.0,
            vat_amount REAL NOT NULL DEFAULT 0,
            stamp_duty REAL NOT NULL DEFAULT 1.000,
            rs_rate REAL NOT NULL DEFAULT 1.0,
            rs_amount REAL NOT NULL DEFAULT 0,
            total_ttc REAL NOT NULL DEFAULT 0,
            net_payable REAL NOT NULL DEFAULT 0,
            fuel_cost REAL NOT NULL DEFAULT 0,
            toll_cost REAL NOT NULL DEFAULT 0,
            driver_allowance REAL NOT NULL DEFAULT 0,
            trip_margin REAL NOT NULL DEFAULT 0,
            status TEXT DEFAULT 'LIVRE'
        )
    """)
    
    # 5. Colis & Livraison Express (Messagerie, E-Commerce & Contre-Remboursement COD)
    c.execute("""
        CREATE TABLE IF NOT EXISTS colis_expeditions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tracking_code TEXT UNIQUE NOT NULL,
            date_expedition TEXT NOT NULL,
            type_piece TEXT DEFAULT 'EXPEDITION',
            reference_origine TEXT,
            expediteur_nom TEXT NOT NULL,
            expediteur_tel TEXT NOT NULL,
            expediteur_ville TEXT NOT NULL,
            destinataire_nom TEXT NOT NULL,
            destinataire_tel TEXT NOT NULL,
            destinataire_adresse TEXT NOT NULL,
            destinataire_gouvernorat TEXT NOT NULL,
            type_colis TEXT NOT NULL DEFAULT 'STANDARD',
            poids_kg REAL DEFAULT 1.0,
            nombre_pieces INTEGER DEFAULT 1,
            frais_livraison_ht REAL NOT NULL DEFAULT 7.477,
            taux_tva REAL DEFAULT 7.0,
            montant_tva REAL NOT NULL DEFAULT 0.523,
            timbre_fiscal REAL DEFAULT 1.000,
            frais_livraison_ttc REAL NOT NULL DEFAULT 8.000,
            montant_cod REAL DEFAULT 0.0,
            montant_net_expediteur REAL DEFAULT 0.0,
            livreur_nom TEXT DEFAULT 'Tournée Express',
            statut TEXT DEFAULT 'EN_TRANSIT'
        )
    """)
    
    # 6. Écritures Comptables SCE NC 01
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
    
    # Seeding Initial si vide
    c.execute("SELECT COUNT(*) FROM utilisateurs")
    if c.fetchone()[0] == 0:
        c.executemany("INSERT INTO utilisateurs (username, password_hash, nom_complet, role) VALUES (?, ?, ?, ?)", [
            ("admin", hash_pw("admin2026"), "Administrateur Transport", "ADMIN"),
            ("exploitant", hash_pw("expl2026"), "Responsable Flotte & Dispatch", "EXPLOITANT"),
            ("livreur", hash_pw("livr2026"), "Chauffeur & Livreur Express", "OPERATEUR")
        ])
        
    c.execute("SELECT COUNT(*) FROM societe_config")
    if c.fetchone()[0] == 0:
        c.execute("""
            INSERT INTO societe_config (raison_sociale, matricule_fiscal, registre_commerce, adresse, telephone, email, rib, devise)
            VALUES ('Express Fret & Colis Tunisie - EFCT SARL', '1589420/T/A/000', 'B2019482026', 'Zone Logistique Port de Radès, 2040 Ben Arous', '+216 71 445 800 / +216 28 555 444', 'contact@expressfret-colis.tn', 'STB 10 005 0001234567890 12', 'TND')
        """)
        
    c.execute("SELECT COUNT(*) FROM vehicles")
    if c.fetchone()[0] == 0:
        c.executemany("INSERT INTO vehicles (plate_number, vehicle_type, driver_name, capacity_tons, telephone_chauffeur, status) VALUES (?, ?, ?, ?, ?, ?)", [
            ("198 TN 4521", "Semi-Remorque 24T Fret Lourd", "Mohamed Ben Ali", 24.0, "+216 98 123 456", "EN_MISSION"),
            ("215 TN 8810", "Camion Frigorifique 12T", "Sami Trabelsi", 12.0, "+216 97 654 321", "DISPONIBLE"),
            ("224 TN 1094", "Fourgon Isuzu Colis Express 3.5T", "Walid Gharbi", 3.5, "+216 55 444 333", "EN_TOURNEE"),
            ("230 TN 7712", "Utilitaire Renault Master 2.0T", "Anis Mansour", 2.0, "+216 52 888 999", "DISPONIBLE"),
            ("MOTO-EXP-01", "Scooter Livraison Rapide Tunis", "Bilel Riahi", 0.1, "+216 20 111 222", "EN_TOURNEE")
        ])
        
    c.execute("SELECT COUNT(*) FROM transport_orders")
    if c.fetchone()[0] == 0:
        c.execute("""
            INSERT INTO transport_orders VALUES (
                NULL, 'LV-2026-0001', '2026-11-18', 'LETTRE_VOITURE', NULL,
                'Société Tunisienne de Céramique & Grès', '1284590/A/M/000',
                'Port de Radès (Tunis)', 'Zone Industrielle Sfax Poudrière',
                'Palette Carrelage & Produits Chimiques (18T)', 18.0,
                '198 TN 4521', 1200.000, 150.000, 7.0, 94.500, 1.000, 1.0, 14.455, 1445.500, 1431.045,
                340.000, 48.000, 65.000, 897.000, 'LIVRE'
            )
        """)
        
    c.execute("SELECT COUNT(*) FROM colis_expeditions")
    if c.fetchone()[0] == 0:
        colis_data = [
            ("TN-COLIS-2026-0001", "2026-11-19", "EXPEDITION", None, "Boutique Mode & Chic Tunis", "+216 71 222 333", "Tunis Centre", "Mme. Sonia Riahi", "+216 98 444 555", "Avenue de la République", "Sousse", "STANDARD", 1.8, 1, 7.477, 7.0, 0.523, 1.000, 9.000, 95.000, 86.000, "Walid Gharbi", "LIVRE_ENCAISSE"),
            ("TN-COLIS-2026-0002", "2026-11-20", "EXPEDITION", None, "High-Tech Store Ariana", "+216 70 888 999", "Ariana", "M. Karim Ben Amor", "+216 97 111 222", "Route de Téniour Km 2.5", "Sfax", "EXPRESS_24H", 3.2, 1, 9.346, 7.0, 0.654, 1.000, 11.000, 180.000, 169.000, "Walid Gharbi", "EN_LIVRAISON"),
            ("TN-COLIS-2026-0003", "2026-11-20", "EXPEDITION", None, "Dépôt Pharmaceutique Ben Arous", "+216 71 777 666", "Ben Arous", "Clinique Les Oliviers", "+216 72 333 444", "Boulevard de l'Environnement", "Nabeul", "FRAGILE", 5.0, 2, 11.215, 7.0, 0.785, 1.000, 13.000, 0.000, 0.000, "Anis Mansour", "EN_TRANSIT_HUB"),
            ("TN-COLIS-2026-0004", "2026-11-20", "EXPEDITION", None, "Artisanat du Sud Djerba", "+216 75 666 555", "Djerba Houmt Souk", "M. Hichem Trabelsi", "+216 55 777 888", "Zone Corniche", "Bizerte", "STANDARD", 2.5, 1, 7.477, 7.0, 0.523, 1.000, 9.000, 65.000, 56.000, "Bilel Riahi", "RAMASSE")
        ]
        c.executemany("""
            INSERT INTO colis_expeditions (tracking_code, date_expedition, type_piece, reference_origine, expediteur_nom, expediteur_tel, expediteur_ville, destinataire_nom, destinataire_tel, destinataire_adresse, destinataire_gouvernorat, type_colis, poids_kg, nombre_pieces, frais_livraison_ht, taux_tva, montant_tva, timbre_fiscal, frais_livraison_ttc, montant_cod, montant_net_expediteur, livreur_nom, statut)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, colis_data)
        
    conn.commit()
    conn.close()

init_db()

# ==============================================================================
# 3. APPLICATION FASTAPI & ENDPOINTS COMPLETS
# ==============================================================================
app = FastAPI(title=MODULE_TITLE, version="2.5.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# --- AUTHENTIFICATION UNIFIÉE SAFE ---
class LoginReq(BaseModel):
    username: str
    password: str

@app.post("/api/auth/login")
def login(req: LoginReq):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, username, nom_complet, role FROM utilisateurs WHERE username = ? AND password_hash = ?", (req.username.strip(), hash_pw(req.password.strip())))
    row = c.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Identifiants invalides")
    token = f"SAFE_TR_{row['id']}_{int(time.time())}_{row['role']}"
    user_dict = dict(row)
    return {"success": True, "token": token, "user": user_dict, **user_dict}

@app.post("/api/auth/logout")
def logout_api():
    return {"success": True, "message": "Déconnexion réussie"}

# --- STATUT LICENCE & VERROU MATÉRIEL ---
@app.get("/api/license/status")
def license_status():
    ok, hw_id, info = is_activated()
    return {
        "active": ok,
        "module_code": APP_MODULE,
        "module_title": MODULE_TITLE,
        "hardware_id": hw_id,
        "info": info,
        "devise": "TND (3 décimales)",
        "tva_transport": "7% (Marchandises & Colis), 19% (Prestations annexes)",
        "norme": "SCE NC 01"
    }

class LicenseActivateReq(BaseModel):
    license_key: str

@app.post("/api/license/activate")
def license_activate(req: LicenseActivateReq):
    hw_id = get_hardware_id()
    ok, info = verify_license_key(req.license_key, hw_id)
    if not ok:
        raise HTTPException(status_code=400, detail=info)
    with open(LICENSE_FILE, "w", encoding="utf-8") as f:
        f.write(req.license_key.strip().upper())
    return {"status": "ACTIVATED", "hardware_id": hw_id, "expires": info}

# --- PARAMÈTRES SOCIÉTÉ ---

class FiscalUpdateReq(BaseModel):
    tranches_irpp_json: str
    secteurs_is_rs_json: Optional[str] = None
    taux_cnss_salarie: float = 9.68
    taux_cnss_patronal: float = 17.07
    taux_accident_travail: float = 0.50
    taux_css: float = 0.5
    taux_css_societes: float = 3.0
    taux_is_defaut: float = 20.0
    minimum_impot_taux: float = 0.2
    minimum_impot_plancher: float = 500.0
    taux_rs_ventes: float = 1.0
    taux_rs_honoraires: float = 3.0
    taux_rs_loyers: float = 10.0
    timbre_fiscal: float = 1.000
    taux_tva_defaut: float = 19.0


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

@app.get("/api/company")
def get_company():
    conn = get_db()
    row = conn.execute("SELECT * FROM societe_config LIMIT 1").fetchone()
    conn.close()
    return dict(row) if row else {}

class CompanyReq(BaseModel):
    raison_sociale: str
    matricule_fiscal: str
    registre_commerce: Optional[str] = ""
    adresse: str
    telephone: str
    email: str
    rib: Optional[str] = ""

@app.put("/api/company")
def update_company(req: CompanyReq):
    conn = get_db()
    conn.execute("""
        UPDATE societe_config SET raison_sociale = ?, matricule_fiscal = ?, registre_commerce = ?,
        adresse = ?, telephone = ?, email = ?, rib = ?
        WHERE id = (SELECT id FROM societe_config LIMIT 1)
    """, (req.raison_sociale, req.matricule_fiscal, req.registre_commerce, req.adresse, req.telephone, req.email, req.rib))
    conn.commit()
    conn.close()
    return {"success": True}

# --- DASHBOARD & KPIS COMBINÉS (FRET + COLIS) ---
@app.get("/api/dashboard")
def get_dashboard():
    conn = get_db()
    c = conn.cursor()
    orders = [dict(r) for r in c.execute("SELECT * FROM transport_orders ORDER BY id DESC").fetchall()]
    colis = [dict(r) for r in c.execute("SELECT * FROM colis_expeditions ORDER BY id DESC").fetchall()]
    vehicles = [dict(r) for r in c.execute("SELECT * FROM vehicles ORDER BY id ASC").fetchall()]
    conn.close()
    
    ca_fret = sum(o["freight_ht"] + o["fuel_surcharge_ht"] for o in orders if o.get("type_piece") != "AVOIR")
    ca_colis = sum(c["frais_livraison_ht"] for c in colis if c.get("type_piece") != "AVOIR")
    total_cod_encaisse = sum(c["montant_cod"] for c in colis if c["statut"] == "LIVRE_ENCAISSE")
    colis_en_cours = sum(1 for c in colis if c["statut"] in ["RAMASSE", "EN_TRANSIT_HUB", "EN_LIVRAISON"])
    
    return {
        "kpis": {
            "ca_global_ht": f"{(ca_fret + ca_colis):.3f}",
            "ca_fret_ht": f"{ca_fret:.3f}",
            "ca_colis_ht": f"{ca_colis:.3f}",
            "total_cod_encaisse": f"{total_cod_encaisse:.3f}",
            "colis_en_cours": colis_en_cours,
            "flotte_active": f"{len(vehicles)} véhicules"
        },
        "orders": orders,
        "colis": colis,
        "vehicles": vehicles
    }

# --- GESTION DES VÉHICULES ---
class AddVehicleReq(BaseModel):
    plate_number: str
    vehicle_type: str
    driver_name: str
    capacity_tons: float = 1.0
    telephone_chauffeur: Optional[str] = ""

@app.post("/api/vehicles")
def add_vehicle(req: AddVehicleReq):
    conn = get_db()
    try:
        conn.execute("INSERT INTO vehicles (plate_number, vehicle_type, driver_name, capacity_tons, telephone_chauffeur) VALUES (?, ?, ?, ?, ?)",
                     (req.plate_number.strip().upper(), req.vehicle_type.strip(), req.driver_name.strip(), req.capacity_tons, req.telephone_chauffeur.strip()))
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce matricule véhicule existe déjà")
    conn.close()
    return {"success": True}

@app.delete("/api/vehicles/{plate}")
def delete_vehicle(plate: str):
    conn = get_db()
    conn.execute("DELETE FROM vehicles WHERE plate_number = ?", (plate,))
    conn.commit()
    conn.close()
    return {"success": True}

# --- FRET LOURD : LETTRES DE VOITURE & AVOIRS ---
class TransportOrderReq(BaseModel):
    client_name: str
    client_mf: str = "1284590/A/M/000"
    origin_city: str
    destination_city: str
    cargo_description: str
    weight_tons: float
    vehicle_plate: str
    freight_ht: float
    fuel_surcharge_ht: float = 0.0
    vat_rate: float = 7.0
    rs_rate: float = 1.0
    fuel_cost: float = 0.0
    toll_cost: float = 0.0
    driver_allowance: float = 0.0

@app.post("/api/orders")
def create_order(req: TransportOrderReq):
    base_ht = round(req.freight_ht + req.fuel_surcharge_ht, 3)
    vat = round(base_ht * (req.vat_rate / 100.0), 3)
    stamp = 1.000
    ttc = round(base_ht + vat + stamp, 3)
    rs = round(ttc * (req.rs_rate / 100.0), 3)
    net_pay = round(ttc - rs, 3)
    costs = round(req.fuel_cost + req.toll_cost + req.driver_allowance, 3)
    margin = round(base_ht - costs, 3)
    
    conn = get_db()
    c = conn.cursor()
    count = c.execute("SELECT COUNT(*) FROM transport_orders").fetchone()[0] + 1
    waybill = f"LV-2026-{count:04d}"
    today_str = date.today().isoformat()
    
    c.execute("""
        INSERT INTO transport_orders VALUES (
            NULL, ?, ?, 'LETTRE_VOITURE', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LIVRE'
        )
    """, (
        waybill, today_str, req.client_name, req.client_mf, req.origin_city, req.destination_city,
        req.cargo_description, req.weight_tons, req.vehicle_plate, req.freight_ht, req.fuel_surcharge_ht,
        req.vat_rate, vat, stamp, req.rs_rate, rs, ttc, net_pay, req.fuel_cost, req.toll_cost, req.driver_allowance, margin
    ))
    
    # Écritures comptables
    ecritures = [
        (today_str, "VT", waybill, "411100", f"Clients Fret - {req.client_name}", f"Net à payer {waybill}", net_pay, 0.0),
        (today_str, "VT", waybill, "434000", f"Retenue à la source ({req.rs_rate}%)", f"RS subie {waybill}", rs, 0.0),
        (today_str, "VT", waybill, "706100", "Prestations de Transport de Marchandises", f"Fret {waybill}", 0.0, base_ht),
        (today_str, "VT", waybill, "436700", f"État - TVA Collectée ({req.vat_rate}%)", f"TVA transport {waybill}", 0.0, vat),
        (today_str, "VT", waybill, "437000", "Droits de Timbre Fiscal", "Droit de timbre légal 1.000 DT", 0.0, stamp),
    ]
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    
    conn.commit()
    conn.close()
    return {"success": True, "waybill_number": waybill, "total_ttc": ttc, "net_payable": net_pay, "trip_margin": margin}

@app.post("/api/orders/{waybill}/avoir")
def emettre_avoir_fret(waybill: str):
    conn = get_db()
    c = conn.cursor()
    order = c.execute("SELECT * FROM transport_orders WHERE waybill_number = ?", (waybill,)).fetchone()
    if not order or order["type_piece"] == "AVOIR":
        conn.close()
        raise HTTPException(status_code=400, detail="Ordre introuvable ou déjà un avoir")
    
    num_seq = c.execute("SELECT COUNT(*) FROM transport_orders WHERE type_piece='AVOIR'").fetchone()[0] + 1
    num_avoir = f"AV-LV-2026-{num_seq:04d}"
    today_str = date.today().isoformat()
    
    base_ht = order["freight_ht"] + order["fuel_surcharge_ht"]
    c.execute("""
        INSERT INTO transport_orders VALUES (
            NULL, ?, ?, 'AVOIR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AVOIR'
        )
    """, (
        num_avoir, today_str, waybill, order["client_name"], order["client_mf"], order["origin_city"], order["destination_city"],
        f"Avoir sur fret {waybill}", order["weight_tons"], order["vehicle_plate"], order["freight_ht"], order["fuel_surcharge_ht"],
        order["vat_rate"], order["vat_amount"], 0.0, order["rs_rate"], order["rs_amount"], order["total_ttc"], order["net_payable"],
        0.0, 0.0, 0.0, 0.0
    ))
    
    ecritures = [
        (today_str, "VT", num_avoir, "706100", "Transport - Avoirs accordés", f"Avoir sur {waybill}", base_ht, 0.0),
        (today_str, "VT", num_avoir, "436700", "TVA Régularisée Transport", f"TVA Avoir {num_avoir}", order["vat_amount"], 0.0),
        (today_str, "VT", num_avoir, "411100", "Clients - Crédit Avoir Fret", f"Avoir {num_avoir}", 0.0, order["net_payable"]),
    ]
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    
    conn.commit()
    conn.close()
    return {"success": True, "numero_avoir": num_avoir}

# --- LIVRAISON DE COLIS & MESSAGERIE EXPRESS ---
class CreateColisReq(BaseModel):
    expediteur_nom: str
    expediteur_tel: str
    expediteur_ville: str
    destinataire_nom: str
    destinataire_tel: str
    destinataire_adresse: str
    destinataire_gouvernorat: str
    type_colis: str = "STANDARD" # STANDARD, EXPRESS_24H, FRAGILE
    poids_kg: float = 1.0
    nombre_pieces: int = 1
    frais_livraison_ttc: float = 8.000
    montant_cod: float = 0.0 # Contre-Remboursement
    livreur_nom: str = "Tournée Express"

@app.post("/api/colis")
def create_colis(req: CreateColisReq):
    conn = get_db()
    c = conn.cursor()
    
    count = c.execute("SELECT COUNT(*) FROM colis_expeditions").fetchone()[0] + 1
    tracking = f"TN-COLIS-2026-{count:04d}"
    today_str = date.today().isoformat()
    
    # Calcul TVA 7% sur frais de livraison
    ttc = req.frais_livraison_ttc
    taux_tva = 7.0
    timbre = 1.000
    ht = round((ttc - timbre) / (1 + (taux_tva / 100.0)), 3)
    tva = round(ttc - timbre - ht, 3)
    net_expediteur = round(max(0.0, req.montant_cod - ttc), 3) if req.montant_cod > 0 else 0.0
    
    c.execute("""
        INSERT INTO colis_expeditions (
            tracking_code, date_expedition, type_piece, reference_origine,
            expediteur_nom, expediteur_tel, expediteur_ville,
            destinataire_nom, destinataire_tel, destinataire_adresse, destinataire_gouvernorat,
            type_colis, poids_kg, nombre_pieces,
            frais_livraison_ht, taux_tva, montant_tva, timbre_fiscal, frais_livraison_ttc,
            montant_cod, montant_net_expediteur, livreur_nom, statut
        ) VALUES (?, ?, 'EXPEDITION', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_TRANSIT')
    """, (
        tracking, today_str, req.expediteur_nom, req.expediteur_tel, req.expediteur_ville,
        req.destinataire_nom, req.destinataire_tel, req.destinataire_adresse, req.destinataire_gouvernorat,
        req.type_colis, req.poids_kg, req.nombre_pieces,
        ht, taux_tva, tva, timbre, ttc, req.montant_cod, net_expediteur, req.livreur_nom
    ))
    
    # Écriture comptable pour prestation de livraison
    ecritures = [
        (today_str, "VT", tracking, "411200", f"Clients E-commerce - {req.expediteur_nom}", f"Livraison {tracking}", ttc, 0.0),
        (today_str, "VT", tracking, "706100", "Prestations de Livraison Colis", f"Frais livraison {tracking}", 0.0, ht),
        (today_str, "VT", tracking, "436700", "État - TVA Collectée Colis (7%)", f"TVA {tracking}", 0.0, tva),
        (today_str, "VT", tracking, "437000", "Droits de Timbre Fiscal", "Timbre 1.000 DT", 0.0, timbre),
    ]
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    
    conn.commit()
    conn.close()
    return {"success": True, "tracking_code": tracking, "frais_ttc": ttc, "net_expediteur": net_expediteur}

class UpdateColisStatusReq(BaseModel):
    nouveau_statut: str # RAMASSE, EN_TRANSIT_HUB, EN_LIVRAISON, LIVRE_ENCAISSE, RETOUR_NON_LIVRE

@app.put("/api/colis/{tracking}/status")
def update_colis_status(tracking: str, req: UpdateColisStatusReq):
    conn = get_db()
    c = conn.cursor()
    colis = c.execute("SELECT * FROM colis_expeditions WHERE tracking_code = ?", (tracking,)).fetchone()
    if not colis:
        conn.close()
        raise HTTPException(status_code=404, detail="Colis introuvable")
    
    today_str = date.today().isoformat()
    c.execute("UPDATE colis_expeditions SET statut = ? WHERE tracking_code = ?", (req.nouveau_statut, tracking))
    
    # Si le colis est livré et encaissé avec contre-remboursement (COD)
    if req.nouveau_statut == "LIVRE_ENCAISSE" and colis["montant_cod"] > 0:
        # Encaissement des fonds chez le destinataire : Débit Caisse 541 / Crédit Débiteurs-Créditeurs COD 467
        ecritures_cod = [
            (today_str, "CA", tracking, "541000", "Caisse Livreur - Encaiss. COD", f"Encaiss. Colis {tracking}", colis["montant_cod"], 0.0),
            (today_str, "CA", tracking, "467000", f"Fonds COD à reverser à {colis['expediteur_nom']}", f"Fonds collectés {tracking}", 0.0, colis["montant_cod"]),
        ]
        c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures_cod)
        
    conn.commit()
    conn.close()
    return {"success": True, "nouveau_statut": req.nouveau_statut}

@app.post("/api/colis/{tracking}/avoir")
def emettre_avoir_colis(tracking: str):
    conn = get_db()
    c = conn.cursor()
    colis = c.execute("SELECT * FROM colis_expeditions WHERE tracking_code = ?", (tracking,)).fetchone()
    if not colis or colis["type_piece"] == "AVOIR":
        conn.close()
        raise HTTPException(status_code=400, detail="Colis introuvable ou déjà annulé")
    
    num_seq = c.execute("SELECT COUNT(*) FROM colis_expeditions WHERE type_piece='AVOIR'").fetchone()[0] + 1
    num_avoir = f"AV-COLIS-2026-{num_seq:04d}"
    today_str = date.today().isoformat()
    
    c.execute("""
        INSERT INTO colis_expeditions (
            tracking_code, date_expedition, type_piece, reference_origine,
            expediteur_nom, expediteur_tel, expediteur_ville,
            destinataire_nom, destinataire_tel, destinataire_adresse, destinataire_gouvernorat,
            type_colis, poids_kg, nombre_pieces,
            frais_livraison_ht, taux_tva, montant_tva, timbre_fiscal, frais_livraison_ttc,
            montant_cod, montant_net_expediteur, livreur_nom, statut
        ) VALUES (?, ?, 'AVOIR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, 0.0, 0.0, ?, 'AVOIR_RETOUR')
    """, (
        num_avoir, today_str, tracking, colis["expediteur_nom"], colis["expediteur_tel"], colis["expediteur_ville"],
        colis["destinataire_nom"], colis["destinataire_tel"], colis["destinataire_adresse"], colis["destinataire_gouvernorat"],
        colis["type_colis"], colis["poids_kg"], colis["nombre_pieces"],
        colis["frais_livraison_ht"], colis["taux_tva"], colis["montant_tva"], colis["frais_livraison_ttc"],
        colis["livreur_nom"]
    ))
    
    ecritures = [
        (today_str, "VT", num_avoir, "706100", "Prestations Livraison - Avoirs", f"Avoir sur colis {tracking}", colis["frais_livraison_ht"], 0.0),
        (today_str, "VT", num_avoir, "436700", "TVA Régularisée Colis", f"TVA Avoir {num_avoir}", colis["montant_tva"], 0.0),
        (today_str, "VT", num_avoir, "411200", "Clients E-commerce - Crédit Avoir", f"Avoir {num_avoir}", 0.0, colis["frais_livraison_ttc"]),
    ]
    c.executemany("INSERT INTO ecritures_comptables (date_ecriture, journal, piece_ref, compte, libelle_compte, libelle_operation, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ecritures)
    
    conn.commit()
    conn.close()
    return {"success": True, "numero_avoir": num_avoir}

# --- RÉINITIALISATION DONNÉES OPÉRATIONNELLES (ADMIN ONLY) ---
class ResetReq(BaseModel):
    admin_password: str

@app.post("/api/admin/reset")
def reset_operational_data(req: ResetReq):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id FROM utilisateurs WHERE role='ADMIN' AND password_hash = ?", (hash_pw(req.admin_password.strip()),))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=403, detail="Mot de passe Administrateur incorrect")
    
    c.execute("DELETE FROM transport_orders")
    c.execute("DELETE FROM colis_expeditions")
    c.execute("DELETE FROM ecritures_comptables")
    conn.commit()
    conn.close()
    return {"success": True, "message": "Mouvements de transport et colis remis à zéro pour un nouvel usage"}

@app.get("/api/compta/grand-livre")
def get_grand_livre():
    conn = get_db()
    rows = conn.execute("SELECT * FROM ecritures_comptables ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

# --- AFFICHAGE DE L'INTERFACE WEB ---
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
    print(f" {MODULE_TITLE}")
    print(f" Port Local           : {PORT}")
    print(f" Verrou Hardware ID   : {hw_id}")
    print(f" Cryptographie        : HMAC-SHA256 (SAFE-YYYYMMDD-XXXX-XXXX-XXXX-XXXX)")
    print(f" Normes Fiscales      : TND (3 déc.) | TVA Transport 7% | SCE NC 01")
    print("=" * 70)
    threading.Timer(1.5, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
