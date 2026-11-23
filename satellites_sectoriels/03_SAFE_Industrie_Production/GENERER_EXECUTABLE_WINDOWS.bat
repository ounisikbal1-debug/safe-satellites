@echo off
title Compilation Executable Windows - SAFE Industrie & Production
python -m pip install --quiet pyinstaller fastapi uvicorn pydantic
pyinstaller --onefile --name "SAFE_INDUSTRIE" backend\standalone_server.py
echo Executable genere dans le dossier dist\SAFE_INDUSTRIE.exe
pause
