@echo off
title CARTER - FULL CONTROL
cd /d "%~dp0"
echo Carter is starting with FULL CONTROL: it can run commands, change files,
echo send messages and operate this computer when you ask it to.
set "CARTER_OPEN=http://localhost:5180"
start "" cmd /c "timeout /t 12 >nul & start %CARTER_OPEN%"
call npm run start:writes
echo.
echo Carter has stopped. Read the messages above, then press any key to close.
pause
