@echo off
REM Update and Restart proPACE Service Script
REM This script pulls latest code, rebuilds, clears logs, and restarts the service

echo ========================================
echo proPACE Update and Restart Script
echo ========================================
echo.

cd C:\proPACE

echo [1/6] Clearing old logs...
if exist "logs\service-stdout.log" (
    del /f /q "logs\service-stdout.log"
    echo Old log file deleted
) else (
    echo No old log file found
)
echo.

echo [2/6] Pulling latest code from GitHub...
git pull
if %errorlevel% neq 0 (
    echo ERROR: Git pull failed
    pause
    exit /b 1
)
echo.

echo [3/6] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)
echo.

echo [4/6] Building TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)
echo.

echo [5/6] Restarting proPACE service...
nssm restart proPACE
if %errorlevel% neq 0 (
    echo ERROR: Service restart failed
    pause
    exit /b 1
)
echo.

echo [6/6] Waiting for service to start...
timeout /t 3 /nobreak >nul
echo.

echo ========================================
echo Update complete! Service restarted.
echo ========================================
echo.
echo You can now check the logs with:
echo   Get-Content C:\proPACE\logs\service-stdout.log -Wait
echo.
echo Or view the last 50 lines:
echo   Get-Content C:\proPACE\logs\service-stdout.log -Tail 50
echo.

pause
