@echo off
title CARTER - LINK LAPTOP (read-only)
cd /d "%~dp0"
echo Linking this laptop to Carter in the cloud. Keep this window open (you can minimise it).
call npm run laptop
echo.
echo The laptop link has stopped. Read the messages above, then press any key to close.
pause
