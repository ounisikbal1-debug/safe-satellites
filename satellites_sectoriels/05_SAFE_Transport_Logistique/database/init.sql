-- ============================================================================
-- SAFE ERP - MODULE 05 : TRANSPORT & LOGISTIQUE DE MARCHANDISES (TUNISIE)
-- Normes comptables tunisiennes (NC 01), Millimes NUMERIC(15,3), TVA Transport 7%/19%
-- ============================================================================

CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    plate_number VARCHAR(30) UNIQUE NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL, -- Poids Lourd, Semi-Remorque, Utilitaire
    driver_name VARCHAR(100) NOT NULL,
    capacity_tons NUMERIC(10,3) DEFAULT 0.000,
    insurance_expiry DATE,
    visit_tech_expiry DATE,
    status VARCHAR(20) DEFAULT 'DISPONIBLE'
);

CREATE TABLE IF NOT EXISTS transport_orders (
    id SERIAL PRIMARY KEY,
    waybill_number VARCHAR(50) UNIQUE NOT NULL, -- Lettre de Voiture / Bon de Transport
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    client_name VARCHAR(150) NOT NULL,
    client_mf VARCHAR(30),
    origin_city VARCHAR(80) NOT NULL,
    destination_city VARCHAR(80) NOT NULL,
    cargo_description VARCHAR(200),
    weight_tons NUMERIC(10,3) DEFAULT 0.000,
    vehicle_id INTEGER REFERENCES vehicles(id),
    freight_ht NUMERIC(15,3) NOT NULL DEFAULT 0.000,
    fuel_surcharge_ht NUMERIC(15,3) NOT NULL DEFAULT 0.000,
    vat_rate NUMERIC(5,2) NOT NULL DEFAULT 7.00, -- 7% Transport marchandises en Tunisie (ou 19% prestations annexes)
    vat_amount NUMERIC(15,3) NOT NULL DEFAULT 0.000,
    stamp_duty NUMERIC(15,3) NOT NULL DEFAULT 1.000,
    withholding_tax_rate NUMERIC(5,2) NOT NULL DEFAULT 1.00, -- RS 1% ou 3% selon rÃ©gime
    withholding_tax_amount NUMERIC(15,3) NOT NULL DEFAULT 0.000,
    total_ttc NUMERIC(15,3) NOT NULL DEFAULT 0.000,
    net_payable NUMERIC(15,3) NOT NULL DEFAULT 0.000,
    fuel_cost NUMERIC(15,3) NOT NULL DEFAULT 0.000,
    toll_cost NUMERIC(15,3) NOT NULL DEFAULT 0.000,
    driver_allowance NUMERIC(15,3) NOT NULL DEFAULT 0.000,
    trip_margin NUMERIC(15,3) NOT NULL DEFAULT 0.000,
    ttn_uuid VARCHAR(100),
    status VARCHAR(20) DEFAULT 'EN_COURS' -- PLANIFIE, EN_COURS, LIVRE, FACTURE
);

INSERT INTO vehicles (plate_number, vehicle_type, driver_name, capacity_tons, status) VALUES
('198 TN 4521', 'Semi-Remorque 24T', 'Mohamed Ben Ali', 24.000, 'EN_MISSION'),
('215 TN 8810', 'Camion Frigorifique 12T', 'Sami Trabelsi', 12.000, 'DISPONIBLE'),
('224 TN 1094', 'Utilitaire Isuzu 3.5T', 'Walid Gharbi', 3.500, 'DISPONIBLE');
