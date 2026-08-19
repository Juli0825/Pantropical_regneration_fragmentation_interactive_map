@echo off
set PYTHONHOME=C:\Program Files\QGIS 3.20.0\apps\Python39
set PYTHONPATH=C:\Program Files\QGIS 3.20.0\apps\Python39\lib;C:\Program Files\QGIS 3.20.0\apps\Python39\DLLs
cd /d "%~dp0"
echo Starting the Chapter 2 paper map server at http://localhost:8766 ...
start "" http://localhost:8766/index.html
"C:\Program Files\QGIS 3.20.0\bin\python3.exe" scripts\serve.py
