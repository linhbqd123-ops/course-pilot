@echo off
REM Browser Course Completion Agent Launcher
REM This batch file runs the bundled application

echo 🚀 Starting Browser Course Completion Agent...
echo.

REM Change to the script directory
cd /d "%~dp0"

REM Run the bundled application
node "dist\bundle\index.js"

REM Pause if there was an error
if %errorlevel% neq 0 (
    echo.
    echo ❌ An error occurred. Press any key to exit...
    pause > nul
)