"""
One command to start everything:   python run.py
Options:  --reset   throw away all data and start fresh demo data
          --port N  use a different port (default 8000)
"""
import argparse
import os
import threading
import webbrowser

import uvicorn

from app.config import DB_PATH
from app.config import IS_PRODUCTION

parser = argparse.ArgumentParser()
parser.add_argument("--reset", action="store_true")
parser.add_argument("--port", type=int, default=None, help="Port to use (defaults to the PORT environment variable or 8000).")
parser.add_argument("--no-browser", action="store_true", help="Do not open a browser window (used by hosted deployments).")
args = parser.parse_args()

if args.reset and IS_PRODUCTION:
    parser.error("--reset is disabled in production.")

if args.reset and DB_PATH.exists():
    DB_PATH.unlink()
    print("Old data deleted. Fresh demo data will be created.")

port = args.port or int(os.environ.get("PORT", "8000"))
host = os.environ.get("HOST", "0.0.0.0" if IS_PRODUCTION else "127.0.0.1")
url = f"http://localhost:{port}"
print(f"\n  Metro Induction Planner is starting on {host}:{port}\n  (press Ctrl+C to stop)\n")
if not args.no_browser and not IS_PRODUCTION:
    threading.Timer(2.0, lambda: webbrowser.open(url)).start()
uvicorn.run("app.main:app", host=host, port=port, log_level="warning")
