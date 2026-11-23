@echo off
chcp 65001 >nul
title SAFE PME Express 2.0 - 16 Modules de Gestion Tunisie (Port 8006)
cls
echo ===============================================================================
echo   SAFE PME Express 2.0 - Suite Complete PME Tunisie
echo   16 Ecrans : Ventes, Achats, Stock, Paie, Compta, TVA, Fiscalite, e-Fatoura
echo   Port Dedie : 8006 ^| Conforme Fiscalite & Normes Tunisiennes
echo ===============================================================================
echo.
cd /d "%~dp0"

echo [1/3] Verification des dependances Python...
python -m pip install --quiet fastapi uvicorn pydantic python-multipart >nul 2>&1

echo [2/3] Ouverture de l'interface dans votre navigateur...
start http://localhost:8006

echo [3/3] Demarrage du serveur autonome SAFE PME Express sur le port 8006...
echo.
echo    Interface accessible a l'adresse : http://localhost:8006
echo    (Appuyez sur Ctrl+C pour arreter le serveur)
echo.
python standalone_pme_server.py
if errorlevel 1 (
    echo.
    echo [ERREUR] Impossible de lancer le serveur autonome SAFE PME Express.
    pause
)
