@echo off
setlocal
cd /d "%~dp0"
title Teoria Workflow - demonstracao

where node >nul 2>nul
if errorlevel 1 goto nonode

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto oldnode

set SEED_DEMO=1
set DATA_DIR=%~dp0data-demo
set PORT=3000
set APP_URL=http://localhost:3000

echo.
echo  Teoria Workflow (demonstracao)
echo  ------------------------------------------------------------
echo  Vai abrir no browser em http://localhost:3000
echo  Entra com:  ana@exemplo.pt   palavra-passe:  demo1234
echo  (tambem existem bruno@exemplo.pt e carla@exemplo.pt)
echo.
echo  Deixa esta janela aberta. Fecha-a (ou Ctrl+C) para parar.
echo  ------------------------------------------------------------
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
node server.js
echo.
pause
exit /b 0

:nonode
echo.
echo  Nao encontrei o Node.js neste computador.
echo  Instala a versao 22.13 ou superior (LTS) em https://nodejs.org e volta a abrir este ficheiro.
echo.
pause
exit /b 1

:oldnode
echo.
echo  O Node.js instalado e demasiado antigo. E preciso a versao 22.13 ou superior.
echo  Atualiza em https://nodejs.org e volta a abrir este ficheiro.
echo.
pause
exit /b 1
