@echo off
rem The thing a child double-clicks at home. Lives at the ROOT of the drive, because the
rem alternative is asking an eight year old to find bin\win\launcher.exe.
rem
rem cd /d "%~dp0" is what makes the drive portable: it moves to the folder this file is
rem in, whatever letter Windows assigned the drive this time. Without it, double-clicking
rem from Explorer can start in C:\Windows\System32 and nothing is found.
title Tessera Quest
cd /d "%~dp0"

echo.
echo   Starting Tessera Quest...
echo.
echo   Your browser will open by itself in a moment.
echo   Keep this window open while you play, and close it when you're done.
echo.

"bin\win\launcher.exe"

rem Only reached if the launcher exits. If it failed, the window must stay open long
rem enough to read why -- otherwise the console vanishes instantly and the report is
rem "I clicked it and nothing happened", which is impossible to act on.
if errorlevel 1 (
  echo.
  echo   Tessera Quest stopped unexpectedly. The message above says why.
  echo.
  pause
)
