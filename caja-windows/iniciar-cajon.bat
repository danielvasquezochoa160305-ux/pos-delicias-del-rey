@echo off
REM Inicia el ayudante del cajon monedero (Delicias del Rey).
REM Doble clic para arrancarlo. Deja la ventana abierta (puedes minimizarla).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0abrir-cajon.ps1"
pause
