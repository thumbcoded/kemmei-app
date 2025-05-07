@echo off
cd /d %~dp0
echo Starting local server at http://localhost:5500/
py -m http.server 5500
pause

