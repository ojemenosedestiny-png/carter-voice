@echo off
title CARTER - Link WhatsApp
cd /d "%~dp0"
echo Scan the QR code below with WhatsApp on your phone:
echo   WhatsApp - Settings - Linked devices - Link a device
echo When it says "connected", close this window and start Carter normally.
call npm run whatsapp
echo.
echo Carter has stopped. Read the messages above, then press any key to close.
pause
