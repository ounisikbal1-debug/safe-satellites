@echo off
title Compilation Executable Windows - SAFE Négoce & Distribution
python -m pip install --quiet pyinstaller fastapi uvicorn pydantic
pyinstaller --onefile --name "SAFE_NEGOCE" backend\standalone_server.py
echo Executable genere dans le dossier dist\SAFE_NEGOCE.exe
pause
