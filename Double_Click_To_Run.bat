@echo off
title Wholeup Website Server
echo ===================================================
echo     Starting Wholeup Digital Marketing Website...
echo ===================================================
echo.
echo [1/2] Opening the website in your default browser...
start http://localhost:3000
echo.
echo [2/2] Starting the Node.js AI Server...
echo.
node server.js
pause
