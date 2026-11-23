@echo off
title Compilation Executable Windows - SAFE Transport & Logistique
pip install pyinstaller fastapi uvicorn pydantic --quiet
pyinstaller --onefile --name "SAFE_Transport_Logistique" --add-data "web_dist;web_dist" backend\standalone_server.py
echo Executable genere dans le dossier dist\SAFE_Transport_Logistique.exe
pause
