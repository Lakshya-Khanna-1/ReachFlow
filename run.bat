@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=19)?0:1)"
if errorlevel 1 goto missing
node scripts\launch.mjs
if errorlevel 1 pause
exit /b
:missing
echo Install Node.js LTS ^(at least 20.19^) from https://nodejs.org/
set /p installnode="Install with winget now? [y/N]: "
if /i "%installnode%"=="y" winget install OpenJS.NodeJS.LTS
echo After installing, close this window and double-click run.bat again.
pause
