@echo off
echo Starting Work Tracker AI...

:: Change to the script's directory
cd /d "%~dp0"

:: Check if node_modules exists, if not run npm install
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)

:: Start the Electron app
npm start

:: If there's an error, pause to show the message
if errorlevel 1 (
    echo Error starting Work Tracker AI
    pause
    exit /b 1
)