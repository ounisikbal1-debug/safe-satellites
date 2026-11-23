@echo off
title Compilation Executable Windows - SAFE Restauration & POS
python -m pip install --quiet pyinstaller fastapi uvicorn pydantic
pyinstaller --onefile --name "SAFE_RESTAURATION" backend\standalone_server.py
echo Executable genere dans le dossier dist\SAFE_RESTAURATION.exe
pause
