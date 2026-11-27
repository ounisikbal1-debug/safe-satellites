@echo off
chcp 65001 >nul
title SAFE ERP - Module 03 : Industrie & Production (Port 8003)
cd /d "%~dp0backend"
python -m pip install --quiet fastapi uvicorn pydantic
python standalone_server.py
if errorlevel 1 pause
