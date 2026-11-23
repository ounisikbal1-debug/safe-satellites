import os
import sqlite3
import hashlib
import hmac
import socket
import webbrowser
import threading
import time
from datetime import datetime, date
from typing import Optional
from fastapi import FastAPI, Response, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
import uvicorn

SECRET_SALT = b"SAFE_ERP_TUNISIE_2026_MASTER_HMAC_KEY_#991"
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "safe_crm_licenses.db")

app = FastAPI(title="SAFE ERP - CRM Éditeur & Gestionnaire de Licences")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS client_licenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_name TEXT NOT NULL,
            matricule_fiscal TEXT,
            contact_email TEXT,
            contact_phone TEXT,
            module_code TEXT NOT NULL,
            hardware_id TEXT NOT NULL,
            expiration_date TEXT NOT NULL,
            license_key TEXT NOT NULL,
            annual_fee_tnd REAL DEFAULT 1200.000,
            status TEXT DEFAULT 'ACTIVE',
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

def compute_license_key(module_code: str, hardware_id: str, exp_date_str: str) -> str:
    clean_exp = exp_date_str.replace("-", "")
    payload = f"{module_code.strip().upper()}|{hardware_id.strip().upper()}|{clean_exp}".encode("utf-8")
    digest = hmac.new(SECRET_SALT, payload, hashlib.sha256).hexdigest().upper()
    parts = [digest[i:i+4] for i in range(0, 16, 4)]
    return f"SAFE-{clean_exp}-{'-'.join(parts)}"

class LicenseCreate(BaseModel):
    client_name: str
    matricule_fiscal: Optional[str] = ""
    contact_email: Optional[str] = ""
    contact_phone: Optional[str] = ""
    module_code: str
    hardware_id: str
    expiration_date: str
    annual_fee_tnd: float = 1200.000

class LicenseRenew(BaseModel):
    new_expiration_date: str
    annual_fee_tnd: Optional[float] = None

@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/api/licenses")
def list_licenses():
    conn = get_db()
    rows = conn.execute("SELECT * FROM client_licenses ORDER BY id DESC").fetchall()
    conn.close()
    today = date.today().isoformat()
    result = []
    total_revenue = 0.0
    active_count = 0
    expiring_soon = 0
    for r in rows:
        item = dict(r)
        exp = item["expiration_date"]
        if item["status"] == "REVOKED":
            computed_status = "REVOKED"
        elif exp < today:
            computed_status = "EXPIRED"
        else:
            computed_status = "ACTIVE"
            active_count += 1
            total_revenue += float(item["annual_fee_tnd"] or 0)
            days_left = (date.fromisoformat(exp) - date.today()).days
            if days_left <= 30:
                expiring_soon += 1
        item["computed_status"] = computed_status
        result.append(item)
    return {
        "kpis": {
            "total_clients": len(result),
            "active_licenses": active_count,
            "expiring_soon_30d": expiring_soon,
            "arr_tnd": round(total_revenue, 3)
        },
        "licenses": result
    }

@app.post("/api/licenses")
def create_license(data: LicenseCreate):
    try:
        date.fromisoformat(data.expiration_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Format de date invalide (YYYY-MM-DD requis)")
    key = compute_license_key(data.module_code, data.hardware_id, data.expiration_date)
    conn = get_db()
    conn.execute("""
        INSERT INTO client_licenses (
            client_name, matricule_fiscal, contact_email, contact_phone,
            module_code, hardware_id, expiration_date, license_key,
            annual_fee_tnd, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
    """, (
        data.client_name.strip(),
        data.matricule_fiscal.strip(),
        data.contact_email.strip(),
        data.contact_phone.strip(),
        data.module_code.strip().upper(),
        data.hardware_id.strip().upper(),
        data.expiration_date,
        key,
        round(data.annual_fee_tnd, 3),
        datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ))
    conn.commit()
    conn.close()
    return {"message": "Licence générée et enregistrée", "license_key": key}

@app.post("/api/licenses/{lic_id}/renew")
def renew_license(lic_id: int, data: LicenseRenew):
    conn = get_db()
    row = conn.execute("SELECT * FROM client_licenses WHERE id = ?", (lic_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Licence introuvable")
    new_key = compute_license_key(row["module_code"], row["hardware_id"], data.new_expiration_date)
    fee = data.annual_fee_tnd if data.annual_fee_tnd is not None else row["annual_fee_tnd"]
    conn.execute("""
        UPDATE client_licenses
        SET expiration_date = ?, license_key = ?, annual_fee_tnd = ?, status = 'ACTIVE'
        WHERE id = ?
    """, (data.new_expiration_date, new_key, round(fee, 3), lic_id))
    conn.commit()
    conn.close()
    return {"message": "Abonnement renouvelé", "license_key": new_key}

@app.post("/api/licenses/{lic_id}/revoke")
def revoke_license(lic_id: int):
    conn = get_db()
    conn.execute("UPDATE client_licenses SET status = 'REVOKED' WHERE id = ?", (lic_id,))
    conn.commit()
    conn.close()
    return {"message": "Licence révoquée dans le CRM"}

@app.get("/safe-logo.png")
def serve_logo():
    logo_file = os.path.join(os.path.dirname(__file__), "safe-logo.png")
    return FileResponse(logo_file, media_type="image/png")

@app.get("/", response_class=HTMLResponse)
def dashboard_ui():
    return """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>SAFE ERP - CRM Éditeur & Administration des Licences</title>
<style>
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
  .container { max-width: 1280px; margin: auto; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { margin: 0; font-size: 22px; color: #38bdf8; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 16px; }
  .card-title { font-size: 12px; color: #94a3b8; text-transform: uppercase; }
  .card-val { font-size: 24px; font-weight: bold; margin-top: 6px; color: #f8fafc; }
  .grid-main { display: grid; grid-template-columns: 380px 1fr; gap: 24px; }
  label { display: block; font-size: 12px; color: #cbd5e1; margin-top: 10px; margin-bottom: 4px; }
  input, select { width: 100%; padding: 9px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #fff; box-sizing: border-box; }
  button { background: #0284c7; color: white; border: none; padding: 10px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; margin-top: 14px; width: 100%; }
  button:hover { background: #0369a1; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 10px; border-bottom: 1px solid #334155; text-align: left; }
  th { color: #94a3b8; font-weight: 600; }
  .badge { padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; }
  .ACTIVE { background: #065f46; color: #6ee7b7; }
  .EXPIRED { background: #991b1b; color: #fca5a5; }
  .REVOKED { background: #374151; color: #d1d5db; }
  .key-box { font-family: monospace; background: #0f172a; padding: 4px 6px; border-radius: 4px; color: #38bdf8; font-size: 12px; }
  .btn-sm { width: auto; margin: 0 4px 0 0; padding: 5px 9px; font-size: 11px; }
  .btn-warn { background: #d97706; }
  .btn-danger { background: #dc2626; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div>
      <h1>SAFE ERP — CRM Éditeur & Administration des Licences Matérielles</h1>
      <small style="color:#94a3b8">Suivi du parc clients Tunisie, Hardware IDs, Clés HMAC-SHA256 et Renouvellements</small>
    </div>
    <div style="text-align:right; font-size:12px; color:#38bdf8">Serveur Local Éditeur : http://localhost:8090</div>
  </div>

  <div class="kpis">
    <div class="card"><div class="card-title">Clients Enregistrés</div><div class="card-val" id="kpi-total">0</div></div>
    <div class="card"><div class="card-title">Licences Actives</div><div class="card-val" id="kpi-active" style="color:#34d399">0</div></div>
    <div class="card"><div class="card-title">Échéances &lt; 30 jours</div><div class="card-val" id="kpi-expiring" style="color:#fbbf24">0</div></div>
    <div class="card"><div class="card-title">Revenu Récurrent (TND)</div><div class="card-val" id="kpi-arr" style="color:#38bdf8">0.000</div></div>
  </div>

  <div class="grid-main">
    <div class="card">
      <h3 style="margin-top:0; color:#38bdf8">Nouvelle Licence Client</h3>
      <label>Raison Sociale / Client *</label>
      <input id="client_name" placeholder="Ex: Sté Tunisienne de Distribution SARL">
      <label>Matricule Fiscal (MF)</label>
      <input id="matricule_fiscal" placeholder="Ex: 1234567/A/M/000">
      <label>Email / Téléphone Contact</label>
      <input id="contact_email" placeholder="contact@client.tn | +216 71 000 000">
      <label>Progiciel SAFE ERP *</label>
      <select id="module_code">
        <option value="NEGOCE">01 - SAFE Négoce & Distribution</option>
        <option value="SERVICES">02 - SAFE Services & Cabinets</option>
        <option value="INDUSTRIE">03 - SAFE Industrie & Production</option>
        <option value="RESTAURATION">04 - SAFE Restauration & POS</option>
      </select>
      <label>Hardware ID du PC Client *</label>
      <input id="hardware_id" placeholder="Ex: HW-A4B9F12E8C01">
      <label>Date d'Expiration *</label>
      <input id="expiration_date" type="date" value="2027-12-31">
      <label>Redevance Annuelle (TND HT)</label>
      <input id="annual_fee_tnd" type="number" step="0.001" value="1200.000">
      <button onclick="createLicense()">Générer & Enregistrer la Clé</button>
      <div id="generated_msg" style="margin-top:12px; font-size:12px; color:#34d399; word-break:break-all;"></div>
    </div>

    <div class="card" style="overflow-x:auto">
      <h3 style="margin-top:0; color:#38bdf8">Parc des Licences & Abonnements</h3>
      <table>
        <thead>
          <tr>
            <th>Client & MF</th>
            <th>Progiciel</th>
            <th>Hardware ID</th>
            <th>Expiration</th>
            <th>Clé d'Activation</th>
            <th>Statut</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="lic_tbody"></tbody>
      </table>
    </div>
  </div>
</div>

<script>
async function loadLicenses() {
  const res = await fetch('/api/licenses');
  const data = await res.json();
  document.getElementById('kpi-total').innerText = data.kpis.total_clients;
  document.getElementById('kpi-active').innerText = data.kpis.active_licenses;
  document.getElementById('kpi-expiring').innerText = data.kpis.expiring_soon_30d;
  document.getElementById('kpi-arr').innerText = data.kpis.arr_tnd.toFixed(3) + ' TND';

  const tbody = document.getElementById('lic_tbody');
  tbody.innerHTML = '';
  data.licenses.forEach(l => {
    tbody.innerHTML += `<tr>
      <td><strong>${l.client_name}</strong><br><small style="color:#94a3b8">${l.matricule_fiscal || ''} ${l.contact_email || ''}</small></td>
      <td>${l.module_code}</td>
      <td><code>${l.hardware_id}</code></td>
      <td>${l.expiration_date}<br><small style="color:#94a3b8">${Number(l.annual_fee_tnd).toFixed(3)} TND</small></td>
      <td><span class="key-box">${l.license_key}</span></td>
      <td><span class="badge ${l.computed_status}">${l.computed_status}</span></td>
      <td>
        <button class="btn-sm" onclick="copyKey('${l.license_key}')">Copier</button>
        <button class="btn-sm btn-warn" onclick="renewLic(${l.id})">+1 An</button>
        <button class="btn-sm btn-danger" onclick="revokeLic(${l.id})">Révoquer</button>
      </td>
    </tr>`;
  });
}

async function createLicense() {
  const payload = {
    client_name: document.getElementById('client_name').value,
    matricule_fiscal: document.getElementById('matricule_fiscal').value,
    contact_email: document.getElementById('contact_email').value,
    module_code: document.getElementById('module_code').value,
    hardware_id: document.getElementById('hardware_id').value,
    expiration_date: document.getElementById('expiration_date').value,
    annual_fee_tnd: parseFloat(document.getElementById('annual_fee_tnd').value || 0)
  };
  if(!payload.client_name || !payload.hardware_id) { alert("Raison sociale et Hardware ID obligatoires."); return; }
  const res = await fetch('/api/licenses', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
  });
  const data = await res.json();
  if(res.ok) {
    document.getElementById('generated_msg').innerText = "Clé générée : " + data.license_key;
    loadLicenses();
  } else {
    alert(data.detail || "Erreur");
  }
}

function copyKey(k) {
  navigator.clipboard.writeText(k);
  alert("Clé copiée : " + k);
}

async function renewLic(id) {
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const iso = nextYear.toISOString().split('T')[0];
  const newDate = prompt("Nouvelle date d'expiration (YYYY-MM-DD) :", iso);
  if(!newDate) return;
  await fetch(`/api/licenses/${id}/renew`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({new_expiration_date: newDate})
  });
  loadLicenses();
}

async function revokeLic(id) {
  if(!confirm("Confirmer la révocation de cette licence dans votre registre CRM ?")) return;
  await fetch(`/api/licenses/${id}/revoke`, {method: 'POST'});
  loadLicenses();
}

loadLicenses();
</script>
</body>
</html>"""

def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def open_browser():
    time.sleep(1.2)
    webbrowser.open("http://localhost:8090")

if __name__ == "__main__":
    lan_ip = get_lan_ip()
    print("=================================================================")
    print("  SAFE ERP - CRM EDITEUR & ADMINISTRATION DES LICENCES")
    print("  Acces Localhost : http://localhost:8090")
    print(f"  Acces Reseau LAN: http://{lan_ip}:8090")
    print("=================================================================")
    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=8090, log_level="warning")
