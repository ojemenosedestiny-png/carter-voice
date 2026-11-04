@echo off
title CARTER
cd /d "%~dp0"
set "CARTER_OPEN=http://localhost:5180"
start "" cmd /c "timeout /t 12 >nul & start %CARTER_OPEN%"
call npm start
echo.
echo Carter has stopped. Read the messages above, then press any key to close.
pause
