@echo off
title CARTER
cd /d "%~dp0"
start "" cmd /c "timeout /t 12 >nul & start http://localhost:5173"
npm start
