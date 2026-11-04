@echo off
title CARTER - PHONE
cd /d "%~dp0"
echo Carter is starting for your PHONE. Scan the QR code that appears below.
call npm run start:phone
echo.
echo Carter has stopped. Read the messages above, then press any key to close.
pause
