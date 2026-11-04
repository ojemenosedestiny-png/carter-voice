@echo off
title CARTER
cd /d "%~dp0"
set "CARTER_OPEN=http://localhost:5180"
if defined CARTER_WEB_URL set "CARTER_OPEN=%CARTER_WEB_URL%"
start "" cmd /c "timeout /t 12 >nul & start %CARTER_OPEN%"
npm start
