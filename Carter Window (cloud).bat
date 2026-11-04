@echo off
title Carter window
rem Opens Carter (running on Render) in its own window that starts listening
rem by itself - just say "Hey Carter". Put a shortcut to this file in
rem shell:startup to have Carter ready every time you log in.
if not defined CARTER_CLOUD_URL goto setup
if not defined CARTER_ACCESS_KEY goto setup
set "LINK=%CARTER_CLOUD_URL%/?autostart#bridge=self&key=%CARTER_ACCESS_KEY%"
set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER%" goto plain
rem Its own browser profile, so it can start talking without a click and
rem remembers the microphone permission you give it the first time.
start "" "%BROWSER%" --app="%LINK%" --user-data-dir="%LocalAppData%\CarterWindow" --autoplay-policy=no-user-gesture-required --window-size=1100,760
exit /b
:plain
start "" "%LINK%"
exit /b
:setup
echo Carter's cloud address and access key are not set yet. Run these once in
echo PowerShell (with your own address and key), then open this file again:
echo.
echo   setx CARTER_CLOUD_URL "https://carter-yxnu.onrender.com"
echo   setx CARTER_ACCESS_KEY "your-CARTER_ACCESS_KEY-from-Render"
echo.
pause
