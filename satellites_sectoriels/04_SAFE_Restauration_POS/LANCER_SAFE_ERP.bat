@echo off
chcp 65001 >nul
title SAFE ERP - Module 04 : Restauration & POS (Port 8004)
cd /d "%~dp0backend"
python -m pip install --quiet fastapi uvicorn pydantic
python standalone_server.py
if errorlevel 1 pause
