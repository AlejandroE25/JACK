@echo off
setlocal enabledelayedexpansion
REM Windows Rebuild Script for proPACE
REM This script verifies dependencies, builds the project, and restarts the service

echo.
echo === proPACE Windows Rebuild ===
echo This will verify, build, and restart the proPACE service
echo.

REM Check if we're in the right directory
if not exist "package.json" (
    echo ERROR: package.json not found. Please run this script from the proPACE directory.
    echo Example: cd C:\proPACE
    echo          scripts\rebuild-windows.cmd
    echo.
    exit /b 1
)

REM Step 1: Verify critical dependencies
echo [1/3] Verifying critical dependencies...

set ALL_DEPS_OK=1

call :check_dep "@types/node"
call :check_dep "@anthropic-ai/sdk"
call :check_dep "better-sqlite3"
call :check_dep "ws"
call :check_dep "dotenv"
call :check_dep "boxen"
call :check_dep "chalk"

if %ALL_DEPS_OK%==0 (
    echo.
    echo       ERROR: Missing dependencies detected!
    echo       Please check npm install output above
    echo.
    exit /b 1
)

echo       * All critical dependencies present
echo.

REM Step 2: Build the project
echo [2/3] Building TypeScript project...
echo       Running: npm run build

npm run build

if errorlevel 1 (
    echo       ERROR during build
    exit /b 1
)

echo       * Build complete
echo.

REM Step 3: Restart the service
echo [3/3] Restarting proPACE service...

REM Check if NSSM is available
where nssm >nul 2>&1
if errorlevel 1 (
    echo.
    echo WARNING: NSSM not found in PATH
    echo Skipping service restart
    echo Please restart the service manually: nssm restart proPACE
    echo.
    goto :skip_restart
)

REM Check if service exists
sc query proPACE >nul 2>&1
if errorlevel 1 (
    echo.
    echo WARNING: proPACE service not found
    echo Skipping service restart
    echo If you want to run as a service, use: scripts\install-service-windows.cmd
    echo.
    goto :skip_restart
)

REM Restart the service
nssm restart proPACE
if errorlevel 1 (
    echo       WARNING: Failed to restart service
    echo       You may need to run this script as Administrator
    echo       Or restart manually: nssm restart proPACE
) else (
    timeout /t 2 /nobreak >nul
    for /f "tokens=*" %%a in ('nssm status proPACE') do set SERVICE_STATUS=%%a
    echo       * Service restarted: !SERVICE_STATUS!
)

:skip_restart

REM Success!
echo.
echo === Rebuild Complete! ===
echo.
echo Your proPACE project has been rebuilt and the service restarted.
echo.

exit /b 0

REM Function to check if dependency exists
:check_dep
npm list %~1 >nul 2>&1
if errorlevel 1 (
    echo       X %~1 MISSING
    set ALL_DEPS_OK=0
) else (
    echo       * %~1
)
exit /b 0
