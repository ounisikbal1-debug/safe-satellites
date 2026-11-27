@echo off
chcp 65001 >nul
title SAFE ERP - Lanceur Multi-Logiciels Tunisie (Architecture Standalone)
cls
echo ===============================================================================
echo   ðŸ›¡ï¸ SAFE ERP - SUITE DE GESTION COMMERCIALE, SERVICES, INDUSTRIE & TRANSPORT
echo   Architecture Multi-Serveurs Standalone DÃ©diÃ©s par Logiciel
echo   Verrou MatÃ©riel Hardware ID & HMAC-SHA256 (SCE NC 01)
echo ===============================================================================
echo.
echo   Choisissez le logiciel SAFE Ã  dÃ©marrer :
echo.
echo   [1] SAFE NÃ©goce & Distribution Commerciale (Port 8001)
echo   [2] SAFE Services, Conseils & Cabinets (Port 8002)
echo   [3] SAFE Industrie & Production (Port 8003)
echo   [4] SAFE Restauration, CafÃ© & PÃ¢tisserie POS (Port 8004)
echo   [5] SAFE Transport Routier, Fret & Colis Express (Port 8005)
echo   [0] Console CRM Ã‰diteur & GÃ©nÃ©rateur de Licences MatÃ©rielles (Port 8080)
echo   [Q] Quitter
echo.
set /p choix="Entrez votre choix [1-5, 0, Q] : "

if "%choix%"=="1" (
    cd /d "%~dp001_SAFE_Negoce_Distribution"
    start LANCER_SAFE_ERP.bat
    exit
)
if "%choix%"=="2" (
    cd /d "%~dp002_SAFE_Services_Cabinets"
    start LANCER_SAFE_ERP.bat
    exit
)
if "%choix%"=="3" (
    cd /d "%~dp003_SAFE_Industrie_Production"
    start LANCER_SAFE_ERP.bat
    exit
)
if "%choix%"=="4" (
    cd /d "%~dp004_SAFE_Restauration_POS"
    start LANCER_SAFE_ERP.bat
    exit
)
if "%choix%"=="5" (
    cd /d "%~dp005_SAFE_Transport_Logistique"
    start LANCER_SAFE_TRANSPORT.bat
    exit
)
if "%choix%"=="0" (
    cd /d "%~dp000_SAFE_CRM_Editeur_Licences"
    start LANCER_CRM_LICENCES.bat
    exit
)
exit
