@echo off
chcp 65001 >nul
title SAFE ERP - Suite Master (Serveur Unifié Port 8000)
cls
echo ===============================================================================
echo        SAFE ERP - SUITE MASTER (SERVEUR UNIFIÉ TOUT-EN-UN) - PORT 8000
echo ===============================================================================
echo.
echo Vérification des dépendances...
python -m pip install --quiet fastapi uvicorn pydantic >nul 2>&1

echo Démarrage du Serveur SAFE Suite Master sur http://localhost:8000 ...
start http://localhost:8000/
cd /d "%~dp0"
python unified_suite_server.py
pause
