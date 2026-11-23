@echo off
title SAFE ERP - CRM Editeur & Licences
echo Installation des dependances rapides (FastAPI, Uvicorn)...
python -m pip install --quiet fastapi uvicorn pydantic
echo Demarrage du Tableau de Bord CRM Editeur sur http://localhost:8090 ...
python crm_licences_server.py
pause
