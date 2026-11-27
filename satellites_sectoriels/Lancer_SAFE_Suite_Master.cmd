@echo off
chcp 65001 >nul
title SAFE ERP - Suite Master (Port 8000)
cls
echo ===============================================================================
echo        SAFE ERP - SUITE MASTER (SERVEUR UNIFIÃ‰ TOUT-EN-UN) - PORT 8000
echo ===============================================================================
echo.

set "SCRIPT_DIR=%~dp0"

REM Recherche intelligente du script unified_suite_server.py
if exist "%SCRIPT_DIR%unified_suite_server.py" (
    set "TARGET=%SCRIPT_DIR%unified_suite_server.py"
    set "WORK_DIR=%SCRIPT_DIR%"
) else if exist "%SCRIPT_DIR%SAFE_ERP_DRAFT 4\SAFE_Grandes_Entreprises\satellites_sectoriels\unified_suite_server.py" (
    set "TARGET=%SCRIPT_DIR%SAFE_ERP_DRAFT 4\SAFE_Grandes_Entreprises\satellites_sectoriels\unified_suite_server.py"
    set "WORK_DIR=%SCRIPT_DIR%SAFE_ERP_DRAFT 4\SAFE_Grandes_Entreprises\satellites_sectoriels"
) else if exist "%SCRIPT_DIR%SAFE_Grandes_Entreprises\satellites_sectoriels\unified_suite_server.py" (
    set "TARGET=%SCRIPT_DIR%SAFE_Grandes_Entreprises\satellites_sectoriels\unified_suite_server.py"
    set "WORK_DIR=%SCRIPT_DIR%SAFE_Grandes_Entreprises\satellites_sectoriels"
) else if exist "%SCRIPT_DIR%..\SAFE_Grandes_Entreprises\satellites_sectoriels\unified_suite_server.py" (
    set "TARGET=%SCRIPT_DIR%..\SAFE_Grandes_Entreprises\satellites_sectoriels\unified_suite_server.py"
    set "WORK_DIR=%SCRIPT_DIR%..\SAFE_Grandes_Entreprises\satellites_sectoriels"
) else if exist "C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4\SAFE_Grandes_Entreprises\satellites_sectoriels\unified_suite_server.py" (
    set "TARGET=C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4\SAFE_Grandes_Entreprises\satellites_sectoriels\unified_suite_server.py"
    set "WORK_DIR=C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4\SAFE_Grandes_Entreprises\satellites_sectoriels"
) else (
    echo [ERREUR CRITIQUE] Fichier unified_suite_server.py introuvable !
    echo Verifiez l'emplacement du fichier et reessayez.
    pause
    exit /b 1
)

cd /d "%WORK_DIR%"
echo Repertoire de travail : %WORK_DIR%
echo Fichier serveur        : %TARGET%
echo.
echo Verification des modules Python requis (FastAPI, Uvicorn, Pydantic)...
python -m pip install --quiet fastapi uvicorn pydantic >nul 2>&1

echo Demarrage du serveur SAFE Suite Master...
echo (Le navigateur va s'ouvrir automatiquement sur http://localhost:8000)
echo.

python "%TARGET%"

if errorlevel 1 (
    echo.
    echo ===============================================================================
    echo [ERREUR] Le serveur s'est arrete avec une erreur.
    echo ===============================================================================
    pause
)

