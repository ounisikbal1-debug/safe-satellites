@echo off
chcp 65001 >nul
title SAFE SUITE TUNISIE 2026 - Lanceur Central Unifié
:MENU
cls
echo ===============================================================================
echo                SAFE SUITE TUNISIE - CATALOGUE DES LOGICIELS 2026
echo             Conformes à la Législation Tunisienne & aux Normes SCE
echo ===============================================================================
echo.
echo  --- 1. PROGICIELS METIERS CIBLES (SUR NOYAU SAFE ERP DRAFT 3 - PORT 3001) ---
echo   [1]  🧾 SAFE Facturation        (Achats, Ventes, Retenues RS, e-Fatoura)
echo   [2]  📦 SAFE Gestion des Stocks (Multi-Dépôts, PUMP, Inventaires)
echo   [3]  💵 SAFE Paie Tunisie       (IRPP 8 tranches, CNSS 9.68%% / 17.07%%, CSS)
echo   [4]  👔 SAFE Gestion RH         (Contrats, Congés, Documents du personnel)
echo   [5]  ⚖️  SAFE Comptabilité       (SCE, Balance 8 col, Grand Livre, G50)
echo   [6]  ⚙️  SAFE Production GPAO    (Nomenclatures BOM, Ordres OF, Ateliers)
echo   [7]  🏢 SAFE Immobilisations    (Amortissements Linéaires & Dégressifs)
echo.
echo  --- 2. SOLUTIONS SECTORIELLES AUTONOMES & PME EXPRESS ---
echo   [8]  🚀 SAFE PME Express 2.0    (18 Modules tout-en-un - Port 8006)
echo   [9]  🛒 SAFE Négoce & Distrib.  (Tarifs dégressifs, ADV, Marges - Port 8001)
echo   [10] 💼 SAFE Services & Cabinets (Facturation temps/forfait, Projets - Port 8002)
echo   [11] 🏭 SAFE Industrie Manuf.   (Calcul besoins, Planif. atelier - Port 8003)
echo   [12] 🍽️ SAFE Restauration POS   (Point de Vente tactile, Tables, Bar - Port 8004)
echo   [13] 🚛 SAFE Transport & Colis  (Flotte, Lettres de voiture, Messagerie - Port 8005)
echo.
echo  --- 3. NOYAU GLOBAL & OUTILS EDITEUR ---
echo   [14] 🌐 SAFE ERP Global Core    (Suite Intégrée Complète - Port 3001)
echo   [15] 🔑 SAFE CRM Éditeur & Clés (Générateur Licences HMAC Hardware ID - Port 8090)
echo   [16] 🏛️ SAFE Suite Master       (Serveur Unifié All-in-One - Port 8000)
echo.
echo   [0]  ❌ Quitter
echo ===============================================================================
set /p CHOIX="Entrez votre numéro (0 à 16) : "

REM Détection du dossier de base
set "BASE_DIR=%~dp0"
if not exist "%BASE_DIR%SAFE_ERP_DRAFT 3" (
    if exist "%BASE_DIR%SAFE_ERP_DRAFT 4\SAFE_ERP_DRAFT 3" (
        set "BASE_DIR=%BASE_DIR%SAFE_ERP_DRAFT 4\"
    )
)

if "%CHOIX%"=="1" (
    call "%BASE_DIR%SAFE_ERP_DRAFT 3\satellites_metiers\SAFE_Facturation\Lancer_SAFE_Facturation.cmd"
    goto MENU
)
if "%CHOIX%"=="2" (
    call "%BASE_DIR%SAFE_ERP_DRAFT 3\satellites_metiers\SAFE_Gestion_des_Stocks\Lancer_SAFE_Gestion_des_Stocks.cmd"
    goto MENU
)
if "%CHOIX%"=="3" (
    call "%BASE_DIR%SAFE_ERP_DRAFT 3\satellites_metiers\SAFE_Paie\Lancer_SAFE_Paie.cmd"
    goto MENU
)
if "%CHOIX%"=="4" (
    call "%BASE_DIR%SAFE_ERP_DRAFT 3\satellites_metiers\SAFE_Gestion_RH\Lancer_SAFE_Gestion_RH.cmd"
    goto MENU
)
if "%CHOIX%"=="5" (
    call "%BASE_DIR%SAFE_ERP_DRAFT 3\satellites_metiers\SAFE_Comptabilite_Fiscalite\Lancer_SAFE_Comptabilite_Fiscalite.cmd"
    goto MENU
)
if "%CHOIX%"=="6" (
    call "%BASE_DIR%SAFE_ERP_DRAFT 3\satellites_metiers\SAFE_Production_GPAO\Lancer_SAFE_Production_GPAO.cmd"
    goto MENU
)
if "%CHOIX%"=="7" (
    call "%BASE_DIR%SAFE_ERP_DRAFT 3\satellites_metiers\SAFE_Immobilisations\Lancer_SAFE_Immobilisations.cmd"
    goto MENU
)
if "%CHOIX%"=="8" (
    start "" "%BASE_DIR%SAFE_PME_Express\Lancer_SAFE_PME_Express.cmd"
    goto MENU
)
if "%CHOIX%"=="9" (
    start "" "%BASE_DIR%SAFE_ERP_DRAFT 3\satellites_sectoriels\01_SAFE_Negoce_Distribution\LANCER_SAFE_ERP.bat"
    goto MENU
)
if "%CHOIX%"=="10" (
    start "" "%BASE_DIR%SAFE_ERP_DRAFT 3\satellites_sectoriels\02_SAFE_Services_Cabinets\LANCER_SAFE_ERP.bat"
    goto MENU
)
if "%CHOIX%"=="11" (
    start "" "%BASE_DIR%SAFE_ERP_DRAFT 3\satellites_sectoriels\03_SAFE_Industrie_Production\LANCER_SAFE_ERP.bat"
    goto MENU
)
if "%CHOIX%"=="12" (
    start "" "%BASE_DIR%SAFE_ERP_DRAFT 3\satellites_sectoriels\04_SAFE_Restauration_POS\LANCER_SAFE_ERP.bat"
    goto MENU
)
if "%CHOIX%"=="13" (
    start "" "%BASE_DIR%SAFE_ERP_DRAFT 3\satellites_sectoriels\05_SAFE_Transport_Logistique\LANCER_SAFE_TRANSPORT.bat"
    goto MENU
)
if "%CHOIX%"=="14" (
    start http://localhost:3001/
    goto MENU
)
if "%CHOIX%"=="15" (
    start "" "%BASE_DIR%SAFE_ERP_DRAFT 3\satellites_sectoriels\00_SAFE_CRM_Editeur_Licences\LANCER_CRM_LICENCES.bat"
    goto MENU
)
if "%CHOIX%"=="16" (
    start "SAFE Suite Master (Port 8000)" cmd /c "call "%BASE_DIR%Lancer_SAFE_Suite_Master.cmd""
    goto MENU
)
if "%CHOIX%"=="0" exit
goto MENU
