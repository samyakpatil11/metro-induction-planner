#!/usr/bin/env bash
# Start the Metro Induction Planner on Mac / Linux:  ./start.sh
cd "$(dirname "$0")/backend"
[ -d .venv ] || { echo "Setting things up for the first time, please wait..."; python3 -m venv .venv; }
source .venv/bin/activate
python -m pip install -q -r requirements.txt
python run.py "$@"
