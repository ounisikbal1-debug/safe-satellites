@echo off
chcp 65001 >nul
title SAFE ERP - Transport, Fret & Colis Express (Port 8005)
cd /d "%~dp0backend"
python -m pip install --quiet fastapi uvicorn pydantic
python standalone_server.py
if errorlevel 1 pause
