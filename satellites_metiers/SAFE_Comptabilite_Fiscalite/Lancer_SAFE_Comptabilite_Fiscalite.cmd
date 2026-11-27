@echo off
chcp 65001 >nul
title SAFE Comptabilite Generale et Fiscalite Tunisienne - SAFE Suite Tunisie
cls
echo ===============================================================================
echo   SAFE Comptabilite Generale et Fiscalite Tunisienne
echo   Systeme Comptable des Entreprises (SCE), Grand Livre, Balance 8 col, G50
echo   Version 1.0.0 ^| Conforme Legislation Tunisienne
echo ===============================================================================
echo.
echo Initialisation du service en local...

set "CORE_DIR=%~dp0..\SAFE_Grandes_Entreprises"
if not exist "%CORE_DIR%\LANCER_SAFE_ERP_LOCAL.ps1" (
    set "CORE_DIR=C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4\SAFE_Grandes_Entreprises"
)

if not exist "%CORE_DIR%\LANCER_SAFE_ERP_LOCAL.ps1" (
    echo [ERREUR] Le noyau SAFE ERP est introuvable dans : %CORE_DIR%
    pause
    exit /b 1
)

cd /d "%CORE_DIR%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\LANCER_SAFE_ERP_LOCAL.ps1" -App "comptabilite"
if errorlevel 1 (
    echo.
    echo [ERREUR] Erreur lors du demarrage du prologiciel.
    pause
)

