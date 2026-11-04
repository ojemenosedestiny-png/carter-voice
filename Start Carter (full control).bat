@echo off
title CARTER - FULL CONTROL
cd /d "%~dp0"
echo Carter is starting with FULL CONTROL: it can run commands, change files,
echo send messages and operate this computer when you ask it to.
set "CARTER_OPEN=http://localhost:5180"
if defined CARTER_WEB_URL set "CARTER_OPEN=%CARTER_WEB_URL%"
start "" cmd /c "timeout /t 12 >nul & start %CARTER_OPEN%"
npm run start:writes
