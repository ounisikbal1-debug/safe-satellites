@echo off
chcp 65001 >nul
title SAFE ERP - Module 02 : Services & Cabinets Conseil (Port 8002)
cd /d "%~dp0backend"
python -m pip install --quiet fastapi uvicorn pydantic
python standalone_server.py
if errorlevel 1 pause
