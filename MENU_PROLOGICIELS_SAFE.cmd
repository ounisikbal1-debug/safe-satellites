@echo off
chcp 65001 >nul
title SAFE SUITE TUNISIE - Lanceur Central de Prologiciels Metiers
:MENU
cls
echo ===============================================================================
echo                SAFE SUITE TUNISIE - PROLOGICIELS METIERS 2026
echo             Conformes a la Legislation Tunisienne & aux Normes SCE
echo ===============================================================================
echo.
echo   Choisissez le Prologiciel Metier a lancer :
echo.
echo   [1] 🧾 SAFE Facturation           (Achats, Ventes, E-Facture TTN, Retenue RS)
echo   [2] 📦 SAFE Gestion des Stocks    (Multi-Depots, Valorisation PUMP, Douanes AT)
echo   [3] 💵 SAFE Paie Tunisie          (Moteur IRPP 8 tranches, CNSS 9.68%%, CSS)
echo   [4] 👔 SAFE Gestion RH            (Contrats CDI/CDD/CIVP, Conges Legaux, GPEC)
echo   [5] ⚖️ SAFE Comptabilite          (SCE, Balance 8 col, Declarations G50, IS)
echo   [6] ⚙️ SAFE Production GPAO       (Nomenclatures BOM, Ordres OF, MRP)
echo   [7] 🏢 SAFE Immobilisations       (Amortissements Lineaires & Degressifs DGI)
echo   [8] 🚀 SAFE PME Express (16 Ecrans - Facturation, Paie, TTN - Port 8006)
echo.
echo   [9] 🌐 SAFE ERP Global            (Suite Complete Integree - 28 Modules)
echo   [0] ❌ Quitter
echo.
echo ===============================================================================
set /p CHOIX="Entrez votre numero (1-9 ou 0) : "

if "%CHOIX%"=="1" (
    call "%~dp0SAFE_Facturation\Lancer_SAFE_Facturation.cmd"
    goto MENU
)
if "%CHOIX%"=="2" (
    call "%~dp0SAFE_Gestion_des_Stocks\Lancer_SAFE_Gestion_des_Stocks.cmd"
    goto MENU
)
if "%CHOIX%"=="3" (
    call "%~dp0SAFE_Paie\Lancer_SAFE_Paie.cmd"
    goto MENU
)
if "%CHOIX%"=="4" (
    call "%~dp0SAFE_Gestion_RH\Lancer_SAFE_Gestion_RH.cmd"
    goto MENU
)
if "%CHOIX%"=="5" (
    call "%~dp0SAFE_Comptabilite_Fiscalite\Lancer_SAFE_Comptabilite_Fiscalite.cmd"
    goto MENU
)
if "%CHOIX%"=="6" (
    call "%~dp0SAFE_Production_GPAO\Lancer_SAFE_Production_GPAO.cmd"
    goto MENU
)
if "%CHOIX%"=="7" (
    call "%~dp0SAFE_Immobilisations\Lancer_SAFE_Immobilisations.cmd"
    goto MENU
)
if "%CHOIX%"=="8" (
    start "" "%~dp0SAFE_PME_Express\Lancer_SAFE_PME_Express.cmd"
    goto MENU
)
if "%CHOIX%"=="9" (
    start http://localhost:3001/
    goto MENU
)
if "%CHOIX%"=="0" exit
goto MENU
