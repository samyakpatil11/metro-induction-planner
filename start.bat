@echo off
REM Double-click to start the Metro Induction Planner on Windows.
cd /d "%~dp0backend"
if not exist .venv (
  echo Setting things up for the first time, please wait...
  python -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install -q -r requirements.txt
python run.py %*
pause
