@echo off
chcp 65001 >nul
title SAFE Paie Tunisienne et Declarations Sociales - SAFE Suite Tunisie
cls
echo ===============================================================================
echo   SAFE Paie Tunisienne et Declarations Sociales
echo   Moteur de paie tunisien, bareme IRPP 8 tranches, CNSS 9.68%, CSS
echo   Version 1.0.0 ^| Conforme Legislation Tunisienne
echo ===============================================================================
echo.
echo Initialisation du service en local...

set "CORE_DIR=%~dp0..\SAFE_ERP_DRAFT 3"
if not exist "%CORE_DIR%\LANCER_SAFE_ERP_LOCAL.ps1" (
    set "CORE_DIR=C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4\SAFE_ERP_DRAFT 3"
)

if not exist "%CORE_DIR%\LANCER_SAFE_ERP_LOCAL.ps1" (
    echo [ERREUR] Le noyau SAFE ERP est introuvable dans : %CORE_DIR%
    pause
    exit /b 1
)

cd /d "%CORE_DIR%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\LANCER_SAFE_ERP_LOCAL.ps1" -App "paie"
if errorlevel 1 (
    echo.
    echo [ERREUR] Erreur lors du demarrage du prologiciel.
    pause
)
