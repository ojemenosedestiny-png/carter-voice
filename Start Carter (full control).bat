@echo off
title CARTER - FULL CONTROL
cd /d "%~dp0"
echo Carter is starting with FULL CONTROL: it can run commands, change files,
echo send messages and operate this computer when you ask it to.
start "" cmd /c "timeout /t 12 >nul & start http://localhost:5173"
npm run start:writes
