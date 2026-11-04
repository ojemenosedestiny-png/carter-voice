@echo off
title CARTER - PHONE + FULL CONTROL
cd /d "%~dp0"
echo Carter is starting for your PHONE with FULL CONTROL: it can run commands,
echo change files and operate this computer when you ask it to.
echo Keep your phone locked - anyone holding it unlocked could control this PC.
npm run start:phone-writes
