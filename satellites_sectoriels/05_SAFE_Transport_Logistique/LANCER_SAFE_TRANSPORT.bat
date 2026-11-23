@echo off
chcp 65001 >nul
title SAFE ERP - Module 05 : Transport, Fret & Livraison de Colis Express (Port 8005)
cd /d "%~dp0backend"
python -m pip install --quiet fastapi uvicorn pydantic
python standalone_server.py
if errorlevel 1 pause
