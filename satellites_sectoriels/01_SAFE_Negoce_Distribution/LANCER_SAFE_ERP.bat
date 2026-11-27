@echo off
chcp 65001 >nul
title SAFE ERP - Module 01 : Négoce & Distribution (Port 8001)
cd /d "%~dp0backend"
python -m pip install --quiet fastapi uvicorn pydantic
python standalone_server.py
if errorlevel 1 pause
