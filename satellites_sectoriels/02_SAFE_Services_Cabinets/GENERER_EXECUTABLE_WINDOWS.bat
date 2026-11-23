@echo off
title Compilation Executable Windows - SAFE Services & Cabinets
python -m pip install --quiet pyinstaller fastapi uvicorn pydantic
pyinstaller --onefile --name "SAFE_SERVICES" backend\standalone_server.py
echo Executable genere dans le dossier dist\SAFE_SERVICES.exe
pause
